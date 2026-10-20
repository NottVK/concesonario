/**
 * Redacción de datos personales ANTES de guardar el historial. Los nombres no se pueden detectar de forma
 * fiable; se mitiga porque el formulario de la cita los recoge fuera del chat.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Número precedido de la palabra que lo identifica como documento.
const LABELED_DOCUMENT = /\b(c[eé]dula|c\.?\s?c\.?|nit|documento|identificaci[oó]n|pasaporte)\b(?:\s+(?:es|n[úu]mero|numero|no\.?))*[\s:#.nº°-]*\d[\d.\s-]{4,14}\d/gi;
// Celular colombiano (3xx xxx xxxx) con o sin +57 y con separadores, o cualquier fijo de 7 a 10 dígitos con prefijo +57.
const PHONE = /(?:\+?57[\s-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b|\+57[\s-]?\d{7,10}\b/g;
// Cualquier tira de 10 dígitos seguidos (documentos largos); los montos van con separadores, así que no entran.
const LONG_DIGITS = /(?<![\d.,])\d{10}(?![\d.,])/g;

export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, '[correo]')
    .replace(LABELED_DOCUMENT, '[documento]')
    .replace(PHONE, '[teléfono]')
    .replace(LONG_DIGITS, '[documento]');
}
