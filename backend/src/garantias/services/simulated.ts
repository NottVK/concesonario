import { Injectable } from '@nestjs/common';
import type { BookedAppointment, ChargeReceipt, PagosService, ServiceResult, StorePurchase, TallerRecord, TallerService, TiendaService } from './types.js';

export type ServiceKey = 'taller' | 'tienda' | 'pagos';
const FAIL = { ok: false } as const;
const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Simulado de Taller, Tienda y Pagos con el MISMO formato interno que los reales, SOLO para desarrollo y pruebas
 * (en producción no se usa: sin servicio registrado el resultado es «no verificado»). Los datos de demostración
 * responden por el id de propietario 1 a 3 (ver garantias.seed.ts); las pruebas los cambian con los setters.
 */
@Injectable()
export class SimulatedServices implements TallerService, TiendaService, PagosService {
  private failing = new Set<ServiceKey>();
  private records = new Map<number, TallerRecord[]>();
  private purchases = new Map<number, StorePurchase[]>();
  private bookings = new Map<string, BookedAppointment>();
  private charges = new Map<string, ChargeReceipt>();
  availabilityCalls = 0;
  bookingCalls = 0;
  chargeCalls = 0;

  reset(): void {
    this.failing.clear();
    this.records.clear();
    this.purchases.clear();
    this.bookings.clear();
    this.charges.clear();
    this.availabilityCalls = this.bookingCalls = this.chargeCalls = 0;
  }

  fail(service: ServiceKey, failing = true): void {
    if (failing) this.failing.add(service);
    else this.failing.delete(service);
  }

  setRecords(ownerId: number, records: TallerRecord[]): void {
    this.records.set(ownerId, records);
  }

  setPurchases(ownerId: number, purchases: StorePurchase[]): void {
    this.purchases.set(ownerId, purchases);
  }

  /** Cobros distintos registrados (una misma clave de idempotencia cuenta una sola vez). */
  get chargesRegistered(): number {
    return this.charges.size;
  }

  async consultarRegistros(ownerId: number): Promise<ServiceResult<TallerRecord[]>> {
    if (this.failing.has('taller')) return FAIL;
    const set = this.records.get(ownerId);
    if (set) return ok(set);
    return ok([{ date: today(), km: ownerId === 2 ? 130_000 : 15_000, kind: 'service' }]);
  }

  async consultarDisponibilidad(): Promise<ServiceResult<string[]>> {
    this.availabilityCalls++;
    if (this.failing.has('taller')) return FAIL;
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + 3);
    base.setUTCHours(14, 0, 0, 0);
    return ok([base.toISOString(), new Date(base.getTime() + 3_600_000).toISOString()]);
  }

  async agendarCita(_ownerId: number, caseId: string, slot: string): Promise<ServiceResult<BookedAppointment>> {
    this.bookingCalls++;
    if (this.failing.has('taller')) return FAIL;
    const existing = this.bookings.get(caseId);
    if (existing) return ok(existing);
    const booking = { appointmentId: `sim-cita-${this.bookings.size + 1}`, start: slot };
    this.bookings.set(caseId, booking);
    return ok(booking);
  }

  async consultarCompras(ownerId: number): Promise<ServiceResult<StorePurchase[]>> {
    if (this.failing.has('tienda')) return FAIL;
    const set = this.purchases.get(ownerId);
    if (set) return ok(set);
    return ok(ownerId === 3 ? [{ date: today(), item: 'Rines deportivos', installedBy: 'third_party' }] : []);
  }

  async registrarCobroGarantia(input: { ownerId: number; caseId: string }): Promise<ServiceResult<ChargeReceipt>> {
    this.chargeCalls++;
    if (this.failing.has('pagos')) return FAIL;
    const existing = this.charges.get(input.caseId);
    if (existing) return ok(existing);
    const receipt = { chargeRef: `sim-cobro-${this.charges.size + 1}` };
    this.charges.set(input.caseId, receipt);
    return ok(receipt);
  }
}
