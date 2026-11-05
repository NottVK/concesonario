import type { WarrantyPlan } from './entities/relationship.entity.js';

/** Garantía de fábrica del Excel del taller: 3 años desde la venta o 60.000 km, lo que pase primero. */
export const WARRANTY_YEARS = 3;
export const WARRANTY_MAX_KM = 60_000;

/** Sistemas (especialidades del taller) que cubre cada plan. */
export const PLAN_COVERAGE: Record<WarrantyPlan, string[]> = {
  todo: ['frenos', 'suspension', 'motor', 'electrico', 'transmision'],
  tren_motriz: ['motor', 'transmision', 'electrico'],
};

export interface Warranty {
  vigente: boolean;
  vence: string;
  kmMaximo: number;
  cubre: string[];
  /** Solo cuando no está vigente: es lo que se le muestra al cliente. */
  motivo?: string;
}

/** Fecha de hoy en Bogotá, AAAA-MM-DD. */
export function bogotaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
}

export function warrantyOf(saleDate: string, mileage: number, plan: WarrantyPlan, today = bogotaToday()): Warranty {
  const [year, month, day] = saleDate.split('-').map(Number) as [number, number, number];
  // Un 29 de febrero vence el 28 (Date ajusta al 1 de marzo, se corrige restando un día).
  const end = new Date(Date.UTC(year + WARRANTY_YEARS, month - 1, day));
  if (end.getUTCMonth() !== month - 1) end.setUTCDate(0);
  const vence = end.toISOString().slice(0, 10);
  const base = { vence, kmMaximo: WARRANTY_MAX_KM, cubre: [...PLAN_COVERAGE[plan]] };
  if (today >= vence) return { vigente: false, ...base, motivo: `La garantía venció el ${vence}` };
  if (mileage >= WARRANTY_MAX_KM) return { vigente: false, ...base, motivo: 'El vehículo superó los 60.000 km que cubre la garantía' };
  return { vigente: true, ...base };
}
