import { brandFromWmi, yearFromVin } from './vin-decoder.js';

/**
 * Qué significa cada parte de un VIN (ISO 3779), sin internet: país y región del fabricante, partes del código y el
 * dígito verificador de la posición 9 (cálculo de la norma FMVSS 115 de EE. UU.). El dígito verificador es
 * obligatorio solo en Norteamérica: muchos VIN latinoamericanos no lo cumplen, así que es un aviso, no un rechazo.
 */

export interface VinStructure {
  wmi: string;
  manufacturer: string | null;
  region: string;
  country: string | null;
  vds: string;
  checkDigit: string;
  checkDigitExpected: string;
  checkDigitValid: boolean;
  yearCode: string;
  year: number | null;
  plantCode: string;
  serial: string;
}

// Valor de cada letra para el dígito verificador (I, O y Q no existen en un VIN).
const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** El dígito verificador que le corresponde a un VIN de 17 caracteres válidos (0 a 9, o X para 10). */
export function expectedCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const char = vin.charAt(i);
    const value = /\d/.test(char) ? Number(char) : (LETTER_VALUES[char] ?? 0);
    sum += value * WEIGHTS[i]!;
  }
  const rest = sum % 11;
  return rest === 10 ? 'X' : String(rest);
}

// País por las dos primeras posiciones (rangos de la ISO 3779 para los países que más se ven en Colombia).
const COUNTRY_RANGES: [RegExp, string][] = [
  [/^1|^4|^5/, 'Estados Unidos'], [/^2/, 'Canadá'], [/^3[A-W]/, 'México'], [/^3[X-Z0-7]/, 'Costa Rica'],
  [/^9[A-E]/, 'Brasil'], [/^9[F-J]/, 'Colombia'], [/^8[A-E]/, 'Argentina'], [/^8[F-J]/, 'Chile'], [/^8[L-R]/, 'Ecuador'],
  [/^8[S-W]/, 'Perú'], [/^8[X-Z12]/, 'Venezuela'], [/^9[S-W]/, 'Uruguay'],
  [/^J/, 'Japón'], [/^K[L-R]/, 'Corea del Sur'], [/^L/, 'China'], [/^M[A-E]/, 'India'], [/^M[F-K]/, 'Indonesia'], [/^M[L-R]/, 'Tailandia'],
  [/^W/, 'Alemania'], [/^V[F-R]/, 'Francia'], [/^V[S-W]/, 'España'], [/^Z[A-R]/, 'Italia'], [/^S[A-M]/, 'Reino Unido'],
  [/^Y[S-W]/, 'Suecia'], [/^T[J-P]/, 'República Checa'], [/^6/, 'Australia'], [/^A[A-H]/, 'Sudáfrica'],
];

const REGIONS: [RegExp, string][] = [
  [/^[1-5]/, 'Norteamérica'], [/^[67]/, 'Oceanía'], [/^[89]/, 'Suramérica'], [/^[A-H]/, 'África'], [/^[J-R]/, 'Asia'], [/^[S-Z]/, 'Europa'],
];

function first(table: [RegExp, string][], vin: string): string | null {
  return table.find(([pattern]) => pattern.test(vin))?.[1] ?? null;
}

/** Las partes del VIN y lo que dice cada una. El VIN debe venir ya validado (17 caracteres, sin I, O ni Q). */
export function readStructure(vin: string, now = new Date()): VinStructure {
  const expected = expectedCheckDigit(vin);
  return {
    wmi: vin.slice(0, 3),
    manufacturer: brandFromWmi(vin),
    region: first(REGIONS, vin) ?? 'Desconocida',
    country: first(COUNTRY_RANGES, vin),
    vds: vin.slice(3, 8),
    checkDigit: vin.charAt(8),
    checkDigitExpected: expected,
    checkDigitValid: vin.charAt(8) === expected,
    yearCode: vin.charAt(9),
    year: yearFromVin(vin, now),
    plantCode: vin.charAt(10),
    serial: vin.slice(11),
  };
}
