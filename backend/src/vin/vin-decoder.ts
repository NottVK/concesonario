/**
 * Lectura de la estructura de un VIN (ISO 3779), sin base de datos (decisión 129):
 * - posiciones 1 a 3 (WMI): el fabricante;
 * - posición 10: el año modelo, en un ciclo de 30 años (A = 1980 o 2010 … Y = 2000 o 2030, 1 a 9 = 2001 a 2009 o 2031 a 2039).
 * El dígito verificador (posición 9) no se exige para aceptar un VIN: es obligatorio solo en Norteamérica y cinco de los ocho VIN
 * de prueba del taller no lo cumplen. Se calcula como aviso en `vin-structure.ts` (decisión 132).
 */

/** 17 caracteres, letras y números, sin I, O ni Q (se confunden con 1 y 0). */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/** Fabricantes por WMI; incluye los de los VIN de prueba del taller (9FB, 3MZ, 9BW, KMH) y las marcas del catálogo. */
const WMI_BRANDS: Record<string, string> = {
  '9FB': 'Renault', VF1: 'Renault', '93Y': 'Renault',
  '3MZ': 'Mazda', JM1: 'Mazda', JM3: 'Mazda', '9FC': 'Mazda',
  '9BW': 'Volkswagen', WVW: 'Volkswagen', WVG: 'Volkswagen', '3VW': 'Volkswagen',
  KMH: 'Hyundai', MAL: 'Hyundai',
  KNA: 'Kia', KND: 'Kia', KNE: 'Kia',
  '9GA': 'Chevrolet', '9BG': 'Chevrolet', KL1: 'Chevrolet', '1G1': 'Chevrolet',
  JTD: 'Toyota', JTE: 'Toyota', JTM: 'Toyota', JTN: 'Toyota', '9BR': 'Toyota', MR0: 'Toyota',
  JN1: 'Nissan', JN8: 'Nissan', '3N1': 'Nissan', '3N6': 'Nissan',
  '1FA': 'Ford', '1FM': 'Ford', '3FA': 'Ford', '9BF': 'Ford',
  WBA: 'BMW', WBS: 'BMW', WBY: 'BMW', '5UX': 'BMW',
  '1HG': 'Honda', '2HG': 'Honda', JHM: 'Honda', '5FN': 'Honda',
};

/** Mayúsculas y sin espacios ni guiones alrededor (la gente escribe "9fbhjd204pm100001"). */
export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}

/** Marca según las 3 primeras posiciones, o null si el fabricante no está en la tabla. */
export function brandFromWmi(vin: string): string | null {
  return WMI_BRANDS[vin.slice(0, 3)] ?? null;
}

/** Año modelo según la posición 10: el más reciente del ciclo que no pase del año que viene. */
export function yearFromVin(vin: string, now = new Date()): number | null {
  const index = YEAR_CODES.indexOf(vin.charAt(9));
  if (index < 0) return null;
  const limit = now.getFullYear() + 1;
  let year = 1980 + index;
  while (year + 30 <= limit) year += 30;
  return year;
}
