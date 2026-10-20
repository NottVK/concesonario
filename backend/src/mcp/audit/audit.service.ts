import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotExchange, ExchangeChannel, ExchangeDirection, ExchangeStatus } from '../../a2a/entities/bot-exchange.entity.js';
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

/**
 * Auditoría de cada llamada MCP en `intercambios_bots`, SIN datos personales ni texto libre: bot, herramienta, resumen
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

  /** Llamadas del bot en las últimas 24 horas (para el tope diario; sobrevive a un reinicio porque sale de la base). */
  async callsInLastDay(botId: number): Promise<number> {
    const rows = (await this.exchanges.query(
      `SELECT count(*)::int AS n FROM intercambios_bots WHERE bot_id = $1 AND canal = 'mcp' AND creado_en > now() - interval '24 hours'`,
      [botId],
    )) as { n: number }[];
    return rows[0]?.n ?? 0;
  }
}
