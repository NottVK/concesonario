import { BadGatewayException, ConflictException, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { ContractSkillRegistry } from '../a2a/inbound/contract-skills.js';
import type { ContractHandler, ContractReply, ContractRequest } from '../a2a/inbound/contract-skills.js';
import { normalizeText } from '../a2a/audit/redact.js';
import type { A2aContractSkill } from '../a2a/a2a.config.js';
import { redactDocuments } from '../chat/text/redact-documents.js';
import { FichasVinService } from '../fichas-vin/fichas-vin.service.js';
import type { FichaVinView } from '../fichas-vin/fichas-vin.service.js';
import { isValidVin, normalizeVin } from '../fichas-vin/vin.js';
import { WarrantyStatus } from './entities/caso-garantia.entity.js';
import { GarantiasService } from './garantias.service.js';
import { SERVICE_NAMES } from './services/types.js';
import { loadWarrantyPolicy } from './warranty-policy.js';

const { taller, tienda } = SERVICE_NAMES;

/** Quién puede usar cada habilidad (por el NOMBRE del bot al que pertenece la key). `null` = cualquier bot con key. */
const ALLOWED_BOTS: Record<A2aContractSkill, readonly string[] | null> = {
  consultar_ficha_vin: null,
  consultar_vehiculo: [taller, tienda],
  consultar_caso: [taller],
  informar_decision_garantia: [taller],
};

const STATE_NAME: Record<WarrantyStatus, string> = {
  [WarrantyStatus.IDENTIFIED]: 'identificado',
  [WarrantyStatus.EXPIRED]: 'garantia_vencida',
  [WarrantyStatus.PENDING_MECHANIC]: 'pendiente_mecanico',
  [WarrantyStatus.ACCEPTED]: 'garantia_aceptada',
  [WarrantyStatus.REJECTED]: 'garantia_rechazada',
};

const MAX_REASON = 300;
const INVALID: ContractReply = { http: 400, status: 'rejected', code: 'INVALID_REQUEST', message: 'Falta un campo o el formato es incorrecto.' };
const NOT_FOUND: ContractReply = { http: 404, status: 'rejected', code: 'NOT_FOUND', message: 'No existe ese registro.' };
const UNAVAILABLE: ContractReply = { http: 503, status: 'error', code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible, intenta luego.' };

const vinParams = z.strictObject({ vin: z.string().max(40) });
const idParams = z.strictObject({ id: z.union([z.number().int().positive().max(2_000_000_000), z.string().regex(/^\d{1,9}$/).transform(Number)]) });
const caseParams = z.strictObject({ caso_id: z.string().uuid() });
const decisionParams = z.strictObject({ caso_id: z.string().uuid(), aceptada: z.boolean(), motivo: z.string().min(1).max(1_000) });

/** El motivo lo escribe otro sistema y se le muestra al cliente: texto plano, sin enlaces ni documentos, y corto. */
function cleanReason(text: string): string {
  return Array.from(redactDocuments(normalizeText(text)).replace(/https?:\/\/\S+/gi, '[enlace]')).slice(0, MAX_REASON).join('');
}

const fichaData = (f: FichaVinView): object => ({ marca: f.brand, modelo: f.model, anio: f.year, version: f.version, carroceria: f.bodyType, puertas: f.doors, combustible: f.fuel, transmision: f.transmission });
const fichaText = (f: FichaVinView): string => `${f.brand} ${f.model} ${f.year}, ${f.bodyType} de ${f.doors} puertas.`;

/**
 * Habilidades del contrato de integración v0.1 que ofrece el Concesionario. Se registran en el canal A2A al arrancar.
 * Solo viajan ids y VIN: nunca el documento ni el nombre del cliente. La decisión de la garantía la toma el código y,
 * al final, el mecánico del Taller; lo que llega de otro sistema es dato validado, nunca una orden.
 */
@Injectable()
export class WarrantyContractSkills implements OnModuleInit {
  constructor(
    private readonly registry: ContractSkillRegistry,
    private readonly garantias: GarantiasService,
    private readonly fichas: FichasVinService,
  ) {}

  onModuleInit(): void {
    const handlers: Record<A2aContractSkill, ContractHandler> = {
      consultar_ficha_vin: (req) => this.fichaByVin(req),
      consultar_vehiculo: (req) => this.vehicle(req),
      consultar_caso: (req) => this.caseStatus(req),
      informar_decision_garantia: (req) => this.decision(req),
    };
    for (const skill of Object.keys(handlers) as A2aContractSkill[]) {
      this.registry.register(skill, async (req) => (this.isAllowed(skill, req.bot.name) ? handlers[skill](req) : FORBIDDEN));
    }
  }

  private isAllowed(skill: A2aContractSkill, botName: string): boolean {
    const allowed = ALLOWED_BOTS[skill];
    return allowed === null || allowed.includes(botName);
  }

  private async fichaByVin(req: ContractRequest): Promise<ContractReply> {
    const params = vinParams.safeParse(req.params);
    if (!params.success) return INVALID;
    const vin = normalizeVin(params.data.vin);
    if (!isValidVin(vin)) return { http: 400, status: 'rejected', code: 'INVALID_VIN', message: 'El VIN debe tener 17 caracteres, sin I, O ni Q.' };
    const ficha = await this.fichas.find(vin).catch(() => null);
    // Un VIN sin ficha o de un vehículo vendido responde igual: no se puede recorrer el registro.
    return ficha ? { http: 200, status: 'completed', code: null, message: 'Listo', answer: fichaText(ficha), data: fichaData(ficha) } : NOT_FOUND;
  }

  private async vehicle(req: ContractRequest): Promise<ContractReply> {
    const params = idParams.safeParse(req.params);
    if (!params.success) return INVALID;
    const owner = await this.garantias.ownerById(params.data.id);
    const ficha = owner ? await this.fichas.findOwned(owner.vin) : null;
    if (!owner || !ficha) return NOT_FOUND;
    const policy = loadWarrantyPolicy();
    const data = { id: owner.id, vin: owner.vin, ficha: fichaData(ficha), fecha_venta: owner.purchaseDate, garantia: { meses: policy.maxMonths, km: policy.maxKm } };
    return { http: 200, status: 'completed', code: null, message: 'Listo', answer: fichaText(ficha), data };
  }

  private async caseStatus(req: ContractRequest): Promise<ContractReply> {
    const params = caseParams.safeParse(req.params);
    if (!params.success) return INVALID;
    const state = await this.garantias.caseState(params.data.caso_id);
    if (state === null) return NOT_FOUND;
    return { http: 200, status: 'completed', code: null, message: 'Listo', answer: `El caso está en estado ${STATE_NAME[state]}.`, data: { caso_id: params.data.caso_id, estado: STATE_NAME[state] } };
  }

  private async decision(req: ContractRequest): Promise<ContractReply> {
    const params = decisionParams.safeParse(req.params);
    if (!params.success) return INVALID;
    const { caso_id: caseId, aceptada } = params.data;
    const state = await this.garantias.caseState(caseId);
    if (state === null) return NOT_FOUND;
    const wanted = aceptada ? WarrantyStatus.ACCEPTED : WarrantyStatus.REJECTED;
    if (state === WarrantyStatus.ACCEPTED || state === WarrantyStatus.REJECTED) {
      if (state !== wanted) return { http: 409, status: 'rejected', code: 'DECISION_ALREADY_REGISTERED', message: 'El caso ya tiene una decisión.' };
    } else if (state !== WarrantyStatus.PENDING_MECHANIC) {
      return { http: 409, status: 'rejected', code: 'CASE_NOT_PENDING', message: 'El caso no está pendiente de decisión del mecánico.' };
    }
    return this.register(caseId, aceptada, cleanReason(params.data.motivo));
  }

  private async register(caseId: string, accepted: boolean, reason: string): Promise<ContractReply> {
    try {
      await this.garantias.decide(caseId, null, accepted ? 'aceptar' : 'rechazar', reason, []);
    } catch (error) {
      // Pagos no respondió: es transitorio y el cobro lleva clave fija por caso, así que reintentar es seguro.
      if (error instanceof BadGatewayException) return UNAVAILABLE;
      if (error instanceof ConflictException) return { http: 409, status: 'rejected', code: 'CASE_NOT_PENDING', message: 'El caso no está pendiente de decisión del mecánico.' };
      throw error;
    }
    const answer = accepted ? 'Garantía aceptada. El costo lo asume el concesionario.' : 'Garantía rechazada.';
    return { http: 200, status: 'completed', code: null, message: 'Decisión registrada', answer, data: { caso_id: caseId, estado: STATE_NAME[wanted(accepted)] } };
  }
}

const FORBIDDEN: ContractReply = { http: 403, status: 'rejected', code: 'SKILL_NOT_ALLOWED', message: 'La key no tiene permiso para esa habilidad.' };
const wanted = (accepted: boolean): WarrantyStatus => (accepted ? WarrantyStatus.ACCEPTED : WarrantyStatus.REJECTED);
