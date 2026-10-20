import { readFileSync } from 'node:fs';
import { BUSINESS_TIME_ZONE } from '../../citas/appointment-rules.js';

/** Versión del prompt vigente. Cada versión nueva es OTRO archivo; no se edita uno ya evaluado. */
export const PROMPT_VERSION = 'v1';
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

function grams(): Set<string> {
  if (promptGrams) return promptGrams;
  promptGrams = gramsOf(words(basePrompt()));
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
