import { BadGatewayException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CHAT_SESSION_IDLE_MS } from '../chat/chat.config.js';
import { ChatSession } from '../chat/entities/chat-session.entity.js';
import { AttemptLimiter } from '../chat/security/attempt-limiter.js';
import { hashToken } from '../chat/session/session.service.js';
import { redactDocuments } from '../chat/text/redact-documents.js';
import type { WarrantyView } from '../chat/tools/warranty.js';
import { normalizeVin, isValidVin } from '../fichas-vin/vin.js';
import { hashDocument, isValidDocument, normalizeDocument } from './document-hash.js';
import { CasoGarantia, WarrantyStatus } from './entities/caso-garantia.entity.js';
import { PropietarioVin } from './entities/propietario-vin.entity.js';
import { ServiceDirectory } from './services/directory.js';
import { acceptedView, expiredView, IDENTIFIED, NEEDS_IDENTIFICATION, pendingView, rejectedView } from './warranty-messages.js';
import { checkExpiry, loadWarrantyPolicy } from './warranty-policy.js';

/** Mensaje ÚNICO para cualquier fallo de identificación: documento inexistente, VIN inexistente o que no coinciden. */
export const IDENTIFY_FAILED_MESSAGE = 'No pudimos verificar esos datos. Revisa el documento y el VIN e inténtalo de nuevo.';
const IDENTIFY_RATE_MESSAGE = 'Hiciste muchos intentos de identificación. Intenta de nuevo más tarde.';
const REVIEW_REASON = 'El cliente pidió revisión de una persona (garantía vencida por la política).';

/** Intentos de identificación por IP (todos cuentan): 5 por minuto y 15 por hora. */
const perMinute = new AttemptLimiter(5, 60_000);
const perHour = new AttemptLimiter(15, 3_600_000);

/** Solo para pruebas. */
export function resetIdentifyLimits(): void {
  perMinute.reset();
  perHour.reset();
}

@Injectable()
export class GarantiasService {
  private readonly logger = new Logger(GarantiasService.name);

  constructor(
    @InjectRepository(CasoGarantia) private readonly cases: Repository<CasoGarantia>,
    @InjectRepository(PropietarioVin) private readonly owners: Repository<PropietarioVin>,
    @InjectRepository(ChatSession) private readonly sessions: Repository<ChatSession>,
    private readonly services: ServiceDirectory,
  ) {}

  /**
   * Paso 1: verifica documento + VIN contra la tabla de propietarios y ata el caso a la sesión del chat. Devuelve el id
   * cliente-vehículo o null; el llamador responde SIEMPRE lo mismo si es null. El documento no se guarda ni se registra.
   */
  async identify(input: { sessionToken: string | undefined; document: string; vin: string; ip: string }): Promise<number | null> {
    if (!perMinute.tryConsume(input.ip) || !perHour.tryConsume(input.ip)) {
      throw new HttpException(IDENTIFY_RATE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
    const session = await this.activeSession(input.sessionToken);
    const document = normalizeDocument(input.document);
    const vin = normalizeVin(input.vin);
    if (!session || !isValidDocument(document) || !isValidVin(vin)) return null;
    const owner = await this.owners.findOneBy({ documentHash: hashDocument(document), vin });
    if (!owner) return null;
    await this.cases.save(this.cases.create({ ownerId: owner.id, sessionId: session.id }));
    return owner.id;
  }

  /** Pasos 2 a 4: la falla llega, el CÓDIGO decide (primer filtro) y solo si pasó consulta disponibilidad y agenda. */
  async report(sessionId: string, faultText: string, requestReview: boolean, now = new Date()): Promise<WarrantyView> {
    const current = await this.latestCase(sessionId);
    if (!current) return NEEDS_IDENTIFICATION;
    if (current.status === WarrantyStatus.EXPIRED && requestReview) return this.requestReview(current);
    if (current.status !== WarrantyStatus.IDENTIFIED) return this.viewOf(current);
    current.fault = redactDocuments(faultText).trim().slice(0, 500) || null;
    return this.evaluate(current, now);
  }

  async status(sessionId: string): Promise<WarrantyView> {
    const current = await this.latestCase(sessionId);
    return current ? this.viewOf(current) : NEEDS_IDENTIFICATION;
  }

  private async evaluate(kase: CasoGarantia, now: Date): Promise<WarrantyView> {
    const owner = await this.owners.findOneByOrFail({ id: kase.ownerId });
    const [taller, tienda] = await Promise.all([this.services.taller(), this.services.tienda()]);
    const [records, purchases] = await Promise.all([taller.consultarRegistros(owner.id), tienda.consultarCompras(owner.id)]);
    kase.unverified = !records.ok || !purchases.ok;
    kase.foreignChanges = (records.ok && records.value.some((r) => r.kind === 'third_party_change')) || (purchases.ok && purchases.value.some((p) => p.installedBy === 'third_party'));
    const kms = records.ok ? records.value.flatMap((r) => (r.km === null ? [] : [r.km])) : [];
    const verdict = checkExpiry(owner.purchaseDate, kms.length > 0 ? Math.max(...kms) : null, now, loadWarrantyPolicy());
    if (verdict.expired) {
      // Segundo filtro: NO se consulta disponibilidad ni se agenda.
      kase.status = WarrantyStatus.EXPIRED;
      kase.reason = verdict.reason;
      await this.cases.save(kase);
      return expiredView(verdict.reason);
    }
    await this.bookProvisionalAppointment(kase, taller);
    kase.status = WarrantyStatus.PENDING_MECHANIC;
    await this.cases.save(kase);
    return this.viewOf(kase);
  }

  /** Segundo filtro (solo si pasó el primero): primer horario libre y cita con clave de idempotencia fija por caso. */
  private async bookProvisionalAppointment(kase: CasoGarantia, taller: Awaited<ReturnType<ServiceDirectory['taller']>>): Promise<void> {
    const slots = await taller.consultarDisponibilidad();
    const slot = slots.ok ? slots.value[0] : undefined;
    const booked = slot ? await taller.agendarCita(kase.ownerId, slot, `cita-${kase.id}`) : null;
    if (booked?.ok) {
      kase.appointmentId = booked.value.appointmentId;
      kase.appointmentAt = new Date(booked.value.start);
    } else {
      kase.unverified = true;
    }
  }

  private async requestReview(kase: CasoGarantia): Promise<WarrantyView> {
    kase.status = WarrantyStatus.PENDING_MECHANIC;
    kase.reason = `${kase.reason ?? ''} ${REVIEW_REASON}`.trim().slice(0, 500);
    await this.cases.save(kase);
    return pendingView(null, { unverified: false, review: true });
  }

  /** Paso 5: decisión del mecánico. Aceptar cobra a Pagos con una Idempotency-Key fija por caso; repetir no duplica. */
  async decide(caseId: string, mechanicId: number, action: 'aceptar' | 'rechazar', reason: string | undefined, parts: string[] | undefined): Promise<WarrantyView> {
    const kase = await this.cases.findOneBy({ id: caseId });
    if (!kase) throw new NotFoundException('No existe ese caso de garantía');
    const wanted = action === 'aceptar' ? WarrantyStatus.ACCEPTED : WarrantyStatus.REJECTED;
    if (kase.status === wanted) return this.viewOf(kase);
    if (kase.status !== WarrantyStatus.PENDING_MECHANIC) throw new ConflictException('El caso no está pendiente de decisión del mecánico');
    if (action === 'rechazar') return this.finish(kase, mechanicId, { status: wanted, reason: reason ?? '' });
    const charge = await (await this.services.pagos()).registrarCobroGarantia({ ownerId: kase.ownerId, caseId: kase.id, idempotencyKey: `garantia-${kase.id}` });
    if (!charge.ok) throw new BadGatewayException('Pagos no respondió; el caso sigue pendiente. Intenta aceptar de nuevo (no se duplicará el cobro).');
    return this.finish(kase, mechanicId, { status: wanted, chargeRef: charge.value.chargeRef, parts: parts ?? [] });
  }

  private async finish(kase: CasoGarantia, mechanicId: number, patch: Partial<CasoGarantia>): Promise<WarrantyView> {
    Object.assign(kase, patch, { decidedBy: mechanicId, decidedAt: new Date() });
    await this.cases.save(kase);
    this.logger.log(`Garantía ${kase.id}: ${kase.status} por el usuario ${mechanicId}`);
    return this.viewOf(kase);
  }

  /** Lista para el mecánico (sin documentos; el VIN sí, para que vea el vehículo). */
  async list(status: WarrantyStatus): Promise<(CasoGarantia & { vin: string })[]> {
    const rows = await this.cases.find({ where: { status }, order: { createdAt: 'ASC' }, take: 100 });
    const owners = await this.owners.findBy({ id: In(rows.map((row) => row.ownerId)) });
    const vinOf = new Map<number, string>(owners.map((owner) => [owner.id, owner.vin]));
    return rows.map((row) => Object.assign(row, { vin: vinOf.get(row.ownerId) ?? '' }));
  }

  private viewOf(kase: CasoGarantia): WarrantyView {
    switch (kase.status) {
      case WarrantyStatus.IDENTIFIED:
        return IDENTIFIED;
      case WarrantyStatus.EXPIRED:
        return expiredView(kase.reason ?? 'La garantía está vencida.');
      case WarrantyStatus.PENDING_MECHANIC:
        return pendingView(kase.appointmentAt?.toISOString() ?? null, { unverified: kase.unverified, review: kase.appointmentAt === null && kase.reason !== null });
      case WarrantyStatus.ACCEPTED:
        return acceptedView(kase.parts);
      case WarrantyStatus.REJECTED:
        return rejectedView(kase.reason ?? 'Sin motivo registrado.');
    }
  }

  private latestCase(sessionId: string): Promise<CasoGarantia | null> {
    return this.cases.findOne({ where: { sessionId }, order: { createdAt: 'DESC' } });
  }

  private async activeSession(token: string | undefined): Promise<ChatSession | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await this.sessions.findOneBy({ tokenHash: hashToken(token) });
    return session && Date.now() - session.lastActivityAt.getTime() < CHAT_SESSION_IDLE_MS ? session : null;
  }
}
