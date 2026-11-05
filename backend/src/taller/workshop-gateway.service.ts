import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SlotPick, WorkshopData, WorkshopGateway } from '../chat/tools/workshop.js';
import { RelacionesService } from '../relaciones/relaciones.service.js';
import type { RelationSummary } from '../relaciones/relaciones.service.js';
import { pickSite } from './site-routing.js';
import { WorkshopBookingService } from './workshop-booking.service.js';
import { messageIdFor, WorkshopSessionStore } from './workshop-session.store.js';
import type { WorkshopSession } from './workshop-session.store.js';
import { WorkshopSites, workshopError } from './workshop-sites.js';
import { claimsWarranty, clean, customerWords, extractCedula, extractVin, formatPesos, redactNumbers, siteView, symptomText, wantsWorkshop } from './workshop-text.js';
import { readStructure } from '../vin/vin-structure.js';
import { WORKSHOP_CLIENT } from './workshop.types.js';
import type { Prediagnosis, Routing, Site, WorkshopClient } from './workshop.types.js';

const MAX_ID_ATTEMPTS = 3;
const MAX_SYMPTOMS = 8;
const MAX_CUSTOMER_WORDS = 4;

/**
 * Lo que el chat puede hacer con el taller (decisiones 131 y 133): identificar al cliente, pedirle al bot del taller que
 * decida a qué sede va (`enrutar_garantia`), ver sedes y horarios, apartar una hora y agendar. El ORDEN lo decide el
 * modelo; aquí solo se valida cada paso y se arma lo que el modelo ve.
 */
const ESTIMATE_NOTE = 'Es solo una estimación del taller: no le prometas al cliente que la garantía aplica. Lo decide el mecánico al revisar el carro y lo valida el concesionario.';
@Injectable()
export class WorkshopGatewayService implements WorkshopGateway {
  private readonly logger = new Logger(WorkshopGatewayService.name);

  constructor(
    @Inject(WORKSHOP_CLIENT) private readonly workshop: WorkshopClient,
    private readonly relations: RelacionesService,
    private readonly store: WorkshopSessionStore,
    private readonly siteList: WorkshopSites,
    private readonly booking: WorkshopBookingService,
  ) {}

  capture(sessionId: string, message: string): string {
    const cedula = extractCedula(message);
    const vin = extractVin(message);
    const current = this.store.get(sessionId);
    // Solo abre el taller si el cliente habla del taller o escribe cédula y VIN juntos. Un VIN solo lo responde la ficha
    // del VIN (decisión 129) y una cédula suelta la tapa la redacción normal del historial.
    const opens = wantsWorkshop(message) || (cedula !== null && vin !== null);
    if (!current && !opens) return message;
    const state = current ?? this.store.ensure(sessionId);
    if (cedula) state.cedula = cedula;
    if (vin) state.vin = vin;
    const words = state.diagnosed ? null : customerWords(message);
    if (words && !state.customerWords.includes(words)) state.customerWords = [...state.customerWords, words].slice(-MAX_CUSTOMER_WORDS);
    return redactNumbers(message);
  }

  isActive(sessionId: string): boolean {
    return this.store.get(sessionId) !== undefined;
  }

  async identify(sessionId: string): Promise<WorkshopData> {
    const state = this.store.ensure(sessionId);
    if (state.relation) return identified(state.relation, state);
    if (state.attempts >= MAX_ID_ATTEMPTS) return { error: 'Ya hubo 3 intentos sin éxito: por seguridad no se puede seguir. Pide que se comunique con un asesor.' };
    if (!state.cedula || !state.vin) return missingId(state);
    const relation = await this.relations.identify(state.cedula, state.vin);
    state.cedula = undefined;
    state.vin = undefined;
    if (!relation) {
      state.attempts += 1;
      return { error: 'No hay un vehículo con ese número de documento y ese VIN. Pide con amabilidad que revise los dos datos y los escriba de nuevo en un mensaje.' };
    }
    state.relation = relation;
    return identified(relation, state);
  }

  async prediagnose(sessionId: string, symptoms: string[]): Promise<WorkshopData> {
    const state = this.store.ensure(sessionId);
    if (!state.relation) return { error: 'Primero identifica al cliente con identificar_cliente_taller (número de documento y VIN).' };
    addSymptoms(state, symptoms);
    if (state.symptoms.length === 0 && state.customerWords.length === 0) return { error: 'Pregúntale al cliente qué le pasa al carro o a qué viene al taller.' };
    // Primero las palabras del cliente: el taller las entiende mejor que el resumen del modelo.
    const messages = [...new Set([...state.customerWords, ...state.symptoms])].slice(0, MAX_SYMPTOMS);
    const reason = messages.join(' ').slice(0, 300);
    const { relation } = state;
    try {
      const routing = await this.workshop.route({
        id_relacion: relation.idRelacion, vin: relation.vin, por_garantia: claimsWarranty(messages), motivo_reclamo: reason,
        mensajes_cliente: messages, kilometraje: relation.mileage, id_mensaje: messageIdFor(state, `enrutar|${reason}`, 'enrutar'),
      });
      state.symptoms = messages;
      state.diagnosed = true;
      return await this.routingView(state, routing);
    } catch (error) {
      return workshopError(error);
    }
  }

  async sites(): Promise<WorkshopData> {
    try {
      return { sedes: (await this.siteList.list()).filter((site) => site.activo !== false).map(siteView) };
    } catch (error) {
      return workshopError(error);
    }
  }

  slots(sessionId: string, site: string | null, date: string | null): Promise<WorkshopData> {
    return this.booking.slots(this.store.ensure(sessionId), site, date);
  }

  hold(sessionId: string, pick: SlotPick): Promise<WorkshopData> {
    return this.booking.hold(this.store.ensure(sessionId), pick);
  }

  book(sessionId: string, pick: SlotPick | null, userMessage: string): Promise<WorkshopData> {
    return this.booking.book(this.store.ensure(sessionId), pick, userMessage);
  }

  /** La decisión del taller: su sede (o, si la da inactiva, la de la especialidad) y su id para agendar sin recalcular. */
  private async routingView(state: WorkshopSession, r: Routing): Promise<WorkshopData> {
    const site: Site = r.taller.activo === false ? (pickSite(r, await this.siteList.list().catch(() => []))?.site ?? r.taller) : r.taller;
    state.sites.set(site.codigo.toUpperCase(), site);
    state.routing = { id: r.id_prediagnostico, siteCode: site.codigo };
    // Sin datos personales: solo lo que explica a qué sede se mandó el carro.
    this.logger.log(`Enrutamiento ${clean(r.id_prediagnostico, 20)}: ${clean(r.especialidad, 40)}, ruta ${r.ruta}, fuente ${clean(r.fuente ?? '-', 20)}, taller ${clean(site.codigo, 40)}`);
    return {
      especialidad: clean(r.especialidad, 40).replace(/_/g, ' '),
      ruta: r.ruta === 'revision_general' ? 'revisión general (primero mantenimiento)' : 'especializada',
      ...(r.resumen ? { resumen: clean(r.resumen, 400) } : {}),
      servicios_probables: r.servicios_probables.slice(0, 5).map((s) => ({ nombre: clean(s.nombre), precio_mano_obra: s.precio_mano_obra, precio_texto: formatPesos(s.precio_mano_obra) })),
      ...(r.garantia ? { garantia: warrantyView(r.garantia) } : {}),
      ...(r.garantia && r.por_garantia !== false ? { estimacion_garantia: estimateView(r.garantia) } : {}),
      sede_recomendada: { ...siteView(site), motivo: clean(r.motivo_decision ?? 'Es la sede que decidió el taller para este caso', 400) },
      nota: 'Es un prediagnóstico: el valor final lo confirma el taller después de revisar el carro.',
      siguiente_paso: 'Muéstrale esto al cliente y ofrécele horas con consultar_horarios_taller (sin sede: usa esta).',
    };
  }
}

function estimateView(w: NonNullable<Routing['garantia']>): WorkshopData {
  const verdict = w.aplica_probable === true ? 'probablemente sí' : w.aplica_probable === false ? 'probablemente no' : 'sin definir';
  return { aplica: verdict, ...(w.causa_probable ? { causa_probable: clean(w.causa_probable, 60).replace(/_/g, ' ') } : {}), aviso: ESTIMATE_NOTE };
}

/** Cliente identificado y el siguiente paso: si ya contó qué le pasa al carro, no hay que volver a preguntárselo. */
function identified(relation: RelationSummary, state: WorkshopSession): WorkshopData {
  const told = state.customerWords.map((words) => clean(words, 200));
  return {
    identificado: true, vehiculo: relation.vehicle, placa: relation.plate, garantia: warrantyView(relation.warranty), lectura_vin: vinReading(relation.vin),
    ...(told.length > 0 ? { lo_que_conto_el_cliente: told } : {}),
    siguiente_paso: told.length > 0
      ? 'El cliente ya contó qué le pasa: confírmale con naturalidad que lo encontraste y llama prediagnosticar_taller con eso, sin volver a preguntárselo.'
      : 'Confírmale con naturalidad que lo encontraste y pregúntale qué le pasa al carro o qué repuesto necesita.',
  };
}

/** Qué dice el VIN del carro identificado (decisión 132): origen, fabricante, año por la posición 10 y dígito verificador. */
function vinReading(vin: string): WorkshopData {
  const s = readStructure(vin);
  return {
    fabricado_en: s.country ? `${s.country} (${s.region})` : s.region,
    ...(s.manufacturer ? { fabricante: s.manufacturer } : {}),
    ...(s.year ? { anio_por_codigo: s.year } : {}),
    digito_verificador: s.checkDigitValid ? 'correcto' : s.region === 'Norteamérica' ? 'no cuadra' : 'no cuadra (común fuera de Norteamérica)',
  };
}

function missingId(state: WorkshopSession): WorkshopData {
  const missing = [state.cedula ? null : 'el número de documento (DNI)', state.vin ? null : 'el VIN (17 caracteres, está en la tarjeta de propiedad)'].filter(Boolean);
  return { error: `Falta ${missing.join(' y ')}. Pídeselo al cliente; cuando lo escriba, vuelve a llamar identificar_cliente_taller.` };
}

function warrantyView(w: NonNullable<Prediagnosis['garantia']>): WorkshopData {
  return {
    vigente: w.vigente,
    ...(w.vence ? { vence: clean(w.vence, 20) } : {}),
    ...(w.cubre ? { cubre: w.cubre.map((c) => clean(c, 40)) } : {}),
    ...(!w.vigente && w.motivo ? { motivo: clean(w.motivo, 200) } : {}),
  };
}

function addSymptoms(state: WorkshopSession, symptoms: string[]): void {
  for (const raw of symptoms) {
    const text = symptomText(raw);
    if (text.replace(/\[(número|VIN)\]/g, '').trim().length >= 3 && !state.symptoms.includes(text)) state.symptoms.push(text);
  }
  state.symptoms.splice(0, Math.max(0, state.symptoms.length - MAX_SYMPTOMS));
}
