/**
 * Saneado de texto que viene de afuera (búsquedas, mensajes del chat, descripciones): NFC, sin caracteres
 * invisibles ni de control, espacios colapsados y tope de largo. Todo texto externo es DATO, nunca instrucción.
 */

// Control (salvo salto de línea y tab, que luego se colapsan), ancho cero, bidireccionales y "tags" Unicode
// (con los que se puede esconder texto invisible). Se escriben con escapes para que el archivo no los contenga.
/* oxlint-disable no-control-regex -- justamente se buscan caracteres de control */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu;
/* oxlint-enable no-control-regex */

/** Recorta por caracteres reales (no parte un par sustituto por la mitad). */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('').trimEnd();
}

/** NFC, sin caracteres invisibles, espacios colapsados y tope de largo. */
export function sanitizeText(input: string, max: number): string {
  return truncate(input.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim(), max);
}
