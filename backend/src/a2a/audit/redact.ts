import { createHash } from 'node:crypto';

const EMAIL = /[^\s@<>()[\]]{1,64}@[^\s@<>()[\]]{1,255}\.[A-Za-z]{2,}/g;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]{1,10}:\/\/|www\.)\S+/gi;
/** Números largos con separadores (teléfonos, cédulas, tarjetas): 7 dígitos o más, seguidos o separados por espacio, punto, guion o paréntesis. */
const LONG_NUMBER = /\+?\d(?:[\s.()-]{0,2}\d){6,}/g;
/** Caracteres de control (salvo el espacio), de formato invisibles y de dirección de texto. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** `$ 85.000.000` o `85.000.000 COP` son precios del catálogo, no teléfonos: no se tapan. */
function looksLikePrice(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 3), start);
  const after = text.slice(end, end + 8);
  return /\$\s*$/.test(before) || /^\s*(?:cop|pesos)\b/i.test(after);
}

/** NFKC y sin caracteres de control, invisibles ni de dirección de texto (se reemplazan por un espacio). */
function flatten(input: string): string {
  return input.normalize('NFKC').replace(INVISIBLE, ' ');
}

/** Texto de otro bot listo para analizarlo: normalizado, sin invisibles y con los espacios colapsados. */
export function normalizeText(input: string): string {
  return flatten(input).replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza un texto antes de guardarlo en la auditoría: NFKC, sin caracteres invisibles ni de control, correos,
 * enlaces y números largos reemplazados por marcas, espacios colapsados. No pretende detectar todo dato personal (un
 * nombre propio pasa); por eso la auditoría además recorta y caduca a los 30 días.
 */
export function redactForAudit(input: string): string {
  const flat = flatten(input);
  return flat
    .replace(EMAIL, '[correo]')
    .replace(URL_LIKE, '[enlace]')
    .replace(LONG_NUMBER, (match, offset: number) => (looksLikePrice(flat, offset, offset + match.length) ? match : '[número]'))
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AuditText {
  /** Texto redactado y recortado a `maxChars` caracteres (no parte un carácter de dos unidades). */
  text: string;
  /** SHA-256 hexadecimal del texto redactado COMPLETO (antes de recortar). */
  hash: string;
}

export function auditText(input: string, maxChars: number): AuditText {
  const redacted = redactForAudit(input);
  const hash = createHash('sha256').update(redacted, 'utf8').digest('hex');
  return { text: Array.from(redacted).slice(0, maxChars).join(''), hash };
}
