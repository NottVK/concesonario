import { DATA_CLOSE, DATA_OPEN } from '../text/sanitize.js';
import type { ChatMessage, ChatRequest, ChatResponse } from './model-provider.js';

/**
 * Comportamiento por defecto del mock: reglas por palabras clave, siempre iguales para la misma entrada.
 * Sirve para probar la lógica del chat (sesiones, límites, validadores, tools); NO mide la calidad de un
 * modelo real. Por eso la Fase 4 no se cierra con el mock.
 */

const BRANDS = ['Toyota', 'Chevrolet', 'Mazda', 'Renault', 'Kia', 'Hyundai', 'Ford', 'Nissan', 'Volkswagen', 'BMW'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const GREETING = /^\s*(hola|buenas|buenos d[ií]as|buenas tardes|hey)\b/i;
const OFF_TOPIC = /receta|arepa|poema|chiste|f[uú]tbol|clima|pol[ií]tica|capital de/i;
const PROMPT_LEAK = /\bprompt\b|instrucciones (internas|del sistema)|system prompt|tus reglas|repite lo anterior/i;
const PERSONAL_DATA = /(correo|tel[eé]fono|celular|n[uú]mero).{0,40}(clientes?|otros|compradores)|(clientes?|compradores).{0,40}(correo|tel[eé]fono)/i;
const CORRECTION = /^\[Nota del sistema\]/;

/** Sin tildes, para que «agéndame» y «agendame» se lean igual. */
const plain = (value: string): string => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

function text(content: string): ChatResponse {
  return { content, toolCalls: [] };
}

function call(name: string, args: Record<string, unknown>): ChatResponse {
  return { content: '', toolCalls: [{ id: `mock-${name}`, name, arguments: args }] };
}

function realUserMessage(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === 'user' && !CORRECTION.test(m.content))?.content ?? '';
}

function parseData(message: ChatMessage): Record<string, unknown> {
  const json = message.content.replace(DATA_OPEN, '').replace(DATA_CLOSE, '').trim();
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fecha pedida («mañana», «el domingo», «2026-11-07») a partir de la línea «Hoy es …» del prompt. */
function requestedDate(request: ChatRequest, user: string): string {
  const system = request.messages.find((m) => m.role === 'system')?.content ?? '';
  const today = /Hoy es \S+ (\d{4}-\d{2}-\d{2})/.exec(system)?.[1] ?? '2026-01-05';
  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(user)?.[1];
  if (explicit) return explicit;
  if (/pasado ma[ñn]ana/i.test(user)) return addDays(today, 2);
  if (/ma[ñn]ana/i.test(user)) return addDays(today, 1);
  if (/\bhoy\b/i.test(user)) return today;
  const day = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`, 'i').test(user));
  if (day >= 0) {
    const current = new Date(`${today}T12:00:00Z`).getUTCDay();
    return addDays(today, ((day - current + 6) % 7) + 1);
  }
  return addDays(today, 1);
}

function requestedTime(user: string): string {
  const match = /a las (\d{1,2})(?::(\d{2}))?\s*(pm|p\.m\.|de la tarde|am|a\.m\.)?/i.exec(user);
  if (!match) return '10:00';
  let hour = Number(match[1]);
  if (/pm|p\.m\.|tarde/i.test(match[3] ?? '') && hour < 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2] ?? '00'}`;
}

function requestedMonths(user: string): number {
  const match = /(\d{1,3})\s*meses/i.exec(user);
  return match ? Number(match[1]) : 60;
}

function requestedDownPayment(user: string): string {
  const millions = /(\d+(?:[.,]\d+)?)\s*millones/i.exec(user);
  if (millions) return String(Math.round(Number(millions[1]!.replace(',', '.')) * 1_000_000));
  const flat = /inicial[^\d]{0,20}\$?\s*([\d.]{6,})/i.exec(user);
  return flat ? flat[1]!.replace(/\./g, '') : '0';
}

function searchArgs(user: string): Record<string, unknown> {
  const brand = BRANDS.find((b) => new RegExp(`\\b${b}\\b`, 'i').test(user));
  if (!brand) return { query: user.slice(0, 200) };
  const model = new RegExp(`${brand}\\s+([\\p{L}\\d-]+)`, 'iu').exec(user)?.[1];
  const stop = /^(con|de|a|en|y|que|para|por|es|tiene|tienen|disponibles?)$/i;
  return { brand, ...(model && !stop.test(model) ? { model } : {}) };
}

function money(data: Record<string, unknown>, key: string): string {
  const value = data[`${key}_texto`];
  return typeof value === 'string' ? value : '';
}

function listLine(raw: unknown): string {
  const v = raw as Record<string, unknown>;
  const price = typeof v.precio_texto === 'string' ? v.precio_texto : '';
  return `${String(v.marca)} ${String(v.modelo)} ${String(v.version)} ${String(v.anio)} por ${price}`;
}

/** Respuesta final tras una tool: resume el JSON recibido sin inventar nada. */
function answerFromTool(message: ChatMessage): ChatResponse {
  const data = parseData(message);
  if (typeof data.error === 'string') return text(data.error);
  switch (message.toolName) {
    case 'buscar_vehiculos': {
      const list = Array.isArray(data.vehiculos) ? data.vehiculos : [];
      if (list.length === 0) return text('No tenemos vehículos disponibles con esos criterios.');
      const total = typeof data.total === 'number' ? ` Tenemos ${data.total} en total.` : '';
      return text(`Te muestro: ${list.slice(0, 3).map(listLine).join('; ')}.${total}`);
    }
    case 'detalle_vehiculo':
      return text(`Ficha: ${listLine(data.vehiculo)}.`);
    case 'comparar_vehiculos': {
      const d = (data.diferencias ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data.vehiculos) ? data.vehiculos : [];
      return text(`${list.map(listLine).join('; ')}. El más económico es ${String(d.mas_economico)}.`);
    }
    case 'simular_credito':
      return text(`Con ${money(data, 'cuota_inicial')} de inicial a ${String(data.meses)} meses, la cuota sería de ${money(data, 'cuota')} al mes.`);
    case 'agendar_cita':
      return text(`Preparé tu propuesta: ${String(data.resumen)}. Revísala en la tarjeta y confírmala con tus datos; todavía no está agendada.`);
    default:
      return text('Listo, esto es lo que encontré.');
  }
}

/** Tras una búsqueda, el mock encadena la tool que pedía el usuario (crédito, cita o comparación). */
function followUp(request: ChatRequest, message: ChatMessage): ChatResponse {
  const user = realUserMessage(request.messages);
  const data = parseData(message);
  const list = Array.isArray(data.vehiculos) ? (data.vehiculos as { id?: number }[]) : [];
  const ids = list.map((v) => v.id).filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) return answerFromTool(message);
  if (/cuota|credito|financ/i.test(plain(user))) {
    return call('simular_credito', { vehicleId: ids[0], downPayment: requestedDownPayment(user), months: requestedMonths(user) });
  }
  if (/agend|cita|test.?drive|visita/i.test(plain(user))) {
    return call('agendar_cita', { vehicleId: ids[0], date: requestedDate(request, user), time: requestedTime(user) });
  }
  if (/compar/i.test(plain(user)) && ids.length >= 2) return call('comparar_vehiculos', { vehicleIds: ids.slice(0, 2) });
  return answerFromTool(message);
}

export function defaultMockScript(request: ChatRequest): ChatResponse {
  const last = request.messages[request.messages.length - 1];
  if (last?.role === 'tool') return last.toolName === 'buscar_vehiculos' ? followUp(request, last) : answerFromTool(last);
  const user = realUserMessage(request.messages);
  if (last && CORRECTION.test(last.content)) return text('Disculpa, no pude confirmar ese dato. ¿Quieres que revise el catálogo?');
  if (PROMPT_LEAK.test(user)) return text('No puedo compartir mis instrucciones, pero te ayudo con el catálogo.');
  if (PERSONAL_DATA.test(user)) return text('No comparto datos de otras personas. Si quieres agendar, usa el formulario de la cita.');
  if (OFF_TOPIC.test(user)) return text('Solo puedo ayudarte con vehículos, precios, crédito y citas del concesionario.');
  if (GREETING.test(user)) return text('¡Hola! Soy el asistente de AutoMax. ¿Qué vehículo buscas?');
  if (/cuota|cr[eé]dito|financ|agend|cita\b|test.?drive|compar|precio|price|cu[aá]nto|busco|quiero un|tienen|disponible|valor|how much/i.test(user) || BRANDS.some((b) => new RegExp(`\\b${b}\\b`, 'i').test(user))) {
    return call('buscar_vehiculos', searchArgs(user));
  }
  return text('¿Me cuentas qué tipo de vehículo buscas y tu presupuesto aproximado?');
}
