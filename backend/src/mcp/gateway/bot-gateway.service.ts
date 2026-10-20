import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BotKeysService } from '../keys/bot-keys.service.js';
import { gateConfig, MCP_DEFAULTS } from '../mcp.config.js';
import type { BotChannelName } from './bot-channel.js';
import { IpGate } from './ip-gate.js';
import type { GateResult } from './ip-gate.js';
import { RateWindow } from './rate-window.js';

export interface AuthenticatedBot {
  id: number;
  name: string;
  limitPerMinute: number;
  limitPerDay: number;
}

/** Cupo concedido: `release` libera la reserva del tope diario cuando la llamada ya quedó auditada. */
export type Quota = { ok: true; release: () => void } | { ok: false; scope: 'minute' | 'day'; retryAfterSeconds: number };

const BEARER = /^Bearer[ \t]+(\S{1,200})$/i;

/**
 * Puerta de entrada de los bots externos (MCP y A2A comparten IP, 401 y cuota): límites antes de autenticar, autenticación de la key, y cuota propia de cada bot. El
 * contador vive aquí (en el backend, donde está la configuración de cada bot) y el tope diario sale de la tabla de
 * auditoría, así que sobrevive a un reinicio.
 */
@Injectable()
export class BotGatewayService {
  private readonly logger = new Logger(BotGatewayService.name);
  private readonly ipGate = new IpGate(gateConfig());
  private readonly botMinute = new RateWindow(60_000);
  private readonly reservedToday = new Map<number, number>();
  private readonly queues = new Map<number, Promise<void>>();

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
  async authenticate(authorization: string | undefined, ip: string, channel: BotChannelName): Promise<AuthenticatedBot | null> {
    const candidate = typeof authorization === 'string' ? BEARER.exec(authorization)?.[1] : undefined;
    const result = await this.keys.verify(candidate);
    if (!result.ok) {
      this.ipGate.recordFailure(ip);
      this.logger.warn(`Autenticación ${channel.toUpperCase()} fallida (motivo=${result.reason}, bot=${result.botId ?? '-'}, prefijo=${result.prefix ?? '-'}, ip=${ip})`);
      return null;
    }
    this.ipGate.recordSuccess(ip);
    return result.bot;
  }

  /**
   * Cuota propia del bot: por minuto (en memoria) y por día. El tope diario cuenta las llamadas YA auditadas más las
   * que están en curso (reservadas), y la comprobación + reserva de un mismo bot va por una cola: dos peticiones
   * simultáneas no pueden leer el mismo conteo y pasar las dos. Una llamada rechazada sigue contando en el minuto
   * (no se devuelve ese cupo). Los contadores viven en el proceso: con varias réplicas harían falta contadores compartidos.
   */
  async checkQuota(bot: AuthenticatedBot): Promise<Quota> {
    const key = String(bot.id);
    if (!this.botMinute.tryHit(key, bot.limitPerMinute)) {
      return { ok: false, scope: 'minute', retryAfterSeconds: this.botMinute.retryAfterSeconds(key) };
    }
    return this.serialized(bot.id, async () => {
      const reserved = this.reservedToday.get(bot.id) ?? 0;
      if ((await this.audit.callsInLastDay(bot.id)) + reserved >= bot.limitPerDay) {
        this.logger.warn(`Bot ${bot.id} alcanzó su tope diario de ${bot.limitPerDay} llamadas`);
        return { ok: false, scope: 'day', retryAfterSeconds: 3600 } as const;
      }
      this.reservedToday.set(bot.id, reserved + 1);
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          const left = (this.reservedToday.get(bot.id) ?? 1) - 1;
          if (left <= 0) this.reservedToday.delete(bot.id);
          else this.reservedToday.set(bot.id, left);
        },
      } as const;
    });
  }

  /** Cola por bot: una función a la vez para el mismo bot. */
  private async serialized<T>(botId: number, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(botId) ?? Promise.resolve();
    let finish!: () => void;
    const turn = new Promise<void>((resolve) => (finish = resolve));
    const tail = previous.then(() => turn);
    this.queues.set(botId, tail);
    await previous;
    try {
      return await task();
    } finally {
      finish();
      if (this.queues.get(botId) === tail) this.queues.delete(botId);
    }
  }

  static readonly limits = MCP_DEFAULTS;
}
