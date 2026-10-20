import { createHash } from 'node:crypto';

const EMAIL = /[^\s@<>()[\]]{1,64}@[^\s@<>()[\]]{1,255}\.[A-Za-z]{2,}/g;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]{1,10}:\/\/|www\.)\S*/gi;
/** Números largos con separadores (teléfonos, cédulas, tarjetas): 7 dígitos o más, seguidos o separados por espacio, punto, guion o paréntesis. */
const LONG_NUMBER = /\+?\d(?:[\s.()-]{0,4}\d){6,}/g;
/** Dominios sueltos («bit.ly/oferta», «automax-promo.example/pagar», «oferta.com»): nombre con un TLD frecuente, y su ruta si la tiene. */
const BARE_DOMAIN =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){0,4}\.(?:com|co|net|org|io|ly|me|app|dev|info|biz|xyz|top|site|online|example|test|link|click|live|store|shop|club|vip|cc|us|ru|cn|tk|ml|ga|cf|gq|ws|lat|mx|es|ar|cl|pe|ec|ve|br|gl|gd|su)(?:\.[a-z]{2,3}){0,2}\b(?:\/\S{0,200})?/gi;
/** Correos «ofuscados» para esquivar un filtro: «ana [at] correo [dot] com», «ana (arroba) correo (punto) com», «ana arroba correo punto com». */
const OBFUSCATED_EMAIL_BRACKETS =
  /[\p{L}\p{N}._+-]{1,64}\s{0,3}[[({]\s{0,3}(?:at|arroba)\s{0,3}[\])}]\s{0,3}[\p{L}\p{N}.-]{1,120}(?:\s{0,3}[[({]\s{0,3}(?:dot|punto)\s{0,3}[\])}]\s{0,3}[\p{L}\p{N}-]{1,63}){0,3}/giu;
const OBFUSCATED_EMAIL_WORDS =
  /[\p{L}\p{N}._+-]{1,64}\s{1,3}arroba\s{1,3}[\p{L}\p{N}-]{1,63}(?:\s{1,3}punto\s{1,3}[\p{L}\p{N}-]{1,63}){1,3}/giu;
/** Cifras dichas con palabras («tres cero cero uno dos tres…»): siete o más seguidas es un teléfono o una cédula. */
const SPELLED_DIGITS = /(?:\b(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b[\s,.-]{1,3}){6,}\b(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/giu;
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

export type MaskKind = 'correo' | 'enlace' | 'numero';

/**
 * Reemplaza correos, enlaces (con esquema, `www.` o un dominio suelto) y números largos (teléfonos, cédulas) por marcas.
 * Recibe texto ya aplanado (`normalizeText`). Cada reemplazo avisa por `onMask` para quien quiera registrar qué se tapó.
 */
export function maskContacts(flat: string, onMask: (kind: MaskKind) => void = () => undefined): string {
  const tag = (kind: MaskKind, label: string) => () => {
    onMask(kind);
    return label;
  };
  return flat
    .replace(EMAIL, tag('correo', '[correo]'))
    .replace(OBFUSCATED_EMAIL_BRACKETS, tag('correo', '[correo]'))
    .replace(OBFUSCATED_EMAIL_WORDS, tag('correo', '[correo]'))
    .replace(URL_LIKE, tag('enlace', '[enlace]'))
    .replace(BARE_DOMAIN, tag('enlace', '[enlace]'))
    .replace(SPELLED_DIGITS, tag('numero', '[número]'))
    .replace(LONG_NUMBER, (match, offset: number, whole: string) => {
      // El contexto del precio se mira en el texto que se está reemplazando (los reemplazos anteriores cambiaron los largos).
      if (looksLikePrice(whole, offset, offset + match.length)) return match;
      onMask('numero');
      return '[número]';
    });
}

/**
 * Normaliza un texto antes de guardarlo en la auditoría: NFKC, sin caracteres invisibles ni de control, correos,
 * enlaces y números largos reemplazados por marcas, espacios colapsados. No pretende detectar todo dato personal (un
 * nombre propio pasa); por eso la auditoría además recorta y caduca a los 30 días.
 */
export function redactForAudit(input: string): string {
  return maskContacts(flatten(input)).replace(/\s+/g, ' ').trim();
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
