import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BotKeysService } from '../keys/bot-keys.service.js';
import { MCP_DEFAULTS } from '../mcp.config.js';
import { IpGate } from './ip-gate.js';
import type { GateResult } from './ip-gate.js';
import { RateWindow } from './rate-window.js';

export interface AuthenticatedBot {
  id: number;
  name: string;
  limitPerMinute: number;
  limitPerDay: number;
}

export type Quota = { ok: true } | { ok: false; scope: 'minute' | 'day'; retryAfterSeconds: number };

const BEARER = /^Bearer[ \t]+(\S{1,200})$/i;

/**
 * Puerta de entrada del MCP: límites antes de autenticar, autenticación de la key, y cuota propia de cada bot. El
 * contador vive aquí (en el backend, donde está la configuración de cada bot) y el tope diario sale de la tabla de
 * auditoría, así que sobrevive a un reinicio.
 */
@Injectable()
export class McpGatewayService {
  private readonly logger = new Logger(McpGatewayService.name);
  private readonly ipGate = new IpGate();
  private readonly botMinute = new RateWindow(60_000);

  constructor(
    private readonly keys: BotKeysService,
    private readonly audit: AuditService,
  ) {}

  /** Primer filtro: bloqueo por IP, peticiones por minuto, simultáneas y tope global. */
  enter(ip: string): GateResult {
    return this.ipGate.enter(ip);
  }

  /**
   * Autentica la cabecera `Authorization: Bearer <key>`. Cualquier fallo (cabecera ausente o mal formada, key falsa,
   * prefijo inexistente, bot desactivado) da el MISMO resultado hacia afuera; el motivo real solo queda en el log, con
   * el prefijo (que no es secreto) y nunca la key.
   */
  async authenticate(authorization: string | undefined, ip: string): Promise<AuthenticatedBot | null> {
    const candidate = typeof authorization === 'string' ? BEARER.exec(authorization)?.[1] : undefined;
    const result = await this.keys.verify(candidate);
    if (!result.ok) {
      this.ipGate.recordFailure(ip);
      this.logger.warn(`Autenticación MCP fallida (motivo=${result.reason}, bot=${result.botId ?? '-'}, prefijo=${result.prefix ?? '-'}, ip=${ip})`);
      return null;
    }
    this.ipGate.recordSuccess(ip);
    return result.bot;
  }

  /** Cuota propia del bot: por minuto (en memoria) y por día (contando auditoría). */
  async checkQuota(bot: AuthenticatedBot): Promise<Quota> {
    const key = String(bot.id);
    if (!this.botMinute.tryHit(key, bot.limitPerMinute)) {
      return { ok: false, scope: 'minute', retryAfterSeconds: this.botMinute.retryAfterSeconds(key) };
    }
    if ((await this.audit.callsInLastDay(bot.id)) >= bot.limitPerDay) {
      this.logger.warn(`Bot ${bot.id} alcanzó su tope diario de ${bot.limitPerDay} llamadas`);
      return { ok: false, scope: 'day', retryAfterSeconds: 3600 };
    }
    return { ok: true };
  }

  static readonly limits = MCP_DEFAULTS;
}
