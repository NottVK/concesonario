/** Política de garantía, configurable: 36 meses o 100.000 km por defecto (lo primero que se cumpla vence la garantía). */
export interface WarrantyPolicy {
  maxMonths: number;
  maxKm: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Se lee en cada uso: un cambio de entorno surte efecto al reiniciar, sin tocar código. */
export function loadWarrantyPolicy(env: NodeJS.ProcessEnv = process.env): WarrantyPolicy {
  return { maxMonths: positiveInt(env.GARANTIA_MAX_MESES, 36), maxKm: positiveInt(env.GARANTIA_MAX_KM, 100_000) };
}

export type ExpiryVerdict = { expired: false } | { expired: true; reason: string };

function monthsBetween(from: string, to: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  let months = (to.getUTCFullYear() - start.getUTCFullYear()) * 12 + (to.getUTCMonth() - start.getUTCMonth());
  if (to.getUTCDate() < start.getUTCDate()) months -= 1;
  return months;
}

/** Vencida por fecha (desde la compra) o por km (el mayor km visto en los registros). El km desconocido no vence. */
export function checkExpiry(purchaseDate: string, maxKnownKm: number | null, now: Date, policy: WarrantyPolicy): ExpiryVerdict {
  if (monthsBetween(purchaseDate, now) >= policy.maxMonths) {
    return { expired: true, reason: `La garantía de ${policy.maxMonths} meses desde la compra ya venció.` };
  }
  if (maxKnownKm !== null && maxKnownKm > policy.maxKm) {
    return { expired: true, reason: `El vehículo superó los ${policy.maxKm.toLocaleString('es-CO')} km de garantía.` };
  }
  return { expired: false };
}
