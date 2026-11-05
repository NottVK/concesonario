import { describe, expect, it, vi } from 'vitest';
import type { ReadOnlyApi } from '../api/public-api.client.js';
import { MockProvider } from '../model/mock.provider.js';
import type { ChatRequest, ChatResponse } from '../model/model-provider.js';
import type { WorkshopGateway } from '../tools/workshop.js';
import { WORKSHOP_TOOL_NAMES } from '../tools/workshop-tools.js';
import { AgentService } from './agent.service.js';

/** El modelo organiza el taller con tools (decisión 131); aquí se prueba qué ve y qué se le deja decir. */
const api: ReadOnlyApi = {
  get: async () => ({ status: 404, data: {} as never }),
  post: async () => ({ status: 404, data: {} as never }),
};

const BOOKED = { agendada: true, orden: 'OT-0009', sede: { codigo: 'PL-FRENOS', nombre: 'Pulgas Locas Frenos y Suspensión' }, fecha: 'martes 3 de noviembre, 9:00 a. m.', siguiente_paso: 'Un mecánico toma la orden' };

function gateway(overrides: Partial<WorkshopGateway> = {}) {
  const prediagnose = vi.fn(async () => ({ especialidad: 'frenos', servicios_probables: [{ nombre: 'Cambio de pastillas', precio_mano_obra: 80000, precio_texto: '$80.000' }] }));
  const book = vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>> => BOOKED);
  const gw: WorkshopGateway = {
    capture: (_s, message) => message,
    isActive: () => true,
    identify: vi.fn(async () => ({ identificado: true, vehiculo: 'Renault Duster 2023', placa: 'LMX201', garantia: { vigente: true } })),
    prediagnose,
    sites: vi.fn(async () => ({ sedes: [] })),
    slots: vi.fn(async () => ({ franjas: [] })),
    hold: vi.fn(async () => ({ apartada: true })),
    book,
    ...overrides,
  };
  return { gw, prediagnose, book };
}

const call = (name: string, args: Record<string, unknown> = {}): ChatResponse => ({ content: '', toolCalls: [{ id: `c-${name}`, name, arguments: args }] });
const say = (content: string): ChatResponse => ({ content, toolCalls: [] });

function run(script: (request: ChatRequest, calls: number) => ChatResponse, workshop: WorkshopGateway | undefined, userMessage: string) {
  const requests: ChatRequest[] = [];
  const provider = new MockProvider((request, calls) => {
    requests.push(structuredClone({ messages: request.messages, tools: request.tools }));
    return script(request, calls);
  });
  const output = new AgentService(provider).run({
    history: [], userMessage, api, sessionId: 's-1', seenVehicleIds: [],
    createProposal: async () => { throw new Error('no aplica'); },
    ...(workshop ? { workshop } : {}),
  });
  return { requests, output };
}

describe('AgentService con las tools del taller', () => {
  it('las tools del taller solo se ofrecen si hay gateway del taller', async () => {
    const names = (r: ChatRequest[]) => (r[0]!.tools ?? []).map((t) => t.name);
    const without = run(() => say('Hola'), undefined, 'hola');
    await without.output;
    expect(names(without.requests).some((n) => (WORKSHOP_TOOL_NAMES as readonly string[]).includes(n))).toBe(false);
    const withIt = run(() => say('Hola'), gateway().gw, 'hola');
    await withIt.output;
    expect(names(withIt.requests)).toEqual(expect.arrayContaining([...WORKSHOP_TOOL_NAMES]));
  });

  it('el modelo encadena identificar → prediagnóstico y los precios del taller se pueden citar', async () => {
    const { gw, prediagnose } = gateway();
    const { output } = run((_r, calls) => (calls === 1 ? call('identificar_cliente_taller') : calls === 2 ? call('prediagnosticar_taller', { sintomas: ['chilla al frenar'] }) : say('Es de frenos: cambio de pastillas por $80.000.')), gw, 'cédula [número] VIN 9FBHJD204PM100001, chilla al frenar');
    const result = await output;
    expect(result.reply).toBe('Es de frenos: cambio de pastillas por $80.000.');
    expect(result.fallback).toBe('none');
    expect(prediagnose).toHaveBeenCalledWith('s-1', ['chilla al frenar']);
  });

  it('si el modelo salta del prediagnóstico a las horas sin mostrarlo, el servidor antepone el resumen del taller', async () => {
    const { gw } = gateway({ slots: vi.fn(async () => ({ franjas: [{ fecha_hora: '2026-11-04T07:00:00-05:00', texto: 'miércoles 4 de noviembre, 7:00 a. m.' }] })) });
    const { output } = run((_r, calls) => (calls === 1 ? call('prediagnosticar_taller', { sintomas: ['chilla al frenar'] }) : calls === 2 ? call('consultar_horarios_taller', { sede: 'PL-FRENOS' }) : say('1. miércoles 4 de noviembre, 7:00 a. m. ¿Cuál prefieres?')), gw, 'chilla al frenar');
    const result = await output;
    expect(result.reply).toMatch(/^Según el prediagnóstico del taller, parece un tema de frenos\. Lo más probable es: Cambio de pastillas \(\$80\.000\)\./);
    expect(result.reply).toContain('1. miércoles 4 de noviembre, 7:00 a. m. ¿Cuál prefieres?');
  });

  it('nombrar la sede («Frenos y Suspensión») no cuenta como mostrar el prediagnóstico: hace falta el precio', async () => {
    const { gw } = gateway();
    const { output } = run((_r, calls) => (calls === 1 ? call('prediagnosticar_taller', { sintomas: ['chilla al frenar'] }) : say('Te recomiendo Pulgas Locas Frenos y Suspensión. ¿Busco horas?')), gw, 'chilla al frenar');
    expect((await output).reply).toMatch(/^Según el prediagnóstico del taller, parece un tema de frenos/);
  });

  it('por garantía sin motivo: si el modelo solo pide el documento, se agrega la pregunta por el motivo', async () => {
    const asks = 'Para verificar tu garantía, necesito tu número de documento (DNI) y el número VIN de tu vehículo.';
    const plain = run(() => say(asks), gateway().gw, 'Para cobrar mi garantía');
    expect((await plain.output).reply).toBe(`${asks} Y cuéntame, por favor, el motivo por el cual estás cobrando la garantía.`);
    // Ya dio el motivo, o el modelo ya lo preguntó: no se agrega nada.
    const withReason = run(() => say(asks), gateway().gw, 'Quiero la garantía porque la caja da golpes');
    expect((await withReason.output).reply).toBe(asks);
    const asked = `${asks} ¿Y cuál es el motivo del reclamo?`;
    const already = run(() => say(asked), gateway().gw, 'Para cobrar mi garantía');
    expect((await already.output).reply).toBe(asked);
    // Sin las tools del taller, no aplica.
    const noWorkshop = run(() => say(asks), undefined, 'Para cobrar mi garantía');
    expect((await noWorkshop.output).reply).toBe(asks);
  });

  it('horas inventadas (sin consultar_horarios_taller en el turno) se rechazan; las de la herramienta pasan', async () => {
    const invented = 'Horarios disponibles:\n1. 2026-11-07 09:00\n2. 2026-11-07 10:00\nElige el número que prefieras.';
    const lie = run(() => say(invented), gateway().gw, 'muéstrame las horas');
    const rejected = await lie.output;
    expect(rejected.reply).not.toContain('2026-11-07');
    expect(JSON.stringify(lie.requests.at(-1)!.messages.at(-1))).toMatch(/Ofreciste horas que no vienen de una herramienta/);

    const real = 'Horas libres:\n1. lunes 9 de noviembre, 7:00 a. m.\n2. lunes 9 de noviembre, 8:00 a. m.\n¿Cuál prefieres?';
    const slots = vi.fn(async () => ({ franjas: [{ fecha_hora: '2026-11-09T07:00:00-05:00', texto: 'lunes 9 de noviembre, 7:00 a. m.' }] }));
    const ok = run((_r, calls) => (calls === 1 ? call('consultar_horarios_taller', {}) : say(real)), gateway({ slots }).gw, 'muéstrame las horas');
    expect((await ok.output).reply).toBe(real);
    expect(slots).toHaveBeenCalledWith('s-1', null, null);
  });

  it('agendar le pasa al gateway el mensaje del cliente (para exigir su «sí») y solo con agendada se puede decir «quedó agendada»', async () => {
    const { gw, book } = gateway();
    const ok = run((_r, calls) => (calls === 1 ? call('agendar_cita_taller', { sede: 'PL-FRENOS', fecha_hora: '2026-11-03T09:00:00-05:00' }) : say('¡Listo! Tu cita quedó agendada: orden OT-0009.')), gw, 'sí');
    expect((await ok.output).reply).toBe('¡Listo! Tu cita quedó agendada: orden OT-0009.');
    expect(book).toHaveBeenCalledWith('s-1', { site: 'PL-FRENOS', slot: '2026-11-03T09:00:00-05:00' }, 'sí');

    const refused = gateway({ book: vi.fn(async () => ({ error: 'El cliente todavía no confirmó.', requiere_confirmacion: true })) }).gw;
    const lie = run((_r, calls) => (calls === 1 ? call('agendar_cita_taller', { sede: 'PL-FRENOS', fecha_hora: '2026-11-03T09:00:00-05:00' }) : say('Tu cita quedó agendada.')), refused, 'la 2');
    const result = await lie.output;
    expect(result.reply).not.toMatch(/quedó agendada/);
  });

  it('argumentos inválidos no llegan al gateway', async () => {
    const { gw, book } = gateway();
    const { output, requests } = run((_r, calls) => (calls === 1 ? call('agendar_cita_taller', { sede: 'http://evil', fecha_hora: 'mañana' }) : say('Necesito la hora exacta.')), gw, 'sí');
    await output;
    expect(book).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[1]!.messages.at(-1))).toMatch(/formato esperado/);
  });
});
