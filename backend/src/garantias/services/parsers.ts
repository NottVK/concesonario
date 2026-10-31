import { z } from 'zod';
import type { BookedAppointment, ChargeReceipt, StorePurchase, TallerRecord } from './types.js';

/**
 * Traductores de la respuesta de cada equipo al formato interno. Hoy aceptan directamente el formato interno (los
 * contratos con los otros grupos no están definidos): cuando lo estén, solo se cambia el esquema de aquí. Todo lo que
 * llega es dato NO confiable: se valida forma, tamaño y fechas, y lo que no encaja se descarta como «no verificado».
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

const records = z.object({
  records: z.array(z.object({ date: pastDate, km: z.number().int().min(0).max(3_000_000).nullable(), kind: z.enum(['service', 'repair', 'third_party_change']) })).max(MAX_ITEMS),
});
const slots = z.object({ slots: z.array(isoInstant).max(MAX_ITEMS) });
const booking = z.object({ appointmentId: z.string().regex(ID), start: isoInstant });
const purchases = z.object({
  purchases: z.array(z.object({ date: pastDate, item: z.string().min(1).max(80), installedBy: z.enum(['official', 'third_party', 'unknown']) })).max(MAX_ITEMS),
});
const charge = z.object({ chargeRef: z.string().regex(ID) });

export const parseRecords = (json: unknown): TallerRecord[] | null => {
  const parsed = records.safeParse(json);
  return parsed.success ? parsed.data.records : null;
};
export const parseSlots = (json: unknown): string[] | null => {
  const parsed = slots.safeParse(json);
  return parsed.success ? parsed.data.slots : null;
};
export const parseBooking = (json: unknown): BookedAppointment | null => {
  const parsed = booking.safeParse(json);
  return parsed.success ? parsed.data : null;
};
export const parsePurchases = (json: unknown): StorePurchase[] | null => {
  const parsed = purchases.safeParse(json);
  return parsed.success ? parsed.data.purchases : null;
};
export const parseCharge = (json: unknown): ChargeReceipt | null => {
  const parsed = charge.safeParse(json);
  return parsed.success ? parsed.data : null;
};
