import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PublicCatalogService } from '../../catalogo/public-catalog.service.js';
import type { PublicVehicle, SoldVehicle } from '../../catalogo/public-catalog.service.js';
import { FinanciacionService } from '../../financiacion/financiacion.service.js';
import { AuditService } from '../../mcp/audit/audit.service.js';
import type { AuthenticatedBot } from '../../mcp/gateway/bot-gateway.service.js';
import { consultarPrecioSchema, consultarStockSchema } from '../../mcp/tools/schemas.js';
import { ExchangeDirection, ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { A2A_DEFAULTS } from '../a2a.config.js';
import type { A2aSkill } from '../a2a.config.js';
import { A2A_NOTE, CITAS_ANSWER, describeVehicles, FINANCING_HINT, formatCop, NEEDS_INPUT_ANSWER } from './answers.js';
import { detectIntent, foldText } from './intent.js';
import { financingParamsSchema, taskSchema } from './task.schema.js';
import type { Task } from './task.schema.js';

export interface A2aHttpResult {
  status: 200 | 400 | 503;
  /** JSON ya serializado. */
  body: string;
}

type Stock = { total: number; vehicles: (PublicVehicle | SoldVehicle)[] };

/** Resultado de resolver una tarea, antes de darle forma de respuesta HTTP. */
interface Reply {
  http: 200 | 400 | 503;
  status: 'completed' | 'needs_input' | 'rejected' | 'failed';
  skill: A2aSkill | null;
  audit: ExchangeStatus;
  /** Texto fijo de la respuesta (cuando no es una lista de vehículos). */
  text?: string;
  /** Mensaje de error, siempre un texto NUESTRO (nunca algo que mandó el bot). */
  error?: string;
  data?: object;
  /** Lista de vehículos: se recorta por NÚMERO de elementos hasta que la respuesta cabe en el tope. */
  stock?: Stock;
}

const INVALID_TASK = 'Solicitud no válida';
const INVALID_PARAMS = 'Parámetros no válidos para esa habilidad.';
const UNAVAILABLE = 'Servicio no disponible, intenta luego.';

const reject = (skill: A2aSkill | null, error: string): Reply => ({ http: 400, status: 'rejected', skill, audit: ExchangeStatus.REJECTED, error });
const done = (skill: A2aSkill, extra: Partial<Reply> = {}): Reply => ({ http: 200, status: 'completed', skill, audit: ExchangeStatus.OK, ...extra });
const needsInput = (skill: A2aSkill | null, text: string): Reply => ({ http: 200, status: 'needs_input', skill, audit: ExchangeStatus.OK, text });

/** Claves de `params` que conocemos: solo estas se nombran en la auditoría (las demás las escribe el bot y solo se cuentan). */
const KNOWN_PARAM_KEYS = new Set(['marca', 'modelo', 'anio', 'estado', 'limite', 'vehiculo_id', 'amount', 'downPayment', 'months']);

/** Lo que se guarda como «pregunta»: el mensaje, o la habilidad y las claves CONOCIDAS de `params` (nunca valores ni claves ajenas). */
function questionOf(task: Task): string {
  if (task.message) return task.message;
  const keys = Object.keys(task.params ?? {});
  const known = keys.filter((key) => KNOWN_PARAM_KEYS.has(key));
  const unknown = keys.length - known.length;
  return `[skill:${task.skill}] params: ${known.join(',') || '-'}${unknown > 0 ? ` (+${unknown} desconocidas)` : ''}`;
}

/**
 * Tareas A2A ENTRANTES (otro bot nos pregunta). Es DETERMINISTA (decisión 108): responde solo desde el catálogo
 * público y el simulador de financiación. No usa modelo de lenguaje ni embeddings, y no tiene acceso a la salida
 * (no puede preguntarle a otro bot), así que no hay relevos ni bucles. Nada de lo que manda el bot vuelve en la respuesta.
 */
@Injectable()
export class A2aTasksService {
  private readonly logger = new Logger(A2aTasksService.name);

  constructor(
    private readonly catalog: PublicCatalogService,
    private readonly financing: FinanciacionService,
    private readonly audit: AuditService,
  ) {}

  async handle(bot: AuthenticatedBot, raw: Buffer): Promise<A2aHttpResult> {
    const started = performance.now();
    const id = randomUUID();
    const parsed = this.parse(raw);
    const question = parsed.ok ? questionOf(parsed.task) : '[solicitud no válida]';
    const reply = parsed.ok ? await this.resolve(parsed.task) : reject(null, INVALID_TASK);
    const result = this.render(id, reply);
    await this.record(bot, id, question, reply, result, raw.length, performance.now() - started);
    return result;
  }

  private parse(raw: Buffer): { ok: true; task: Task } | { ok: false } {
    let value: unknown;
    try {
      value = JSON.parse(raw.toString('utf8'));
    } catch {
      return { ok: false };
    }
    const task = taskSchema.safeParse(value);
    return task.success ? { ok: true, task: task.data } : { ok: false };
  }

  private async resolve(task: Task): Promise<Reply> {
    try {
      return task.skill ? await this.runSkill(task.skill, task.params ?? {}) : await this.runFreeText(task.message ?? '');
    } catch (error) {
      this.logger.error(`Falló una tarea A2A: ${error instanceof Error ? error.message : 'error desconocido'}`);
      return { http: 503, status: 'failed', skill: task.skill ?? null, audit: ExchangeStatus.INTERNAL_ERROR, error: UNAVAILABLE };
    }
  }

  private async runSkill(skill: A2aSkill, params: Record<string, unknown>): Promise<Reply> {
    switch (skill) {
      case 'citas':
        return done('citas', { text: CITAS_ANSWER });
      case 'financiacion':
        return this.simulate(params);
      case 'stock':
        return this.stock(params);
      case 'precios':
        return this.prices(params);
    }
  }

  private async stock(params: Record<string, unknown>): Promise<Reply> {
    const parsed = consultarStockSchema.safeParse(params);
    if (!parsed.success) return reject('stock', INVALID_PARAMS);
    const { total, vehiculos } = await this.catalog.searchStock({ ...parsed.data, limite: Math.min(parsed.data.limite, A2A_DEFAULTS.maxResults) });
    return done('stock', { stock: { total, vehicles: vehiculos } });
  }

  private async prices(params: Record<string, unknown>): Promise<Reply> {
    const parsed = consultarPrecioSchema.safeParse(params);
    if (!parsed.success) return reject('precios', INVALID_PARAMS);
    if ('vehiculo_id' in parsed.data) {
      const found = await this.catalog.findByRef(parsed.data.vehiculo_id);
      return done('precios', { stock: { total: found ? 1 : 0, vehicles: found ? [found] : [] } });
    }
    const { total, vehiculos } = await this.catalog.searchStock({ ...parsed.data, limite: A2A_DEFAULTS.maxResults });
    return done('precios', { stock: { total, vehicles: vehiculos } });
  }

  private simulate(params: Record<string, unknown>): Reply {
    const parsed = financingParamsSchema.safeParse(params);
    if (!parsed.success) return reject('financiacion', INVALID_PARAMS);
    try {
      const sim = this.financing.simulate(parsed.data);
      const text =
        `Simulación a ${sim.months} meses: cuota mensual de ${formatCop(sim.monthlyPayment)} COP sobre ${formatCop(sim.financed)} COP financiados ` +
        `(tasa efectiva anual ${(sim.annualRate * 100).toFixed(2)} %). Es una simulación, no una oferta.`;
      return done('financiacion', { text, data: sim });
    } catch (error) {
      // Mensajes propios del simulador (p. ej. «La cuota inicial debe ser menor…»), no texto del bot.
      if (error instanceof BadRequestException) return reject('financiacion', error.message);
      throw error;
    }
  }

  private async runFreeText(message: string): Promise<Reply> {
    const intent = detectIntent(message, await this.catalog.listBrands());
    switch (intent.skill) {
      case 'citas':
        return done('citas', { text: CITAS_ANSWER });
      case 'financiacion':
        return needsInput('financiacion', FINANCING_HINT);
      case 'ninguna':
        return needsInput(null, NEEDS_INPUT_ANSWER);
      default:
        return done(intent.skill, { stock: await this.searchFreeText(intent) });
    }
  }

  /**
   * Con marca: busca por marca, año y estado, y si el mensaje nombra algún modelo real de esos resultados se queda con
   * esos. Sin marca: prueba cada palabra suelta como modelo (hasta 3 consultas). Las palabras del bot solo viajan como
   * parámetros de la consulta o para comparar; nunca entran a un texto ni vuelven en la respuesta.
   */
  private async searchFreeText(intent: { marca?: string; tokens: string[]; anio?: number; estado?: 'nuevo' | 'usado' }): Promise<Stock> {
    const base = { ...(intent.anio ? { anio: intent.anio } : {}), ...(intent.estado ? { estado: intent.estado } : {}) };
    if (!intent.marca) return this.searchByModelWords(intent.tokens.slice(0, 3), base);
    const found = await this.catalog.searchStock({ ...base, marca: intent.marca, limite: 10 });
    const named = found.vehiculos.filter((vehicle) => intent.tokens.some((token) => foldText(vehicle.modelo).split(' ').includes(token)));
    const chosen = named.length > 0 ? named : found.vehiculos;
    return { total: named.length > 0 ? named.length : found.total, vehicles: chosen.slice(0, A2A_DEFAULTS.maxResults) };
  }

  private async searchByModelWords(words: string[], base: { anio?: number; estado?: 'nuevo' | 'usado' }): Promise<Stock> {
    const byRef = new Map<number, PublicVehicle>();
    for (const word of words) {
      const found = await this.catalog.searchStock({ ...base, modelo: word, limite: A2A_DEFAULTS.maxResults });
      for (const vehicle of found.vehiculos) byRef.set(vehicle.ref, vehicle);
      if (byRef.size >= A2A_DEFAULTS.maxResults) break;
    }
    const vehicles = [...byRef.values()].slice(0, A2A_DEFAULTS.maxResults);
    return { total: vehicles.length, vehicles };
  }

  /** Forma la respuesta HTTP; la lista de vehículos se recorta por número de elementos (nunca se corta el JSON). */
  private render(id: string, reply: Reply): A2aHttpResult {
    const build = (count: number): string => {
      const vehicles = reply.stock?.vehicles.slice(0, count);
      const stockData = reply.stock && vehicles ? { total: reply.stock.total, mostrando: vehicles.length, vehiculos: vehicles } : undefined;
      return JSON.stringify({
        id,
        status: reply.status,
        ...(reply.skill ? { skill: reply.skill } : {}),
        ...(reply.error ? { error: reply.error } : { answer: reply.stock && vehicles ? describeVehicles(vehicles, reply.stock.total) : reply.text }),
        ...(stockData ? { data: stockData } : reply.data ? { data: reply.data } : {}),
        note: A2A_NOTE,
      });
    };
    const fits = (count: number): string | null => {
      const body = build(count);
      return Buffer.byteLength(body) <= A2A_DEFAULTS.maxResponseBytes ? body : null;
    };
    let best = fits(reply.stock?.vehicles.length ?? 0);
    for (let count = (reply.stock?.vehicles.length ?? 0) - 1; best === null && count >= 0; count--) best = fits(count);
    if (best !== null) return { status: reply.http, body: best };
    this.logger.error(`Respuesta A2A que no cabe en ${A2A_DEFAULTS.maxResponseBytes} bytes`);
    return { status: 503, body: JSON.stringify({ id, status: 'failed', error: UNAVAILABLE, note: A2A_NOTE }) };
  }

  /** Una fila de auditoría por tarea. Si la base falla, no se cae la respuesta. */
  private async record(bot: AuthenticatedBot, id: string, question: string, reply: Reply, result: A2aHttpResult, bytesIn: number, ms: number): Promise<void> {
    try {
      const answer = reply.error ?? reply.text ?? (reply.stock ? describeVehicles(reply.stock.vehicles, reply.stock.total) : null);
      await this.audit.recordA2a({
        botId: bot.id,
        direction: ExchangeDirection.INBOUND,
        question,
        answer,
        status: result.status === 503 ? ExchangeStatus.INTERNAL_ERROR : reply.audit,
        durationMs: ms,
        bytesIn,
        bytesOut: Buffer.byteLength(result.body),
        requestId: id,
      });
    } catch (error) {
      this.logger.error(`No se pudo auditar la tarea A2A del bot ${bot.id}: ${error instanceof Error ? error.message : 'error'}`);
    }
  }
}
