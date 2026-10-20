import { parseColombianNumber } from '../text/amounts.js';
import { sanitizeText } from '../text/sanitize.js';

/** Validación ESTRICTA de los argumentos de una tool: lo que escribe el modelo es dato no confiable. */
export type Spec =
  | { kind: 'int'; min: number; max: number; required?: boolean }
  | { kind: 'str'; max: number; pattern?: RegExp; required?: boolean }
  | { kind: 'enum'; values: readonly string[]; required?: boolean }
  | { kind: 'money'; required?: boolean }
  | { kind: 'intArray'; min: number; max: number; minItems: number; maxItems: number; required?: boolean };

export type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

const MAX_MONEY = 9_999_999_999;

function parseInteger(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d{1,10}$/.test(raw.trim())) return Number(raw.trim());
  return null;
}

/** Acepta 20000000, "20000000", "20.000.000" o "$20.000.000"; devuelve texto de pesos sin formato. */
function parseMoney(raw: unknown): string | null {
  let value: number;
  if (typeof raw === 'number') value = raw;
  else if (typeof raw === 'string') value = parseColombianNumber(raw.replace(/[$\s]|COP/gi, ''));
  else return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONEY) return null;
  return String(Math.round(value * 100) / 100);
}

function parseOne(name: string, raw: unknown, spec: Spec): { value: unknown } | { error: string } {
  switch (spec.kind) {
    case 'int': {
      const n = parseInteger(raw);
      if (n === null || n < spec.min || n > spec.max) return { error: `${name} debe ser un entero entre ${spec.min} y ${spec.max}` };
      return { value: n };
    }
    case 'str': {
      if (typeof raw !== 'string') return { error: `${name} debe ser texto` };
      const text = sanitizeText(raw, spec.max);
      if (!text && spec.required) return { error: `${name} no puede estar vacío` };
      if (spec.pattern && !spec.pattern.test(text)) return { error: `${name} no tiene el formato esperado` };
      return { value: text };
    }
    case 'enum': {
      const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!spec.values.includes(text)) return { error: `${name} debe ser uno de: ${spec.values.join(', ')}` };
      return { value: text };
    }
    case 'money': {
      const money = parseMoney(raw);
      return money === null ? { error: `${name} debe ser un monto en pesos, solo números` } : { value: money };
    }
    case 'intArray': {
      if (!Array.isArray(raw) || raw.length < spec.minItems || raw.length > spec.maxItems) {
        return { error: `${name} debe ser una lista de ${spec.minItems} a ${spec.maxItems} ids` };
      }
      const numbers = raw.map(parseInteger);
      if (numbers.some((n) => n === null || n < spec.min || n > spec.max) || new Set(numbers).size !== numbers.length) {
        return { error: `${name} debe tener ids enteros distintos` };
      }
      return { value: numbers };
    }
  }
}

export function parseArgs(raw: Record<string, unknown>, specs: Record<string, Spec>): ParseResult {
  const unknownKey = Object.keys(raw).find((key) => !(key in specs));
  if (unknownKey) return { ok: false, error: `Argumento no permitido: ${unknownKey}. Permitidos: ${Object.keys(specs).join(', ')}` };
  const value: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const given = raw[name];
    if (given === undefined || given === null || given === '') {
      if (spec.required) return { ok: false, error: `Falta el argumento ${name}` };
      continue;
    }
    const parsed = parseOne(name, given, spec);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    value[name] = parsed.value;
  }
  return { ok: true, value };
}
