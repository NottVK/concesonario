/**
 * Formato INTERNO de los servicios de otros equipos. Cada adaptador traduce el formato de su equipo a este y el flujo
 * de garantías solo conoce este. Ningún método lanza: un fallo (red, formato, tiempo) es `{ ok: false }` y el flujo lo
 * trata como «no verificado». Solo viaja el id cliente-vehículo, nunca el documento.
 */
export type ServiceResult<T> = { ok: true; value: T } | { ok: false };

export type RecordKind = 'service' | 'repair' | 'third_party_change';
export interface TallerRecord {
  date: string;
  km: number | null;
  kind: RecordKind;
}

export type Installer = 'official' | 'third_party' | 'unknown';
export interface StorePurchase {
  date: string;
  item: string;
  installedBy: Installer;
}

export interface BookedAppointment {
  appointmentId: string;
  /** ISO 8601. */
  start: string;
}

export interface ChargeReceipt {
  chargeRef: string;
}

export interface TallerService {
  consultarRegistros(ownerId: number): Promise<ServiceResult<TallerRecord[]>>;
  /** Horarios libres (ISO 8601), del más próximo al más lejano. */
  consultarDisponibilidad(): Promise<ServiceResult<string[]>>;
  /** Con la misma clave de idempotencia devuelve la misma cita: reintentar nunca duplica. */
  agendarCita(ownerId: number, slot: string, idempotencyKey: string): Promise<ServiceResult<BookedAppointment>>;
}

export interface TiendaService {
  consultarCompras(ownerId: number): Promise<ServiceResult<StorePurchase[]>>;
}

export interface PagosService {
  /** Con la misma clave de idempotencia registra UN solo cobro. */
  registrarCobroGarantia(input: { ownerId: number; caseId: string; idempotencyKey: string }): Promise<ServiceResult<ChargeReceipt>>;
}

/** Nombres con los que se registran en `bots_externos`; los fija el código, nunca el modelo. */
export const SERVICE_NAMES = { taller: 'Taller', tienda: 'Tienda', pagos: 'Pagos' } as const;
