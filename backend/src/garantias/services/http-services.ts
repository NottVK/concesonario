import { z } from 'zod';
import type { A2aOutboundService } from '../../a2a/outbound/a2a-outbound.service.js';
import { parseBooking, parseCharge, parsePurchases, parseRecords, parseSlots } from './parsers.js';
import { SERVICE_NAMES } from './types.js';
import type { BookedAppointment, ChargeReceipt, PagosService, ServiceResult, StorePurchase, TallerRecord, TallerService, TiendaService } from './types.js';

const FAIL = { ok: false } as const;
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

/** Sobre de respuesta del contrato: solo se mira `data` si `status` es `completed` (se lee antes que `data`). */
const envelope = z.object({ status: z.string(), data: z.unknown() });

interface SkillCall<T> {
  name: string;
  skill: string;
  params: Record<string, unknown>;
  label: string;
  idempotencyKey?: string;
  parse: (data: unknown) => T | null;
}

/** Pide una habilidad por `POST /tasks` y valida la forma del `data`; cualquier fallo es `{ ok: false }` («no verificado»). */
async function callSkill<T>(outbound: A2aOutboundService, input: SkillCall<T>): Promise<ServiceResult<T>> {
  const response = await outbound.callService({
    name: input.name,
    method: 'POST',
    path: '/tasks',
    label: input.label,
    body: { skill: input.skill, params: input.params },
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  if (!response.ok) return FAIL;
  const parsed = envelope.safeParse(response.json);
  if (!parsed.success || parsed.data.status !== 'completed') return FAIL;
  const value = input.parse(parsed.data.data);
  return value === null ? FAIL : { ok: true, value };
}

/** Taller real: el equipo del taller registra su URL y su key en el panel de bots con el nombre «Taller». */
export class HttpTaller implements TallerService {
  constructor(private readonly outbound: A2aOutboundService) {}

  consultarRegistros(ownerId: number): Promise<ServiceResult<TallerRecord[]>> {
    return callSkill(this.outbound, { name: SERVICE_NAMES.taller, skill: 'consultar_registros', params: { id: ownerId }, label: 'garantía: taller registros', parse: parseRecords });
  }

  consultarDisponibilidad(): Promise<ServiceResult<string[]>> {
    const now = Date.now();
    const params = { desde: new Date(now).toISOString(), hasta: new Date(now + WINDOW_DAYS * DAY_MS).toISOString() };
    return callSkill(this.outbound, { name: SERVICE_NAMES.taller, skill: 'consultar_disponibilidad', params, label: 'garantía: taller disponibilidad', parse: parseSlots });
  }

  agendarCita(ownerId: number, caseId: string, slot: string): Promise<ServiceResult<BookedAppointment>> {
    return callSkill(this.outbound, {
      name: SERVICE_NAMES.taller,
      skill: 'agendar_cita',
      params: { id: ownerId, caso_id: caseId, inicio: slot },
      label: 'garantía: taller agendar',
      idempotencyKey: `automax-caso-${caseId}`,
      parse: (data) => parseBooking(data, slot),
    });
  }
}

/** Tienda real: se registra con el nombre «Tienda». */
export class HttpTienda implements TiendaService {
  constructor(private readonly outbound: A2aOutboundService) {}

  consultarCompras(ownerId: number): Promise<ServiceResult<StorePurchase[]>> {
    return callSkill(this.outbound, { name: SERVICE_NAMES.tienda, skill: 'consultar_compras', params: { id: ownerId }, label: 'garantía: tienda compras', parse: parsePurchases });
  }
}

/** Pagos real: se registra con el nombre «Pagos»; `external_ref` y la Idempotency-Key son `automax-garantia-<caso>`. */
export class HttpPagos implements PagosService {
  constructor(private readonly outbound: A2aOutboundService) {}

  registrarCobroGarantia(input: { ownerId: number; caseId: string }): Promise<ServiceResult<ChargeReceipt>> {
    const reference = `automax-garantia-${input.caseId}`;
    return callSkill(this.outbound, {
      name: SERVICE_NAMES.pagos,
      skill: 'crear_cuenta',
      params: { id: input.ownerId, external_ref: reference },
      label: 'garantía: pagos cobro',
      idempotencyKey: reference,
      parse: parseCharge,
    });
  }
}
