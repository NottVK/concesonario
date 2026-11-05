import { DATA_CLOSE, DATA_OPEN } from '../text/sanitize.js';
import type { ChatMessage, ChatRequest, ChatResponse } from './model-provider.js';

/**
 * Guion del mock para el taller (decisión 131): imita a un modelo que sigue la regla 13 del prompt con las tools.
 * Solo sirve para probar la lógica (validaciones del servidor, cédula fuera del modelo, agenda); no mide calidad.
 */

const TOOLS = new Set(['identificar_cliente_taller', 'prediagnosticar_taller', 'listar_sedes_taller', 'consultar_horarios_taller', 'apartar_hora_taller', 'agendar_cita_taller']);
const ASK_ID = 'Con gusto te ayudo con el taller. Para identificarte, escríbeme tu número de documento (DNI) y el número VIN de tu carro.';
const ASK_SYMPTOMS = '¿Qué le pasa al carro?';
const ASK_CONFIRM = '¿Confirmas?';
const SLOT_LINE = /(\d)\. [^[]*\[(\S+)\]/g;

const text = (content: string): ChatResponse => ({ content, toolCalls: [] });
const call = (name: string, args: Record<string, unknown>): ChatResponse => ({ content: '', toolCalls: [{ id: `mock-${name}`, name, arguments: args }] });
const str = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

function parse(message: ChatMessage): Record<string, unknown> {
  try {
    return JSON.parse(message.content.replace(DATA_OPEN, '').replace(DATA_CLOSE, '').trim()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function lastAssistant(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === 'assistant' && m.content)?.content ?? '';
}

function afterTool(message: ChatMessage): ChatResponse {
  const data = parse(message);
  if (typeof data.error === 'string') return text(data.error);
  const site = (data.sede ?? data.sede_recomendada ?? {}) as Record<string, unknown>;
  switch (message.toolName) {
    case 'identificar_cliente_taller':
      return text(`Encontré tu ${str(data.vehiculo)} de placa ${str(data.placa)}. ${ASK_SYMPTOMS}`);
    case 'prediagnosticar_taller':
      return call('consultar_horarios_taller', { sede: str(site.codigo) });
    case 'consultar_horarios_taller': {
      const list = Array.isArray(data.franjas) ? (data.franjas as Record<string, unknown>[]) : [];
      return text(`Horas libres en ${str(site.nombre)} {${str(site.codigo)}}: ${list.map((f, i) => `${i + 1}. ${str(f.texto)} [${str(f.fecha_hora)}]`).join(' ')}`);
    }
    case 'apartar_hora_taller':
      return text(`Te aparté {${str(site.codigo)}} el [${str(data.fecha_hora ?? '')}] ${str(data.fecha)}. ${ASK_CONFIRM}`);
    case 'agendar_cita_taller':
      return text(`¡Listo! Tu cita en el taller quedó agendada: orden ${str(data.orden)} en ${str(site.nombre)}, el ${str(data.fecha)}. ${str(data.siguiente_paso)}`);
    default:
      return text(JSON.stringify(data).slice(0, 200));
  }
}

function fromUser(request: ChatRequest, user: string): ChatResponse | null {
  const previous = lastAssistant(request.messages);
  if (/\[número\]/.test(user)) return call('identificar_cliente_taller', {});
  if (previous.endsWith(ASK_SYMPTOMS)) return call('prediagnosticar_taller', { sintomas: [user] });
  const choice = /^\s*(?:la\s+)?(\d)\s*$/i.exec(user)?.[1];
  if (choice && previous.includes('Horas libres')) {
    const slot = [...previous.matchAll(SLOT_LINE)].find((m) => m[1] === choice)?.[2];
    const site = /\{(\S+)\}/.exec(previous)?.[1];
    if (slot && site) return call('apartar_hora_taller', { sede: site, fecha_hora: slot });
  }
  if (previous.endsWith(ASK_CONFIRM)) {
    const site = /\{(\S+)\}/.exec(previous)?.[1];
    const slot = /\[(\S+)\]/.exec(previous)?.[1];
    if (site && slot) return call('agendar_cita_taller', { sede: site, fecha_hora: slot });
  }
  if (/\btaller\b/i.test(user)) return text(ASK_ID);
  return null;
}

/** null si el mensaje no es del taller o las tools del taller no se ofrecen en este turno. */
export function workshopMockReply(request: ChatRequest, user: string): ChatResponse | null {
  if (!request.tools?.some((tool) => TOOLS.has(tool.name))) return null;
  const last = request.messages[request.messages.length - 1];
  if (last?.role === 'tool' && last.toolName && TOOLS.has(last.toolName)) return afterTool(last);
  if (last?.role === 'tool') return null;
  return fromUser(request, user);
}
