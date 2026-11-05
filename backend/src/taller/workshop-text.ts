import { sanitizeText } from '../common/text.js';
import { looksLikeInstruction } from '../chat/text/sanitize.js';
import { VIN_PATTERN } from '../vin/vin-decoder.js';
import type { Site } from './workshop.types.js';

/**
 * Lecturas del mensaje del cliente y formato de los datos del taller (decisión 131). Aquí no hay pasos ni guion:
 * el orden lo decide el modelo con las tools; esto solo extrae, tapa y formatea.
 */

const ACTION = /\b(cita|agendar|agenda|agendame|ag[eé]ndame|llevar|lleve|revisar|revisen|revisi[oó]n|programar|reparar|arreglar|chequear|mirar|diagn[oó]stico)\b/i;
const WORKSHOP_WORD = /\b(revisi[oó]n|mantenimiento|reparaci[oó]n|reparar|arreglar|diagn[oó]stico|falla|fallando|ruido|chilla|suena|vibra|garant[ií]a|frenos?|motor|suspensi[oó]n|embrague|bater[ií]a|aceite)\b/i;
const TEST_DRIVE = /test.?drive|prueba de manejo/i;

// Viene por la garantía de SU carro (no pregunta qué garantía tiene un carro del catálogo).
const WARRANTY_CLAIM = /\b(por|reclamar|cobrar|cobro\s+de|hacer\s+(v[aá]lida|efectiva)|usar|aplicar|aplica|cubr\w*|vengo\s+por)\s+(la\s+|mi\s+|una\s+)?garant[ií]a/i;
const PART = /\b(repuestos?|piezas?)\b/i;
const REPLACE = /\b(cambi\w*|reemplaz\w*|instal\w*)\b|\bmi\s+(carro|veh[ií]culo|camioneta)\b/i;

/** El mensaje habla de llevar el carro al taller, de la garantía o de cambiarle un repuesto (y no de un test-drive). */
export function wantsWorkshop(message: string): boolean {
  if (TEST_DRIVE.test(message)) return false;
  return /\btaller\b/i.test(message) || WARRANTY_CLAIM.test(message) || (PART.test(message) && REPLACE.test(message)) || (WORKSHOP_WORD.test(message) && ACTION.test(message));
}

/** La cédula: de 6 a 10 dígitos sueltos (acepta puntos o espacios de miles: 39.765.432). */
export function extractCedula(message: string): string | null {
  for (const match of message.matchAll(/(?<![A-Za-z0-9])\d[\d.\s]{4,13}\d(?![A-Za-z0-9])/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 10) return digits;
  }
  return null;
}

export function extractVin(message: string): string | null {
  for (const match of message.matchAll(/(?<![A-Za-z0-9])[A-Za-z0-9]{17}(?![A-Za-z0-9])/g)) {
    const candidate = match[0].toUpperCase();
    if (VIN_PATTERN.test(candidate) && /\d/.test(candidate) && /[A-Z]/.test(candidate)) return candidate;
  }
  return null;
}

/** Tapa números de 6 a 10 dígitos (cédulas, teléfonos) antes de que el mensaje llegue al modelo o al historial. */
export function redactNumbers(message: string): string {
  return message.replace(/(?<![A-Za-z0-9])\d[\d.\s]{4,13}\d(?![A-Za-z0-9])/g, (match) => {
    const digits = match.replace(/\D/g, '').length;
    return digits >= 6 && digits <= 10 ? '[número]' : match;
  });
}

/** Lo que se le manda al taller como mensaje del cliente: sin números personales ni VIN. */
export function symptomText(message: string): string {
  return sanitizeText(redactNumbers(message).replace(/(?<![A-Za-z0-9])[A-Za-z0-9]{17}(?![A-Za-z0-9])/g, '[VIN]'), 300);
}

const IDENTITY = /\b(y\s+)?(el\s+|la\s+|mi\s+)?(c[eé]dula|cc|dni|n[uú]mero\s+de\s+documento|documento(\s+de\s+identidad)?|(n[uú]mero\s+)?vin)\s*(es|:)?\s*\[(número|VIN)\]/gi;

/** El mensaje del cliente con sus palabras, sin la cédula ni el VIN; null si no queda nada que describa la falla. */
export function customerWords(message: string): string | null {
  const text = symptomText(message).replace(IDENTITY, '').replace(/\[(número|VIN)\]/g, '').replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[\s,;:]+$/, '').trim();
  return (text.match(/\p{L}/gu) ?? []).length >= 8 ? text : null;
}

export const claimsWarranty = (messages: string[]): boolean => messages.some((m) => /garant/i.test(m));

const NEGATIVE = /^\s*(no|nop|mejor no|todav[ií]a no|a[uú]n no|espera)(?![A-Za-z0-9])|\bno\s+(quiero|me sirve|puedo|agendes|la agendes)\b/i;
const POSITIVE = /(?:^|[\s¡,.])(s[ií]|dale|confirmo|confirma|confirmar|ok|okay|de una|claro|listo|perfecto|h[aá]gale|de acuerdo|est[aá] bien|me sirve|esa|agend|reserv|apart)/i;

/** El cliente acepta agendar en este mensaje (la tool de agendar no avanza sin esto). */
export function acceptsBooking(message: string): boolean {
  return !NEGATIVE.test(message) && POSITIVE.test(message);
}

/** Texto del taller apto para el modelo y el cliente: saneado, corto y sin nada que parezca una orden. */
export function clean(value: string | null | undefined, max = 160): string {
  const text = sanitizeText(value ?? '', max);
  return looksLikeInstruction(text) ? '[texto omitido]' : text;
}

const slotFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

export function formatSlot(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? clean(iso, 40) : `${slotFormat.format(date)} (hora de Bogotá)`;
}

export function formatPesos(value: number): string {
  return `$${new Intl.NumberFormat('es-CO').format(value)}`;
}

const DAY_NAMES = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function scheduleText(site: Site): string | null {
  const h = site.horario;
  if (!h?.dias?.length || !h.apertura || !h.cierre) return null;
  const days = [...h.dias].sort((a, b) => a - b);
  const range = days.length > 1 ? `${DAY_NAMES[days[0]!]} a ${DAY_NAMES[days[days.length - 1]!]}` : DAY_NAMES[days[0]!];
  return `${range} de ${clean(h.apertura, 10)} a ${clean(h.cierre, 10)}`;
}

/** Sede como la ve el modelo: sin teléfono (un número de 10 dígitos lo bloquea la revisión de datos personales). */
export function siteView(site: Site): Record<string, unknown> {
  const direccion = [site.ubicacion?.direccion, site.ubicacion?.ciudad].filter(Boolean).map((part) => clean(part, 120)).join(', ');
  return {
    codigo: clean(site.codigo, 40),
    nombre: clean(site.nombre),
    ...(site.tipo ? { tipo: clean(site.tipo, 40) } : {}),
    ...(site.especialidades ? { especialidades: site.especialidades.map((e) => clean(e, 40)) } : {}),
    ...(direccion ? { direccion } : {}),
    ...(scheduleText(site) ? { horario: scheduleText(site) } : {}),
  };
}
