import { parseArgs } from './args.js';
import { sanitizeText } from '../text/sanitize.js';
import { toolError } from './tool-types.js';
import type { ChatTool, ToolContext, ToolResult } from './tool-types.js';
import type { SlotPick, WorkshopTurn } from './workshop.js';

/**
 * Tools del taller (decisiones 131 y 133). El modelo decide cuándo usar cada una; el servidor valida cada paso (cliente
 * identificado, sede decidida por el taller, hora ofrecida y apartada, aceptación explícita) y nunca le muestra la cédula.
 */
export const WORKSHOP_TOOL_NAMES = [
  'identificar_cliente_taller',
  'prediagnosticar_taller',
  'listar_sedes_taller',
  'consultar_horarios_taller',
  'apartar_hora_taller',
  'agendar_cita_taller',
] as const;

const UNAVAILABLE = 'El taller no está disponible en este momento.';
const SITE = /^[A-Za-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_SYMPTOMS = 5;

function turn(ctx: ToolContext): WorkshopTurn | null {
  return ctx.workshop ?? null;
}

function data(value: Record<string, unknown>): ToolResult {
  return { data: value };
}

export const identificarClienteTaller: ChatTool = {
  name: 'identificar_cliente_taller',
  definition: {
    name: 'identificar_cliente_taller',
    description:
      'Identifica al cliente que viene por garantía, por un cambio de repuesto o al taller con el número de documento (DNI) y el VIN que ÉL escribió en el chat ' +
      '(tú no ves el documento: aparece como [número]). No lleva argumentos. Devuelve el vehículo, la placa y la garantía, o qué dato falta.',
    parameters: { type: 'object', properties: {} },
  },
  async run(_raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    return data(await workshop.gateway.identify(ctx.sessionId));
  },
};

/** Acepta una lista de textos o un texto suelto; cada uno saneado y con tope. */
function parseSymptoms(raw: unknown): string[] | null {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
  if (!list) return null;
  const texts = list.filter((item): item is string => typeof item === 'string').map((item) => sanitizeText(item, 300)).filter(Boolean);
  return texts.length > 0 ? texts.slice(0, MAX_SYMPTOMS) : null;
}

export const prediagnosticarTaller: ChatTool = {
  name: 'prediagnosticar_taller',
  definition: {
    name: 'prediagnosticar_taller',
    description:
      'Le envía al bot del taller lo que le pasa al carro (o el motivo de la garantía) del cliente ya identificado; el taller decide a qué sede va. ' +
      'Pasa en `sintomas` lo que el cliente contó, con sus palabras (sin documento ni teléfonos). Devuelve especialidad, servicios probables con precio, ' +
      'garantía, una estimación de si la garantía aplica (NO es una promesa) y la sede recomendada con el motivo de la decisión. Puede tardar hasta 30 segundos.',
    parameters: {
      type: 'object',
      properties: { sintomas: { type: 'array', items: { type: 'string' }, description: 'Lo que contó el cliente, un mensaje por elemento' } },
      required: ['sintomas'],
    },
  },
  async run(raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    const symptoms = parseSymptoms(raw.sintomas);
    if (!symptoms) return toolError('sintomas debe ser una lista con lo que contó el cliente.');
    return data(await workshop.gateway.prediagnose(ctx.sessionId, symptoms));
  },
};

export const listarSedesTaller: ChatTool = {
  name: 'listar_sedes_taller',
  definition: {
    name: 'listar_sedes_taller',
    description: 'Lista las sedes activas del taller con su tipo (mantenimiento o especializado), especialidades, dirección y horario.',
    parameters: { type: 'object', properties: {} },
  },
  async run(_raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    return data(await workshop.gateway.sites());
  },
};

export const consultarHorariosTaller: ChatTool = {
  name: 'consultar_horarios_taller',
  definition: {
    name: 'consultar_horarios_taller',
    description:
      'Consulta la agenda de una sede del taller (las próximas dos semanas) y devuelve hasta 4 horas libres. Sin `sede` usa la sede que decidió el taller ' +
      'en el prediagnóstico (lo normal); pasa `fecha` AAAA-MM-DD si el cliente pidió un día. Ofrécele al cliente SOLO estas horas. Nunca le pidas al cliente el código de la sede.',
    parameters: {
      type: 'object',
      properties: {
        sede: { type: 'string', description: 'Código de la sede (opcional: sin él, la que decidió el taller)' },
        fecha: { type: 'string', description: 'Fecha AAAA-MM-DD (opcional)' },
      },
    },
  },
  async run(raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    const parsed = parseArgs(raw, { sede: { kind: 'str', max: 40, pattern: SITE }, fecha: { kind: 'str', max: 10, pattern: DATE } });
    if (!parsed.ok) return toolError(parsed.error);
    const date = typeof parsed.value.fecha === 'string' && parsed.value.fecha ? parsed.value.fecha : null;
    const site = typeof parsed.value.sede === 'string' && parsed.value.sede ? parsed.value.sede : null;
    return data(await workshop.gateway.slots(ctx.sessionId, site, date));
  },
};

const PICK_SPEC = {
  opcion: { kind: 'int', min: 1, max: 4 },
  sede: { kind: 'str', max: 40, pattern: SITE },
  fecha_hora: { kind: 'str', max: 40, pattern: DATE_TIME },
} as const;

const PICK_PROPERTIES = {
  opcion: { type: 'integer', description: 'Número de la hora que eligió el cliente en la última lista (1 a 4), por ejemplo 2 si dijo «la 2»' },
  sede: { type: 'string', description: 'Código de la sede (solo si no usas opcion)' },
  fecha_hora: { type: 'string', description: 'fecha_hora exacta de la franja (solo si no usas opcion), por ejemplo 2026-11-05T14:00:00-05:00' },
};

/** La hora elegida: `opcion` (de la última lista) o `sede` + `fecha_hora`; null si no vino ninguna de las dos formas. */
function parsePick(raw: Record<string, unknown>): { pick: SlotPick | null } | { error: string } {
  const parsed = parseArgs(raw, PICK_SPEC);
  if (!parsed.ok) return { error: parsed.error };
  const { opcion, sede, fecha_hora: slot } = parsed.value;
  if (typeof opcion === 'number') return { pick: { option: opcion } };
  if (typeof sede === 'string' && sede && typeof slot === 'string' && slot) return { pick: { site: sede, slot } };
  if (sede || slot) return { error: 'Pasa opcion, o sede y fecha_hora juntas.' };
  return { pick: null };
}

export const apartarHoraTaller: ChatTool = {
  name: 'apartar_hora_taller',
  definition: {
    name: 'apartar_hora_taller',
    description:
      'Aparta en el taller, por 10 minutos, la hora que eligió el cliente mientras confirma. Úsala apenas el cliente elija una hora de consultar_horarios_taller: ' +
      'pasa `opcion` con el número que eligió (por ejemplo 2). Luego resume sede, dirección, fecha y hora y pregúntale si confirma.',
    parameters: { type: 'object', properties: PICK_PROPERTIES },
  },
  async run(raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    const parsed = parsePick(raw);
    if ('error' in parsed) return toolError(parsed.error);
    if (!parsed.pick) return toolError('Pasa opcion con el número de la hora que eligió el cliente.');
    return data(await workshop.gateway.hold(ctx.sessionId, parsed.pick));
  },
};

export const agendarCitaTaller: ChatTool = {
  name: 'agendar_cita_taller',
  definition: {
    name: 'agendar_cita_taller',
    description:
      'Agenda en el taller la hora que el cliente eligió y que quedó apartada con apartar_hora_taller. Úsala SOLO cuando el cliente respondió que sí. ' +
      'Sin argumentos agenda la hora apartada. Devuelve el código de la orden y el siguiente paso.',
    parameters: { type: 'object', properties: PICK_PROPERTIES },
  },
  async run(raw, ctx) {
    const workshop = turn(ctx);
    if (!workshop) return toolError(UNAVAILABLE);
    const parsed = parsePick(raw);
    if ('error' in parsed) return toolError(parsed.error);
    return data(await workshop.gateway.book(ctx.sessionId, parsed.pick, workshop.userMessage));
  },
};

export const WORKSHOP_TOOLS: readonly ChatTool[] = [identificarClienteTaller, prediagnosticarTaller, listarSedesTaller, consultarHorariosTaller, apartarHoraTaller, agendarCitaTaller];
