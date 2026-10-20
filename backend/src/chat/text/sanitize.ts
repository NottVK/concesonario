import { sanitizeText, truncate } from '../../common/text.js';

/**
 * Saneado de texto que llega al modelo: el mensaje del usuario y las descripciones que escribe el admin.
 * Todo texto de afuera es DATO, nunca instrucción.
 */

export { sanitizeText, truncate };

// Frases típicas de una orden escondida en un dato (la descripción de un vehículo, por ejemplo).
const INSTRUCTION_PATTERN =
  /\b(ignora|ignore|ignorar|olvida|olvidate|forget|disregard)\b|\bdi que\b|\bdiga que\b|\bresponde que\b|a partir de ahora|nuevas? instrucci|\binstrucciones\b|system prompt|\bprompt\b|\beres ahora\b|\bact[uú]a como\b|\byou are now\b|\bpretend\b/i;

export function looksLikeInstruction(text: string): boolean {
  return INSTRUCTION_PATTERN.test(text);
}

/**
 * Descripción de un vehículo apta para el modelo: saneada, de 300 caracteres como máximo y omitida
 * por completo (null) si parece una orden.
 */
export function safeDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const clean = sanitizeText(description, 300);
  if (!clean || looksLikeInstruction(clean)) return null;
  return clean;
}

/** Delimitadores de los datos de las tools; se eliminan de los propios datos para que no puedan "cerrarlos". */
export const DATA_OPEN = '<<<DATOS';
export const DATA_CLOSE = 'DATOS>>>';

export function stripDelimiters(text: string): string {
  return text.split(DATA_OPEN).join('').split(DATA_CLOSE).join('');
}

/** Texto libre de un dato (marca, color…): saneado y sin delimitadores. */
export function safeField(value: unknown, max = 80): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return stripDelimiters(sanitizeText(text, max));
}
