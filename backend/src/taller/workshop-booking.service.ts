import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SlotPick, WorkshopData } from '../chat/tools/workshop.js';
import { bogotaToday } from '../relaciones/warranty.js';
import { WorkshopOrder } from './entities/workshop-order.entity.js';
import { messageIdFor } from './workshop-session.store.js';
import type { WorkshopSession } from './workshop-session.store.js';
import { WorkshopSites, workshopError } from './workshop-sites.js';
import { acceptsBooking, clean, formatSlot, siteView } from './workshop-text.js';
import { WORKSHOP_CLIENT } from './workshop.types.js';
import { WorkshopBusinessError } from './workshop.types.js';
import type { Site, WorkOrder, WorkshopClient } from './workshop.types.js';

const MAX_SLOTS = 4;
const RANGE_DAYS = 14;
const MAX_DAYS_AHEAD = 60;
const DAY_MS = 86_400_000;
const HOLD_MINUTES = 10;
// Una hora apartada que vence en menos de esto se vuelve a apartar antes de agendar.
const HOLD_MARGIN_MS = 30_000;

/**
 * Horarios, horas apartadas y agenda en el taller (decisiones 131 y 133). Las horas salen SOLO de
 * `consultar_disponibilidad` (una llamada por rango); solo se aparta una hora que el taller ofreció en esta sesión, y se
 * agenda con el `id_prediagnostico` y el `id_reserva` del taller, con el cliente identificado y su «sí».
 */
@Injectable()
export class WorkshopBookingService {
  private readonly logger = new Logger(WorkshopBookingService.name);

  constructor(
    @Inject(WORKSHOP_CLIENT) private readonly workshop: WorkshopClient,
    private readonly siteList: WorkshopSites,
    @InjectRepository(WorkshopOrder) private readonly orders: Repository<WorkshopOrder>,
  ) {}

  async slots(state: WorkshopSession, siteArg: string | null, date: string | null, now = new Date()): Promise<WorkshopData> {
    const dateError = date === null ? null : checkDate(date, now);
    if (dateError) return { error: dateError };
    // Sin sede, la que decidió el taller: el historial solo guarda texto y el modelo no siempre tiene el código.
    const siteRef = siteArg ?? state.routing?.siteCode ?? null;
    if (!siteRef) return { error: 'Primero usa prediagnosticar_taller: el taller decide a qué sede va el carro.' };
    try {
      const site = await this.resolveSite(state, siteRef);
      if (!site) return { error: `El taller no tiene la sede «${clean(siteRef, 40)}». Usa el código que dio prediagnosticar_taller o listar_sedes_taller.` };
      const from = date ?? bogotaToday(new Date(now.getTime() + DAY_MS));
      const range = await this.workshop.availability(site.codigo, from, addDays(from, RANGE_DAYS - 1));
      const found = range.franjas.filter((f) => f.libres > 0).map((f) => f.inicio).sort((a, b) => Date.parse(a) - Date.parse(b)).slice(0, MAX_SLOTS);
      for (const slot of found) state.offered.add(key(site.codigo, slot));
      state.lastOffered = found.map((slot) => ({ siteCode: site.codigo, slot }));
      const askedDayEmpty = date !== null && found.length > 0 && !found.some((slot) => slot.startsWith(date));
      return {
        sede: siteView(site),
        franjas: found.map((slot) => ({ fecha_hora: slot, texto: formatSlot(slot) })),
        ...(askedDayEmpty ? { aviso: `El ${date} no hay horas libres en esa sede: estas son las siguientes. Díselo al cliente.` } : {}),
        ...(found.length === 0 ? { aviso: 'El taller no tiene horas libres en las próximas dos semanas: ofrece otra fecha.' } : {}),
      };
    } catch (error) {
      return workshopError(error);
    }
  }

  /** Aparta en el taller la hora que eligió el cliente mientras confirma (`reservar_franja`, 10 minutos). */
  async hold(state: WorkshopSession, pick: SlotPick, now = Date.now()): Promise<WorkshopData> {
    const chosen = pickSlot(state, pick);
    if ('error' in chosen) return chosen;
    const { siteRef, slot } = chosen;
    const blocked = await this.checkStep(state, siteRef, slot);
    if ('error' in blocked) return blocked;
    const { site } = blocked;
    const slotKey = key(site.codigo, slot);
    // Una reserva vencida no se reutiliza: el mismo id_mensaje devolvería la misma reserva ya vencida.
    if (state.hold && key(state.hold.siteCode, state.hold.slot) === slotKey && state.hold.expiresAt - HOLD_MARGIN_MS < now) state.messageIds.delete(`reservar|${slotKey}`);
    try {
      const reservation = await this.workshop.reserve({
        taller: site.codigo, fecha_hora: slot, id_relacion: state.relation!.idRelacion, id_mensaje: messageIdFor(state, `reservar|${slotKey}`, 'reservar'),
      });
      const expiresAt = Date.parse(reservation.vence_en) || now + HOLD_MINUTES * 60_000;
      state.hold = { id: reservation.id_reserva, siteCode: site.codigo, slot, expiresAt };
      this.logger.log(`Hora apartada ${clean(reservation.id_reserva, 20)} en ${site.codigo}`);
      return {
        apartada: true, sede: siteView(site), fecha_hora: slot, fecha: formatSlot(slot), minutos: reservation.minutos_vigencia ?? HOLD_MINUTES,
        siguiente_paso: 'Resume sede, dirección, fecha y hora y pregúntale al cliente si confirma. Con su «sí» llama agendar_cita_taller (sin argumentos: agenda esta hora apartada).',
      };
    } catch (error) {
      if (error instanceof WorkshopBusinessError && /llena/i.test(error.message)) {
        state.offered.delete(slotKey);
        return { error: `El taller respondió: «${clean(error.message, 200)}». Vuelve a consultar_horarios_taller y ofrécele otras horas.` };
      }
      return workshopError(error);
    }
  }

  async book(state: WorkshopSession, pick: SlotPick | null, userMessage: string, now = Date.now()): Promise<WorkshopData> {
    if (state.booked) return { ...state.booked, aviso: 'Esta cita ya estaba agendada en esta conversación.' };
    const chosen = pick ? pickSlot(state, pick) : state.hold ? { siteRef: state.hold.siteCode, slot: state.hold.slot } : { error: 'No hay una hora apartada: primero ofrécele horas con consultar_horarios_taller y aparta la que elija con apartar_hora_taller.' };
    if ('error' in chosen) return chosen;
    const { siteRef, slot } = chosen;
    const blocked = await this.checkStep(state, siteRef, slot);
    if ('error' in blocked) return blocked;
    if (!acceptsBooking(userMessage)) {
      return { error: 'El cliente todavía no confirmó. Muéstrale el resumen (sede, dirección, fecha y hora) y pídele que responda «sí» para agendar.', requiere_confirmacion: true };
    }
    const slotKey = key(blocked.site.codigo, slot);
    const held = state.hold && key(state.hold.siteCode, state.hold.slot) === slotKey && state.hold.expiresAt - HOLD_MARGIN_MS > now;
    if (!held) {
      // Si el modelo no apartó la hora (o la reserva venció), se aparta ahora: el taller agenda solo con id_reserva.
      const result = await this.hold(state, { site: siteRef, slot }, now);
      if (typeof result.error === 'string') return result;
    }
    return this.submit(state, blocked.site, slot);
  }

  /** Lo que exigen apartar y agendar: cliente identificado, decisión del taller y una hora que el taller ofreció. */
  private async checkStep(state: WorkshopSession, siteRef: string, slot: string): Promise<{ site: Site } | { error: string }> {
    if (!state.relation) return { error: 'Primero identifica al cliente con identificar_cliente_taller (número de documento y VIN).' };
    if (!state.routing) return { error: 'Primero usa prediagnosticar_taller con lo que le pasa al carro: el taller decide la sede.' };
    const site = await this.resolveSite(state, siteRef).catch(() => null);
    if (!site || !state.offered.has(key(site.codigo, slot))) {
      return { error: 'Esa hora no la ofreció el taller en esta conversación. Usa consultar_horarios_taller y una fecha_hora exacta de sus franjas.' };
    }
    return { site };
  }

  private async submit(state: WorkshopSession, site: Site, slot: string): Promise<WorkshopData> {
    const relation = state.relation!;
    const hold = state.hold!;
    try {
      const order = await this.workshop.book({
        id_relacion: relation.idRelacion, id_prediagnostico: state.routing!.id, id_reserva: hold.id,
        id_mensaje: messageIdFor(state, `agendar|${hold.id}`, 'agendar'),
      });
      return await this.finish(state, site, slot, order);
    } catch (error) {
      const recovered = await this.recoverRetry(state, site, slot, error);
      return recovered ? await this.finish(state, site, slot, recovered) : workshopError(error);
    }
  }

  private async finish(state: WorkshopSession, site: Site, slot: string, order: WorkOrder): Promise<WorkshopData> {
    const relation = state.relation!;
    const full: WorkOrder = { ...order, sede: order.sede ?? site, fecha_cita: order.fecha_cita ?? slot };
    await this.saveCopy(full, relation.idRelacion);
    state.hold = undefined;
    this.logger.log(`Cita agendada ${clean(full.codigo, 20)} en ${full.sede!.codigo}`);
    state.booked = bookedView(full, relation.vehicle, relation.plate);
    return state.booked;
  }

  /**
   * Si un reintento choca con la primera llamada, el taller responde «El vehículo ya tiene la orden … abierta»; según
   * el taller, se consulta `listar_ordenes`: si la orden abierta es la de esta sede y esta hora, la cita sí quedó.
   */
  private async recoverRetry(state: WorkshopSession, site: Site, slot: string, error: unknown): Promise<WorkOrder | null> {
    if (!(error instanceof WorkshopBusinessError) || !/ya tiene la orden/i.test(error.message)) return null;
    try {
      const open = await this.workshop.openOrders(state.relation!.idRelacion);
      const at = new Date(slot).getTime();
      return open.find((o) => o.sede?.codigo.toUpperCase() === site.codigo.toUpperCase() && o.fecha_cita !== undefined && new Date(o.fecha_cita).getTime() === at) ?? null;
    } catch (lookupError) {
      this.logger.warn(`No se pudo revisar las órdenes abiertas tras un reintento: ${lookupError instanceof Error ? lookupError.name : 'error'}`);
      return null;
    }
  }

  private async resolveSite(state: WorkshopSession, ref: string): Promise<Site | null> {
    const known = state.sites.get(ref.trim().toUpperCase());
    if (known) return known;
    const site = await this.siteList.find(ref);
    if (site) state.sites.set(site.codigo.toUpperCase(), site);
    return site;
  }

  private async saveCopy(order: WorkOrder, relationId: string): Promise<void> {
    try {
      await this.orders.save(this.orders.create({
        code: order.codigo, relationId, siteCode: order.sede!.codigo, siteName: order.sede!.nombre.slice(0, 120),
        scheduledAt: new Date(order.fecha_cita!), status: order.estado, warrantyClaim: order.por_garantia, source: this.workshop.source,
      }));
    } catch (error) {
      // La cita ya existe en el taller: no se le dice al cliente que falló, se registra para revisarlo.
      this.logger.error(`No se guardó la copia de la orden ${order.codigo}: ${error instanceof Error ? error.message : 'error'}`);
    }
  }
}

/** La hora elegida: por número de opción (de la última lista ofrecida) o por sede y fecha_hora exactas. */
function pickSlot(state: WorkshopSession, pick: SlotPick): { siteRef: string; slot: string } | { error: string } {
  if ('site' in pick) return { siteRef: pick.site, slot: pick.slot };
  const offered = state.lastOffered[pick.option - 1];
  if (!offered) return { error: `La opción ${pick.option} no está en la última lista de horas. Usa consultar_horarios_taller y ofrécele las horas de nuevo.` };
  return { siteRef: offered.siteCode, slot: offered.slot };
}

function key(siteCode: string, slot: string): string {
  return `${siteCode.toUpperCase()}|${slot}`;
}

function addDays(date: string, days: number): string {
  return bogotaToday(new Date(Date.parse(`${date}T12:00:00-05:00`) + days * DAY_MS));
}

function checkDate(date: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00-05:00`).getTime())) return 'La fecha debe ser AAAA-MM-DD.';
  if (date <= bogotaToday(now)) return 'El taller agenda desde mañana: usa una fecha futura.';
  if (date > bogotaToday(new Date(now.getTime() + MAX_DAYS_AHEAD * DAY_MS))) return 'El taller agenda hasta 60 días adelante.';
  return null;
}

function bookedView(order: WorkOrder, vehicle: string, plate: string): WorkshopData {
  return {
    agendada: true,
    orden: clean(order.codigo, 20),
    estado: clean(order.estado, 30).replace(/_/g, ' '),
    sede: siteView(order.sede!),
    fecha: formatSlot(order.fecha_cita!),
    vehiculo: vehicle,
    placa: plate,
    ...(order.por_garantia ? { por_garantia: true } : {}),
    ...(order.siguiente_paso ? { siguiente_paso: clean(order.siguiente_paso.descripcion, 200) } : {}),
    recordatorio: 'Llevar el carro a esa hora con la tarjeta de propiedad.',
  };
}
