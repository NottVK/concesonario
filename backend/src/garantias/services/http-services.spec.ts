import { describe, expect, it, vi } from 'vitest';
import type { A2aOutboundService } from '../../a2a/outbound/a2a-outbound.service.js';
import { HttpPagos, HttpTaller, HttpTienda } from './http-services.js';

type Input = Parameters<A2aOutboundService['callService']>[0];

/** Falso de la capa saliente: responde lo que se le diga y guarda lo que recibió. */
function fake(json: unknown, ok = true): { outbound: A2aOutboundService; calls: Input[] } {
  const calls: Input[] = [];
  const callService = vi.fn(async (input: Input) => {
    calls.push(input);
    return ok ? { ok: true as const, json } : { ok: false as const, status: 'timeout' as never };
  });
  return { outbound: { callService } as unknown as A2aOutboundService, calls };
}

const completed = (data: unknown): unknown => ({ status: 'completed', data });

describe('adaptadores del contrato de integración', () => {
  it('Taller: consultar_registros traduce reparación en centro no autorizado a cambio ajeno', async () => {
    const { outbound, calls } = fake(
      completed({
        registros: [
          { fecha: '2025-01-10', tipo: 'revision', km: 10000, centro_autorizado: 'sí', descripcion: 'x' },
          { fecha: '2025-06-10', tipo: 'reparacion', km: 20000, centro_autorizado: 'no', descripcion: 'y' },
        ],
      }),
    );
    const result = await new HttpTaller(outbound).consultarRegistros(7);
    expect(calls[0]).toMatchObject({ name: 'Taller', method: 'POST', path: '/tasks', body: { skill: 'consultar_registros', params: { id: 7 } } });
    expect(result).toEqual({
      ok: true,
      value: [
        { date: '2025-01-10', km: 10000, kind: 'service' },
        { date: '2025-06-10', km: 20000, kind: 'third_party_change' },
      ],
    });
  });

  it('Taller: agendar_cita manda la Idempotency-Key automax-caso-<caso> y conserva la hora pedida', async () => {
    const { outbound, calls } = fake(completed({ cita_id: 'c-1' }));
    const result = await new HttpTaller(outbound).agendarCita(7, 'caso9', '2030-01-01T10:00:00.000Z');
    expect(calls[0]).toMatchObject({ idempotencyKey: 'automax-caso-caso9', body: { skill: 'agendar_cita', params: { id: 7, caso_id: 'caso9', inicio: '2030-01-01T10:00:00.000Z' } } });
    expect(result).toEqual({ ok: true, value: { appointmentId: 'c-1', start: '2030-01-01T10:00:00.000Z' } });
  });

  it('Taller: consultar_disponibilidad devuelve el inicio de cada franja', async () => {
    const { outbound } = fake(completed({ franjas: [{ inicio: '2030-01-01T10:00:00-05:00', fin: '2030-01-01T11:00:00-05:00' }] }));
    expect(await new HttpTaller(outbound).consultarDisponibilidad()).toEqual({ ok: true, value: ['2030-01-01T10:00:00-05:00'] });
  });

  it('Tienda: consultar_compras no marca cambio ajeno porque el contrato no dice quién instaló', async () => {
    const { outbound } = fake(completed({ compras: [{ codigo: 'a', descripcion: 'Batería', fecha: '2025-02-01', tienda: 'T' }] }));
    expect(await new HttpTienda(outbound).consultarCompras(7)).toEqual({ ok: true, value: [{ date: '2025-02-01', item: 'Batería', installedBy: 'unknown' }] });
  });

  it('Pagos: crear_cuenta usa automax-garantia-<caso> como referencia y como clave', async () => {
    const { outbound, calls } = fake(completed({ cuenta_id: 'cta-1' }));
    const result = await new HttpPagos(outbound).registrarCobroGarantia({ ownerId: 7, caseId: 'caso9' });
    expect(calls[0]).toMatchObject({ idempotencyKey: 'automax-garantia-caso9', body: { skill: 'crear_cuenta', params: { external_ref: 'automax-garantia-caso9' } } });
    expect(result).toEqual({ ok: true, value: { chargeRef: 'cta-1' } });
  });

  it('un status distinto de completed, un formato roto o un fallo de red dan «no verificado»', async () => {
    expect(await new HttpTienda(fake({ status: 'error', data: { compras: [] } }).outbound).consultarCompras(1)).toEqual({ ok: false });
    expect(await new HttpTienda(fake(completed({ compras: 'x' })).outbound).consultarCompras(1)).toEqual({ ok: false });
    expect(await new HttpTienda(fake(null, false).outbound).consultarCompras(1)).toEqual({ ok: false });
  });
});
