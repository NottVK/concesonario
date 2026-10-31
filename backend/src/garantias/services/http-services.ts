import type { A2aOutboundService } from '../../a2a/outbound/a2a-outbound.service.js';
import { parseBooking, parseCharge, parsePurchases, parseRecords, parseSlots } from './parsers.js';
import { SERVICE_NAMES } from './types.js';
import type { BookedAppointment, ChargeReceipt, PagosService, ServiceResult, StorePurchase, TallerRecord, TallerService, TiendaService } from './types.js';

const FAIL = { ok: false } as const;

/** Llama al servicio registrado y valida la forma con `parse`; cualquier fallo es `{ ok: false }` («no verificado»). */
async function call<T>(
  outbound: A2aOutboundService,
  input: Parameters<A2aOutboundService['callService']>[0],
  parse: (json: unknown) => T | null,
): Promise<ServiceResult<T>> {
  const response = await outbound.callService(input);
  if (!response.ok) return FAIL;
  const value = parse(response.json);
  return value === null ? FAIL : { ok: true, value };
}

/** Taller real: el equipo del taller registra su URL y su key en el panel de bots con el nombre «Taller». */
export class HttpTaller implements TallerService {
  constructor(private readonly outbound: A2aOutboundService) {}

  consultarRegistros(ownerId: number): Promise<ServiceResult<TallerRecord[]>> {
    return call(this.outbound, { name: SERVICE_NAMES.taller, method: 'GET', path: `/vehiculos/${ownerId}/registros`, label: 'garantía: taller registros' }, parseRecords);
  }

  consultarDisponibilidad(): Promise<ServiceResult<string[]>> {
    return call(this.outbound, { name: SERVICE_NAMES.taller, method: 'GET', path: '/disponibilidad', label: 'garantía: taller disponibilidad' }, parseSlots);
  }

  agendarCita(ownerId: number, slot: string, idempotencyKey: string): Promise<ServiceResult<BookedAppointment>> {
    return call(this.outbound, { name: SERVICE_NAMES.taller, method: 'POST', path: '/citas', label: 'garantía: taller agendar', body: { ownerId, slot }, idempotencyKey }, parseBooking);
  }
}

/** Tienda real: se registra con el nombre «Tienda». */
export class HttpTienda implements TiendaService {
  constructor(private readonly outbound: A2aOutboundService) {}

  consultarCompras(ownerId: number): Promise<ServiceResult<StorePurchase[]>> {
    return call(this.outbound, { name: SERVICE_NAMES.tienda, method: 'GET', path: `/vehiculos/${ownerId}/compras`, label: 'garantía: tienda compras' }, parsePurchases);
  }
}

/** Pagos real: se registra con el nombre «Pagos»; el cobro lleva una Idempotency-Key fija por caso. */
export class HttpPagos implements PagosService {
  constructor(private readonly outbound: A2aOutboundService) {}

  registrarCobroGarantia(input: { ownerId: number; caseId: string; idempotencyKey: string }): Promise<ServiceResult<ChargeReceipt>> {
    return call(
      this.outbound,
      { name: SERVICE_NAMES.pagos, method: 'POST', path: '/cobros-garantia', label: 'garantía: pagos cobro', body: { ownerId: input.ownerId, caseId: input.caseId }, idempotencyKey: input.idempotencyKey },
      parseCharge,
    );
  }
}
