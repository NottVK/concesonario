import { readFileSync } from 'node:fs';
import { BUSINESS_TIME_ZONE } from '../../citas/appointment-rules.js';

/** `CHAT_PROMPT_VERSION` (v1, v2 o vin; por defecto vin = solo ficha por VIN). Cualquier otro valor cae en vin. */
function resolvePromptVersion(): string {
  const value = process.env.CHAT_PROMPT_VERSION?.trim();
  return value === 'v1' || value === 'v2' ? value : 'vin';
}

/** Versión del prompt vigente. Cada versión nueva es OTRO archivo; no se edita uno ya evaluado. */
export const PROMPT_VERSION = resolvePromptVersion();
export const CANARY = 'CANARIO-9F3K-7Q2X';

let cached: string | null = null;

function basePrompt(): string {
  cached ??= readFileSync(new URL(`../prompts/system.${PROMPT_VERSION}.es.md`, import.meta.url), 'utf8').trim();
  return cached;
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('es-CO', { timeZone: BUSINESS_TIME_ZONE, weekday: 'long' });

/** Prompt de sistema fijo + una línea con la fecha de hoy en Bogotá. Nada del usuario ni de las tools entra aquí. */
export function buildSystemPrompt(now: Date): string {
  return `${basePrompt()}\n\nHoy es ${weekdayFormat.format(now)} ${dayFormat.format(now)} (hora de Bogotá).`;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
}

const NGRAM = 7;
let promptGrams: Set<string> | null = null;

/**
 * Frases del prompt que el bot DEBE poder decir porque describen su alcance público (qué hace, qué datos trae,
 * cómo es un VIN, qué datos no tiene). Con un prompt tan corto como el de `vin`, la respuesta correcta a un tema
 * ajeno repetía siete palabras del prompt y se tomaba como fuga (decisión 129). Las reglas de seguridad y el
 * canario no están aquí: siguen protegidos. v1 y v2 no tienen excepciones (comportamiento sin cambios).
 */
export const PUBLIC_PROMPT_TEXT: Readonly<Record<string, string>> = {
  vin: [
    'Tu única función es consultar la ficha pública de un vehículo a partir de su VIN con la herramienta consultar_ficha_vin.',
    'La ficha trae: marca, modelo, año, versión, carrocería, puertas, combustible y transmisión. Nada más.',
    'di en una frase que solo puedes consultar la ficha de un vehículo por su VIN y pide el VIN.',
    'El VIN tiene 17 caracteres entre letras y números, sin I, O ni Q.',
    'pídele el VIN de 17 caracteres.',
    'No des ni confirmes datos del dueño, de la compra, del kilometraje, del precio ni de la garantía. No los tienes.',
    'di exactamente que no encontraste una ficha pública para ese VIN',
  ].join('\n'),
};

function grams(): Set<string> {
  if (promptGrams) return promptGrams;
  const publicGrams = gramsOf(words(PUBLIC_PROMPT_TEXT[PROMPT_VERSION] ?? ''));
  promptGrams = new Set([...gramsOf(words(basePrompt()))].filter((gram) => !publicGrams.has(gram)));
  return promptGrams;
}

function gramsOf(list: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + NGRAM <= list.length; i++) out.add(list.slice(i, i + NGRAM).join(' '));
  return out;
}

/**
 * true si la respuesta contiene el canario o copia siete palabras seguidas del prompt. Lo que dicen las
 * tools (`allowedText`) y el propio usuario no cuenta como fuga: el horario de atención, por ejemplo,
 * aparece en el prompt y también en los mensajes de error de las tools.
 */
export function leaksPrompt(reply: string, allowedText = ''): boolean {
  if (reply.toUpperCase().includes(CANARY)) return true;
  const list = words(reply);
  const known = grams();
  const allowed = gramsOf(words(allowedText));
  for (let i = 0; i + NGRAM <= list.length; i++) {
    const gram = list.slice(i, i + NGRAM).join(' ');
    if (known.has(gram) && !allowed.has(gram)) return true;
  }
  return false;
}
