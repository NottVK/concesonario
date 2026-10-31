import { z } from 'zod';
import type { BookedAppointment, ChargeReceipt, StorePurchase, TallerRecord } from './types.js';

/**
 * Traductores del `data` que devuelve cada equipo (contrato de integración v0.1, sección 6) al formato interno. Si un
 * equipo cambia sus nombres, solo se cambia el esquema de aquí. Todo lo que llega es dato NO confiable: se valida
 * forma, tamaño y fechas, y lo que no encaja se descarta como «no verificado».
 */
const DAY = /^\d{4}-\d{2}-\d{2}/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_ITEMS = 50;
const ONE_DAY_MS = 86_400_000;

const pastDate = z
  .string()
  .regex(DAY)
  .refine((value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= Date.now() + ONE_DAY_MS;
  });
const isoInstant = z.string().max(40).refine((value) => Number.isFinite(Date.parse(value)));

const yesNo = z.enum(['sí', 'si', 'no']);
const records = z.object({
  registros: z
    .array(z.object({ fecha: pastDate, tipo: z.enum(['revision', 'reparacion']), km: z.number().int().min(0).max(3_000_000).nullable(), centro_autorizado: yesNo }))
    .max(MAX_ITEMS),
});
const slots = z.object({ franjas: z.array(z.object({ inicio: isoInstant })).max(MAX_ITEMS) });
const booking = z.object({ cita_id: z.string().regex(ID) });
const purchases = z.object({
  compras: z.array(z.object({ fecha: pastDate, descripcion: z.string().min(1).max(80) })).max(MAX_ITEMS),
});
// Pagos usa su propio contrato: se acepta el identificador de la cuenta con cualquiera de estos nombres.
const charge = z.object({ cuenta_id: z.string().regex(ID).optional(), id: z.string().regex(ID).optional(), external_ref: z.string().regex(ID).optional() });

/** Una reparación en un centro NO autorizado es un cambio ajeno; una revisión nunca lo es. */
const kindOf = (tipo: 'revision' | 'reparacion', authorized: 'sí' | 'si' | 'no'): TallerRecord['kind'] =>
  authorized === 'no' ? 'third_party_change' : tipo === 'revision' ? 'service' : 'repair';

export const parseRecords = (json: unknown): TallerRecord[] | null => {
  const parsed = records.safeParse(json);
  return parsed.success ? parsed.data.registros.map((r) => ({ date: r.fecha, km: r.km, kind: kindOf(r.tipo, r.centro_autorizado) })) : null;
};
export const parseSlots = (json: unknown): string[] | null => {
  const parsed = slots.safeParse(json);
  return parsed.success ? parsed.data.franjas.map((f) => f.inicio) : null;
};
/** La hora de la cita es la que pedimos nosotros; el equipo solo devuelve el identificador. */
export const parseBooking = (json: unknown, start: string): BookedAppointment | null => {
  const parsed = booking.safeParse(json);
  return parsed.success ? { appointmentId: parsed.data.cita_id, start } : null;
};
export const parsePurchases = (json: unknown): StorePurchase[] | null => {
  const parsed = purchases.safeParse(json);
  // El contrato no dice quién instaló el repuesto: queda «unknown» y no cuenta como cambio ajeno.
  return parsed.success ? parsed.data.compras.map((c) => ({ date: c.fecha, item: c.descripcion, installedBy: 'unknown' as const })) : null;
};
export const parseCharge = (json: unknown): ChargeReceipt | null => {
  const parsed = charge.safeParse(json);
  const ref = parsed.success ? (parsed.data.cuenta_id ?? parsed.data.id ?? parsed.data.external_ref) : undefined;
  return ref ? { chargeRef: ref } : null;
};
