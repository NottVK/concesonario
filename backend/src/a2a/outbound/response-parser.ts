import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { OutboundFailure } from './errors.js';

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null);

/** Estados con los que un bot dice que NO pudo resolver la tarea. */
const FAILED = new Set(['failed', 'rejected', 'error', 'canceled', 'cancelled']);

/**
 * Saca el texto de la respuesta de otro bot. Parser tolerante a POCAS formas (decisión 115): `answer`, `message`,
 * `response`, `text` o `result.parts[0].text`. Lo que no se pueda interpretar es `respuesta_invalida`; si el bot dice que
 * falló, `error_remoto`. El texto que devuelve sigue siendo un dato no confiable: hay que sanearlo antes de mostrarlo.
 */
export function parseRemoteAnswer(body: string): string {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'json');
  }
  if (!isObject(value)) throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'forma');
  const result = isObject(value.result) ? value.result : null;
  const parts = Array.isArray(result?.parts) ? (result.parts as unknown[]) : [];
  const first = isObject(parts[0]) ? parts[0] : null;
  const answer = nonEmptyString(value.answer) ?? nonEmptyString(value.message) ?? nonEmptyString(value.response) ?? nonEmptyString(value.text) ?? nonEmptyString(first?.text);
  if (typeof value.status === 'string' && FAILED.has(value.status.toLowerCase())) throw new OutboundFailure(ExchangeStatus.REMOTE_ERROR, 'estado-fallido');
  if (answer === null) throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'sin-texto');
  return answer;
}

export interface RemoteCard {
  name: string | null;
  description: string | null;
  url: string | null;
  skills: string[];
}

/** Datos mínimos de la tarjeta de otro bot. Todo es texto no confiable: se sanea antes de mostrarlo y NUNCA llega al modelo. */
export function parseRemoteCard(body: string): RemoteCard {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'tarjeta-json');
  }
  if (!isObject(value)) throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'tarjeta-forma');
  const skills = Array.isArray(value.skills) ? value.skills.filter((skill): skill is string => typeof skill === 'string').slice(0, 20) : [];
  return {
    name: nonEmptyString(value.name),
    description: nonEmptyString(value.description),
    url: nonEmptyString(value.url),
    skills,
  };
}
