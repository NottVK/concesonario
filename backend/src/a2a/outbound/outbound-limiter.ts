import { RateWindow } from '../../mcp/gateway/rate-window.js';
import { OUTBOUND_DEFAULTS } from './outbound.config.js';

export type LimitScope = 'simultaneas' | 'global' | 'bot' | 'sesion';

export type Acquire = { ok: true; release: () => void } | { ok: false; scope: LimitScope };

export interface LimiterOptions {
  now?: () => number;
  perSessionPerHour?: number;
  globalPerMinute?: number;
  concurrent?: number;
}

const GLOBAL_KEY = 'global';

/**
 * Límites de la salida (decisión 115), todos en memoria y todos ANTES de conectar:
 *   - 2 llamadas simultáneas en total (la inferencia es de una a la vez; un bot lento no puede acaparar el servidor),
 *   - 20 por minuto en total,
 *   - las que fije cada bot por minuto (`limite_saliente_minuto`),
 *   - 3 por sesión de chat y hora.
 * Se comprueba todo sin contar y solo si TODO pasa se cuenta, así una petición rechazada no gasta cupo ajeno.
 */
export class OutboundLimiter {
  private readonly global: RateWindow;
  private readonly perBot: RateWindow;
  private readonly perSession: RateWindow;
  private running = 0;
  private readonly sessionLimit: number;
  private readonly globalLimit: number;
  private readonly concurrentLimit: number;

  constructor(options: LimiterOptions = {}) {
    const now = options.now ?? Date.now;
    this.global = new RateWindow(60_000, now);
    this.perBot = new RateWindow(60_000, now);
    this.perSession = new RateWindow(60 * 60_000, now);
    this.sessionLimit = options.perSessionPerHour ?? OUTBOUND_DEFAULTS.perSessionPerHour;
    this.globalLimit = options.globalPerMinute ?? OUTBOUND_DEFAULTS.globalPerMinute;
    this.concurrentLimit = options.concurrent ?? OUTBOUND_DEFAULTS.concurrent;
  }

  /** `sessionKey` es opcional (la prueba de conexión del panel no pertenece a ninguna sesión de chat). */
  tryAcquire(botId: number, botPerMinute: number, sessionKey?: string): Acquire {
    if (this.running >= this.concurrentLimit) return { ok: false, scope: 'simultaneas' };
    if (this.global.count(GLOBAL_KEY) >= this.globalLimit) return { ok: false, scope: 'global' };
    const botKey = String(botId);
    if (this.perBot.count(botKey) >= botPerMinute) return { ok: false, scope: 'bot' };
    const session = sessionKey === undefined ? null : `s:${sessionKey}`;
    if (session !== null && this.perSession.count(session) >= this.sessionLimit) return { ok: false, scope: 'sesion' };

    this.global.tryHit(GLOBAL_KEY, this.globalLimit);
    this.perBot.tryHit(botKey, botPerMinute);
    if (session !== null) this.perSession.tryHit(session, this.sessionLimit);
    this.running++;
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.running--;
      },
    };
  }

  /** Llamadas en curso (para pruebas). */
  get inFlight(): number {
    return this.running;
  }
}
