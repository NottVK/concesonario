import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { RateWindow } from '../../mcp/gateway/rate-window.js';
import { AuditService } from '../../mcp/audit/audit.service.js';
import { BotKeysService } from '../../mcp/keys/bot-keys.service.js';
import { ExchangeDirection, ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { ExternalBot } from '../entities/external-bot.entity.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { OutboundFailure } from './errors.js';
import { OUTBOUND_DEFAULTS, PUBLIC_MESSAGES } from './outbound.config.js';
import { OutboundLimiter } from './outbound-limiter.js';
import { parseRemoteAnswer, parseRemoteCard } from './response-parser.js';
import { prepareQuestion, sanitizeRemoteText } from './sanitize-remote.js';
import type { RemoteFlag } from './sanitize-remote.js';
import { SecureHttp } from './secure-http.js';

export const OUTBOUND_RUNTIME = Symbol('OUTBOUND_RUNTIME');

/** Las piezas con estado de la salida, juntas para poder sustituirlas en las pruebas. */
export interface OutboundRuntime {
  http: SecureHttp;
  breaker: CircuitBreaker;
  limiter: OutboundLimiter;
  /** Ventana de «Probar conexión» (5 por minuto en total). */
  testWindow: RateWindow;
  /** Plazo total de cada llamada; por defecto 8 s (solo las pruebas lo acortan). */
  deadlineMs?: number;
}

export type OutboundResult =
  | { ok: true; requestId: string; bot: { id: number; name: string }; text: string; flags: RemoteFlag[] }
  | { ok: false; requestId: string; status: ExchangeStatus; message: string };

export type ConnectionTest =
  | { ok: true; name: string; description: string; skills: string[]; originMismatch: boolean; flags: RemoteFlag[] }
  | { ok: false; status: ExchangeStatus; message: string };

/** Estados que cuentan como «el bot falló» para el circuit breaker (los demás no son culpa del destino). */
const BOT_FAULTS = new Set([ExchangeStatus.TIMEOUT, ExchangeStatus.REMOTE_ERROR, ExchangeStatus.INVALID_RESPONSE]);
const FROM = 'AutoMax Bot';
const TEST_KEY = 'prueba-de-conexion';

const failure = (requestId: string, status: ExchangeStatus): OutboundResult => ({ ok: false, requestId, status, message: PUBLIC_MESSAGES[status]! });

/**
 * Cliente de la A2A SALIENTE: el único camino por el que AutoMax le pregunta algo a otro bot (decisiones 112 a 117).
 * El destino sale SIEMPRE de un bot activo registrado en `bots_externos` (el llamador pasa un id, nunca una URL), y lo que
 * se envía es solo la pregunta ya redactada, nunca el historial. Lo que contesta el otro bot es un dato NO confiable: se
 * convierte en texto plano y se devuelve aparte; este servicio no tiene nada que ver con el modelo ni con el prompt.
 */
@Injectable()
export class A2aOutboundService {
  private readonly logger = new Logger(A2aOutboundService.name);

  constructor(
    @InjectRepository(ExternalBot) private readonly bots: Repository<ExternalBot>,
    private readonly keys: BotKeysService,
    private readonly audit: AuditService,
    @Inject(OUTBOUND_RUNTIME) private readonly runtime: OutboundRuntime,
  ) {}

  async ask(input: { botId: number; question: unknown; sessionKey?: string }): Promise<OutboundResult> {
    const requestId = randomUUID();
    const started = performance.now();
    const bot = await this.loadBot(input.botId);
    if (!bot) return failure(requestId, ExchangeStatus.REJECTED);
    const done = (status: ExchangeStatus, question: string, answer: string | null, bytesIn = 0, bytesOut = 0): Promise<void> =>
      this.record(bot, requestId, question, answer, status, performance.now() - started, bytesIn, bytesOut);

    const prepared = prepareQuestion(input.question);
    if (!bot.active || !bot.url || !prepared.ok) {
      await done(ExchangeStatus.REJECTED, prepared.ok ? prepared.text : '[pregunta no válida]', null);
      return failure(requestId, ExchangeStatus.REJECTED);
    }
    const slot = this.runtime.limiter.tryAcquire(bot.id, bot.outboundLimitPerMinute, input.sessionKey);
    if (!slot.ok) {
      await done(ExchangeStatus.LIMITED, prepared.text, null);
      return failure(requestId, ExchangeStatus.LIMITED);
    }
    try {
      if (!this.runtime.breaker.allow(bot.id)) {
        await done(ExchangeStatus.CIRCUIT_OPEN, prepared.text, null);
        return failure(requestId, ExchangeStatus.CIRCUIT_OPEN);
      }
      return await this.callAndRecord(bot, requestId, prepared.text, done);
    } finally {
      slot.release();
    }
  }

  private async callAndRecord(
    bot: ExternalBot,
    requestId: string,
    question: string,
    done: (status: ExchangeStatus, question: string, answer: string | null, bytesIn?: number, bytesOut?: number) => Promise<void>,
  ): Promise<OutboundResult> {
    const body = JSON.stringify({ from: FROM, message: question });
    try {
      const reply = await this.call(bot, body);
      this.runtime.breaker.success(bot.id);
      await done(ExchangeStatus.OK, question, reply.text, reply.bytes, Buffer.byteLength(body));
      return { ok: true, requestId, bot: { id: bot.id, name: bot.name }, text: reply.text, flags: reply.flags };
    } catch (error) {
      const fault = this.toFailure(error, bot.id);
      if (BOT_FAULTS.has(fault.status)) this.runtime.breaker.failure(bot.id);
      else this.runtime.breaker.release(bot.id);
      await done(fault.status, question, null, 0, Buffer.byteLength(body));
      return failure(requestId, fault.status);
    }
  }

  private async call(bot: ExternalBot, body: string): Promise<{ text: string; flags: RemoteFlag[]; bytes: number }> {
    const headers = await this.authHeaders(bot);
    const response = await this.runtime.http.request({
      method: 'POST',
      url: `${bot.url!.replace(/\/+$/, '')}/tasks`,
      headers,
      body,
      maxBytes: OUTBOUND_DEFAULTS.maxResponseBytes,
      ...this.deadline(),
    });
    const clean = sanitizeRemoteText(parseRemoteAnswer(response.text));
    // Si tras el saneado no queda nada (todo era HTML o enlaces), no hay respuesta que mostrar.
    if (clean.text === '') throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'vacio-tras-sanear');
    return { text: clean.text, flags: clean.flags, bytes: response.bytes };
  }

  /** La key saliente va por la cabecera que el bot espera; un bot sin key no recibe ninguna. */
  private async authHeaders(bot: ExternalBot): Promise<Record<string, string>> {
    let key: string | null;
    try {
      key = await this.keys.outboundKeyOf(bot.id);
    } catch {
      throw new OutboundFailure(ExchangeStatus.INTERNAL_ERROR, 'clave-ilegible');
    }
    if (key === null) return {};
    return bot.outboundAuth === 'x_api_key' ? { 'X-API-Key': key } : { Authorization: `Bearer ${key}` };
  }

  /**
   * «Probar conexión» del panel: lee la tarjeta del bot registrado (tope de 4 KB) por el mismo cliente seguro. Máximo 5
   * por minuto en total y errores por categoría, para que no sirva de escáner de red (decisión 113). El nombre y la
   * descripción remotos son texto no confiable: se sanean y no llegan al modelo.
   */
  async testConnection(botId: number): Promise<ConnectionTest> {
    if (!this.runtime.testWindow.tryHit(TEST_KEY, OUTBOUND_DEFAULTS.testConnectionPerMinute)) return { ok: false, status: ExchangeStatus.LIMITED, message: PUBLIC_MESSAGES[ExchangeStatus.LIMITED]! };
    const bot = await this.loadBot(botId);
    if (!bot?.url) return { ok: false, status: ExchangeStatus.REJECTED, message: PUBLIC_MESSAGES[ExchangeStatus.REJECTED]! };
    try {
      const origin = new URL(bot.url).origin;
      const response = await this.runtime.http.request({ method: 'GET', url: `${origin}/.well-known/agent.json`, maxBytes: OUTBOUND_DEFAULTS.maxCardBytes, ...this.deadline() });
      const card = parseRemoteCard(response.text);
      const name = sanitizeRemoteText(card.name, 80);
      const description = sanitizeRemoteText(card.description, 200);
      const skills = card.skills.slice(0, 10).map((skill) => sanitizeRemoteText(skill, 40).text);
      return {
        ok: true,
        name: name.text,
        description: description.text,
        skills,
        originMismatch: this.originDiffers(card.url, origin),
        flags: [...new Set([...name.flags, ...description.flags])],
      };
    } catch (error) {
      const fault = this.toFailure(error, botId);
      return { ok: false, status: fault.status, message: PUBLIC_MESSAGES[fault.status]! };
    }
  }

  /** Olvida el estado en memoria de un bot (el panel lo llama si cambia su URL: el historial del destino anterior no cuenta). */
  forget(botId: number): void {
    this.runtime.breaker.reset(botId);
  }

  private deadline(): { deadlineMs?: number } {
    return this.runtime.deadlineMs === undefined ? {} : { deadlineMs: this.runtime.deadlineMs };
  }

  private originDiffers(cardUrl: string | null, registeredOrigin: string): boolean {
    if (cardUrl === null) return false;
    try {
      return new URL(cardUrl).origin !== registeredOrigin;
    } catch {
      return true;
    }
  }

  private toFailure(error: unknown, botId: number): OutboundFailure {
    if (error instanceof OutboundFailure) {
      // El detalle (`code`) solo va al registro de operación: puede nombrar una dirección o un código de red.
      this.logger.warn(`Llamada A2A al bot ${botId} fallida (${error.status}: ${error.code})`);
      return error;
    }
    this.logger.error(`Error inesperado en la llamada A2A al bot ${botId}: ${error instanceof Error ? error.message : 'error'}`);
    return new OutboundFailure(ExchangeStatus.INTERNAL_ERROR, 'inesperado');
  }

  private loadBot(id: number): Promise<ExternalBot | null> {
    if (!Number.isSafeInteger(id) || id < 1) return Promise.resolve(null);
    return this.bots.findOne({ where: { id }, select: { id: true, name: true, url: true, active: true, outboundAuth: true, outboundLimitPerMinute: true } });
  }

  /** Una fila de auditoría por intento. Si la base falla, no se cae la respuesta. */
  private async record(bot: ExternalBot, requestId: string, question: string, answer: string | null, status: ExchangeStatus, ms: number, bytesIn: number, bytesOut: number): Promise<void> {
    try {
      await this.audit.recordA2a({ botId: bot.id, direction: ExchangeDirection.OUTBOUND, question, answer, status, durationMs: ms, bytesIn, bytesOut, requestId });
    } catch (error) {
      this.logger.error(`No se pudo auditar la llamada A2A al bot ${bot.id}: ${error instanceof Error ? error.message : 'error'}`);
    }
  }
}
