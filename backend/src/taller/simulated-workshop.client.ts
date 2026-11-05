import { In, Not } from 'typeorm';
import type { Repository } from 'typeorm';
import { RelacionesService } from '../relaciones/relaciones.service.js';
import type { RelationRecord } from '../relaciones/relaciones.service.js';
import { bogotaToday } from '../relaciones/warranty.js';
import type { WorkshopOrder } from './entities/workshop-order.entity.js';
import { SIM_RULES, SIM_SERVICES, SIM_SITES, SIM_TAMPERING } from './simulated-workshop.data.js';
import type { SimSite } from './simulated-workshop.data.js';
import { WorkshopBusinessError } from './workshop.types.js';
import type { Availability, BookingRequest, Reservation, ReserveRequest, RouteRequest, Routing, Site, Tampering, TamperingRequest, WarrantyResultRequest, WorkOrder, WorkshopClient } from './workshop.types.js';

const CLOSED = ['entregada', 'cancelada'];
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 14;
const HOLD_MINUTES = 10;

interface SimRouting { relationId: string; site: SimSite; warranty: boolean }
interface SimHold { relationId: string; site: string; slot: string; expiresAt: number }

/**
 * Taller SIMULADO para desarrollo y pruebas (decisiones 130 y 133): las mismas herramientas, campos y mensajes de error
 * del taller real (enrutar, disponibilidad por rango, reservar 10 minutos y agendar con los ids). Lee la relación como
 * lo haría el taller con `consultar_relacion` y toma las órdenes abiertas y los cupos ocupados de la copia local
 * (`ordenes_taller`). Nunca se usa si TALLER_MCP_URL está configurada.
 */
export class SimulatedWorkshopClient implements WorkshopClient {
  readonly source = 'simulado' as const;
  private readonly results = new Map<string, unknown>();
  private readonly routings = new Map<string, SimRouting>();
  private readonly holds = new Map<string, SimHold>();
  private counters = { routing: 0, hold: 0 };

  constructor(
    private readonly relations: RelacionesService,
    private readonly orders: Repository<WorkshopOrder>,
    private readonly now: () => number = Date.now,
  ) {}

  route(request: RouteRequest): Promise<Routing> {
    return this.once(request.id_mensaje, async () => {
      const relation = await this.relationOrFail(request.id_relacion);
      const text = normalize([request.motivo_reclamo, ...request.mensajes_cliente].join(' '));
      const rule = SIM_RULES.find((candidate) => candidate.pattern.test(text));
      const skus = rule ? [rule.base, ...(rule.extra ?? []).filter(([pattern]) => pattern.test(text)).map(([, sku]) => sku)] : ['REV-GENERAL'];
      const especialidad = rule?.especialidad ?? 'mantenimiento_general';
      const site = SIM_SITES.find((candidate) => candidate.especialidades.includes(especialidad)) ?? SIM_SITES[0]!;
      const id = `PD-${String(++this.counters.routing).padStart(4, '0')}`;
      this.routings.set(id, { relationId: relation.idRelacion, site, warranty: request.por_garantia });
      return routingOf(id, relation, request, { especialidad, skus, site, clear: Boolean(rule) });
    });
  }

  async availability(siteRef: string, from: string, to: string): Promise<Availability> {
    const site = siteOrFail(siteRef);
    if (!DATE_FORMAT.test(from) || !DATE_FORMAT.test(to)) throw new WorkshopBusinessError('Las fechas deben tener el formato AAAA-MM-DD');
    const days = Math.round((Date.parse(`${to}T12:00:00-05:00`) - Date.parse(`${from}T12:00:00-05:00`)) / DAY_MS) + 1;
    if (days < 1 || days > MAX_RANGE_DAYS) throw new WorkshopBusinessError('El rango debe ser de 1 a 14 días (desde ≤ hasta)');
    const franjas: Availability['franjas'] = [];
    for (let offset = 0; offset < days; offset++) {
      franjas.push(...(await this.freeSlots(site, bogotaToday(new Date(Date.parse(`${from}T12:00:00-05:00`) + offset * DAY_MS)))));
    }
    return { desde: from, hasta: to, cupo_por_franja: 1, franjas };
  }

  reserve(request: ReserveRequest): Promise<Reservation> {
    return this.once(request.id_mensaje, async () => {
      await this.relationOrFail(request.id_relacion);
      const site = siteOrFail(request.taller);
      const free = await this.freeSlots(site, request.fecha_hora.slice(0, 10), request.id_relacion);
      if (!free.some((slot) => slot.inicio === request.fecha_hora)) throw new WorkshopBusinessError('Esa franja ya está llena: elija otra con consultar_disponibilidad');
      // Una reserva por vehículo: la anterior se libera sola.
      for (const [id, hold] of this.holds) if (hold.relationId === request.id_relacion) this.holds.delete(id);
      const id = `RS-${String(++this.counters.hold).padStart(4, '0')}`;
      const expiresAt = this.now() + HOLD_MINUTES * 60_000;
      this.holds.set(id, { relationId: request.id_relacion, site: site.codigo, slot: request.fecha_hora, expiresAt });
      return { id_reserva: id, fecha_hora: request.fecha_hora, vence_en: new Date(expiresAt).toISOString(), minutos_vigencia: HOLD_MINUTES, taller: toSite(site) };
    });
  }

  book(request: BookingRequest): Promise<WorkOrder> {
    return this.once(request.id_mensaje, async () => {
      await this.relationOrFail(request.id_relacion);
      const open = await this.orders.findOneBy({ relationId: request.id_relacion, status: Not(In(CLOSED)) });
      if (open) throw new WorkshopBusinessError(`El vehículo ya tiene la orden ${open.code} abierta`);
      const routing = this.routings.get(request.id_prediagnostico);
      if (!routing || routing.relationId !== request.id_relacion) throw new WorkshopBusinessError(`No existe el prediagnóstico ${request.id_prediagnostico.slice(0, 20)} de ese vehículo`);
      const hold = this.holds.get(request.id_reserva);
      if (!hold || hold.relationId !== request.id_relacion || hold.expiresAt < this.now()) {
        throw new WorkshopBusinessError('La reserva no existe o venció: aparte la hora de nuevo con reservar_franja');
      }
      this.holds.delete(request.id_reserva);
      return this.order(siteOrFail(hold.site), hold.slot, routing.warranty);
    });
  }

  async listSites(): Promise<Site[]> {
    return SIM_SITES.map(toSite);
  }

  async openOrders(relationId: string): Promise<WorkOrder[]> {
    const rows = await this.orders.findBy({ relationId, status: Not(In(CLOSED)) });
    return rows.map((row) => {
      const site = SIM_SITES.find((candidate) => candidate.codigo === row.siteCode);
      return { codigo: row.code, estado: row.status, por_garantia: row.warrantyClaim, fecha_cita: row.scheduledAt.toISOString(), ...(site ? { sede: toSite(site) } : {}) };
    });
  }

  /** Resultados de garantía registrados (para desarrollo y pruebas), por código de orden. */
  readonly warrantyResults = new Map<string, WarrantyResultRequest>();

  async checkTampering(request: TamperingRequest): Promise<Tampering> {
    const eventos = SIM_TAMPERING.filter((t) => t.vin === request.vin && t.especialidad === request.especialidad)
      .map(({ fecha, tipo, especialidad, sku }) => ({ fecha, tipo, especialidad, ...(sku ? { sku } : {}) }));
    return { manipulado: eventos.length > 0, eventos };
  }

  async registerWarrantyResult(request: WarrantyResultRequest): Promise<void> {
    this.warrantyResults.set(request.codigo, request);
  }

  /** Idempotencia por id_mensaje, como el taller real: el mismo id devuelve el mismo resultado sin repetir el cambio. */
  private async once<T>(messageId: string, action: () => Promise<T>): Promise<T> {
    if (this.results.has(messageId)) return this.results.get(messageId) as T;
    const result = await action();
    this.results.set(messageId, result);
    return result;
  }

  private async order(site: SimSite, slot: string, warranty: boolean): Promise<WorkOrder> {
    return {
      codigo: await this.nextCode(),
      estado: 'agendada',
      sede: toSite(site),
      fecha_cita: slot,
      por_garantia: warranty,
      siguiente_paso: { responsable: 'mecanico', descripcion: 'Cita agendada: cuando llegue el vehículo, un mecánico de la sede toma la orden' },
      acciones_disponibles: ['tomar_orden', 'cancelar_cita', 'estado_orden'],
    };
  }

  /** Franjas libres de un día: horario de la sede, sin las ocupadas por órdenes ni las apartadas por OTRO vehículo. */
  private async freeSlots(site: SimSite, date: string, forRelation?: string): Promise<Availability['franjas']> {
    const weekday = new Date(`${date}T12:00:00-05:00`).getUTCDay() || 7;
    if (!site.dias.includes(weekday) || date < bogotaToday()) return [];
    const taken = await this.takenSlots(site.codigo, forRelation);
    const nowHour = date === bogotaToday() ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false }).format(new Date())) : -1;
    const franjas: Availability['franjas'] = [];
    for (let hour = site.apertura; hour < site.cierre; hour++) {
      const inicio = `${date}T${String(hour).padStart(2, '0')}:00:00-05:00`;
      // Agenda "llena" de mentiras para que no todas las horas aparezcan libres (determinista: día + hora).
      const busy = (Number(date.slice(8)) + hour) % 4 === 0 || taken.has(new Date(inicio).getTime());
      if (hour > nowHour && !busy) franjas.push({ inicio, libres: 1 });
    }
    return franjas;
  }

  private async relationOrFail(relationId: string): Promise<RelationRecord> {
    const relation = await this.relations.consult(relationId);
    if (!relation) throw new WorkshopBusinessError(`El concesionario no reconoce el id_relacion ${relationId.slice(0, 20)}`);
    return relation;
  }

  private async takenSlots(siteCode: string, forRelation?: string): Promise<Set<number>> {
    const rows = await this.orders.findBy({ siteCode, status: Not(In(CLOSED)) });
    const held = [...this.holds.values()].filter((h) => h.site === siteCode && h.expiresAt >= this.now() && h.relationId !== forRelation);
    return new Set([...rows.map((row) => row.scheduledAt.getTime()), ...held.map((h) => new Date(h.slot).getTime())]);
  }

  /** OT-0001, OT-0002…: sigue después de la última orden simulada guardada (sobrevive a un reinicio). */
  private async nextCode(): Promise<string> {
    const rows = await this.orders.findBy({ source: 'simulado' });
    const issued = [...this.results.values()].flatMap((r) => (r && typeof r === 'object' && 'codigo' in r ? [Number(String(r.codigo).slice(3))] : []));
    const last = Math.max(0, ...rows.map((row) => Number(/^OT-(\d+)$/.exec(row.code)?.[1] ?? 0)), ...issued);
    return `OT-${String(last + 1).padStart(4, '0')}`;
  }
}

interface RoutingParts { especialidad: string; skus: string[]; site: SimSite; clear: boolean }

function routingOf(id: string, relation: RelationRecord, request: RouteRequest, parts: RoutingParts): Routing {
  const { especialidad, skus, site, clear } = parts;
  const covered = relation.garantia.vigente && (relation.garantia.cubre ?? []).some((c) => especialidad.startsWith(c));
  return {
    id_prediagnostico: id,
    id_relacion: relation.idRelacion,
    vehiculo: vehicleText(relation),
    especialidad,
    servicios: skus,
    confianza: clear ? 0.8 : 0.3,
    resumen: clear ? `Apunta a ${especialidad.replace(/_/g, ' ')}.` : 'No hay una especialidad clara: conviene una revisión general en mantenimiento.',
    fuente: 'reglas',
    ruta: clear ? 'especializada' : 'revision_general',
    taller: toSite(site),
    motivo_decision: clear ? `Lo que cuenta el cliente apunta a ${especialidad.replace(/_/g, ' ')}: va directo a ${site.nombre}, la sede especialista.` : `No hay una especialidad clara: primero una revisión general en ${site.nombre}.`,
    por_garantia: request.por_garantia,
    garantia: { ...relation.garantia, aplica_probable: relation.garantia.vigente ? (covered ? true : null) : false, causa_probable: null },
    servicios_probables: skus.map((sku) => ({ sku, nombre: SIM_SERVICES[sku]!.nombre, precio_mano_obra: SIM_SERVICES[sku]!.precio })),
    sede_sugerida: toSite(site),
  };
}

function siteOrFail(ref: string): SimSite {
  const site = SIM_SITES.find((candidate) => candidate.codigo === ref || String(candidate.id) === ref);
  if (!site) throw new WorkshopBusinessError('La sede no existe o no está activa');
  return site;
}

function toSite(site: SimSite): Site {
  const hour = (value: number): string => `${String(value).padStart(2, '0')}:00`;
  return {
    id: site.id, codigo: site.codigo, nombre: site.nombre, activo: true,
    tipo: site.especialidades.includes('mantenimiento_general') ? 'mantenimiento' : 'especializado',
    especialidades: [...site.especialidades],
    ubicacion: { ciudad: 'Bogotá', direccion: site.direccion },
    horario: { dias: [...site.dias], apertura: hour(site.apertura), cierre: hour(site.cierre) },
  };
}

function vehicleText(relation: RelationRecord): string {
  const v = relation.cabeceraVin;
  return v ? `${v.marca} ${v.modelo} ${v.version} ${v.anio} (${v.carroceria}, ${v.puertas} puertas)` : `VIN ${relation.vin}`;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
