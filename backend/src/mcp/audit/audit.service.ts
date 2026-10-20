import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotExchange, ExchangeChannel, ExchangeDirection, ExchangeStatus } from '../../a2a/entities/bot-exchange.entity.js';
import { randomUUID } from 'node:crypto';
import { auditText } from '../../a2a/audit/redact.js';
import { MCP_DEFAULTS } from '../mcp.config.js';

export interface AuditEntry {
  botId: number;
  /** Nombre de la tool (o del método MCP) — de una lista cerrada, no de lo que escriba el bot. */
  tool: string;
  /** Salida de `summarizeArgs`; null si no hubo argumentos validados. */
  argsSummary: string | null;
  status: ExchangeStatus;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
}

/** Un intercambio del canal a2a (entrante o saliente): el texto llega SIN redactar y aquí se redacta y se recorta. */
export interface A2aAuditEntry {
  botId: number;
  direction: ExchangeDirection;
  question: string;
  answer: string | null;
  status: ExchangeStatus;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  /** Para relacionar la fila con el registro de operación; si falta se genera. */
  requestId?: string;
}

export const A2A_QUESTION_MAX_CHARS = 200;
export const A2A_ANSWER_MAX_CHARS = 600;

/**
 * Auditoría de cada llamada en `intercambios_bots`. Canal MCP: SIN datos personales ni texto libre: bot, herramienta, resumen
 * de argumentos ya validados, estado, duración y tamaños. Nunca la key ni la cabecera Authorization. Un CHECK de la
 * base impide guardar pregunta o respuesta en el canal `mcp`.
 */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(BotExchange) private readonly exchanges: Repository<BotExchange>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.exchanges.insert({
      botId: entry.botId,
      direction: ExchangeDirection.INBOUND,
      channel: ExchangeChannel.MCP,
      question: null,
      answer: null,
      tool: entry.tool.slice(0, 40),
      argsSummary: entry.argsSummary?.slice(0, MCP_DEFAULTS.argsSummaryMaxChars) ?? null,
      status: entry.status,
      durationMs: Math.max(0, Math.round(entry.durationMs)),
      bytesIn: Math.max(0, Math.round(entry.bytesIn)),
      bytesOut: Math.max(0, Math.round(entry.bytesOut)),
    });
  }

  /**
   * Intercambio del canal a2a: pregunta y respuesta redactadas y recortadas más sus hashes (decisión 117). Nunca entra
   * a un prompt. Devuelve el `peticion_id` de la fila.
   */
  async recordA2a(entry: A2aAuditEntry): Promise<string> {
    const question = auditText(entry.question, A2A_QUESTION_MAX_CHARS);
    const answer = entry.answer === null ? null : auditText(entry.answer, A2A_ANSWER_MAX_CHARS);
    const requestId = entry.requestId ?? randomUUID();
    await this.exchanges.insert({
      botId: entry.botId,
      direction: entry.direction,
      channel: ExchangeChannel.A2A,
      question: question.text,
      questionHash: question.hash,
      answer: answer?.text ?? null,
      answerHash: answer?.hash ?? null,
      tool: null,
      argsSummary: null,
      status: entry.status,
      requestId,
      durationMs: Math.max(0, Math.round(entry.durationMs)),
      bytesIn: Math.max(0, Math.round(entry.bytesIn)),
      bytesOut: Math.max(0, Math.round(entry.bytesOut)),
    });
    return requestId;
  }

  /**
   * Llamadas ENTRANTES del bot (MCP y A2A) en las últimas 24 horas, para la cuota diaria compartida (decisión 109).
   * Sobrevive a un reinicio porque sale de la base. Las salientes tienen sus propios límites.
   */
  async callsInLastDay(botId: number): Promise<number> {
    const rows = (await this.exchanges.query(
      `SELECT count(*)::int AS n FROM intercambios_bots WHERE bot_id = $1 AND direccion = 'entrante' AND creado_en > now() - interval '24 hours'`,
      [botId],
    )) as { n: number }[];
    return rows[0]?.n ?? 0;
  }
}
