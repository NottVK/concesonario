import { MCP_DEFAULTS } from '../mcp.config.js';
import { RateWindow } from './rate-window.js';

export type GateRefusal = 'locked' | 'ip-rate' | 'ip-concurrent' | 'global-rate';

export type GateResult = { ok: true; release: () => void } | { ok: false; reason: GateRefusal; retryAfterSeconds: number };

interface GateConfig {
  ipPerMinute: number;
  ipConcurrent: number;
  lockoutFailures: number;
  lockoutWindowMs: number;
  lockoutDurationMs: number;
  globalPerMinute: number;
}

/**
 * Límites ANTES de autenticar. Su objetivo es el DoS (una IP, o todo el MCP, no puede saturar el servidor ni a la base),
 * no impedir que se adivine una key: con 256 bits aleatorios no hay nada que adivinar. Cuenta por la IP que Express
 * entrega en `req.ip`: SIN `trust proxy`, detrás de un proxy inverso todos los clientes comparten una IP (un atacante
 * bloquearía a todos); con un `trust proxy` demasiado permisivo, `X-Forwarded-For` se puede falsificar y saltarse el
 * bloqueo. Hay que configurarlo bien al desplegar (ver docs/DECISIONES.md).
 */
export class IpGate {
  private readonly perMinute: RateWindow;
  private readonly global: RateWindow;
  private readonly failures: RateWindow;
  private readonly inFlight = new Map<string, number>();
  private readonly lockedUntil = new Map<string, number>();

  constructor(
    private readonly config: GateConfig = MCP_DEFAULTS,
    private readonly now: () => number = Date.now,
  ) {
    this.perMinute = new RateWindow(60_000, now);
    this.global = new RateWindow(60_000, now);
    this.failures = new RateWindow(config.lockoutWindowMs, now);
  }

  enter(ip: string): GateResult {
    const until = this.lockedUntil.get(ip);
    if (until !== undefined) {
      if (until > this.now()) return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil((until - this.now()) / 1000) };
      this.lockedUntil.delete(ip);
    }
    if ((this.inFlight.get(ip) ?? 0) >= this.config.ipConcurrent) return { ok: false, reason: 'ip-concurrent', retryAfterSeconds: 1 };
    if (!this.perMinute.tryHit(ip, this.config.ipPerMinute)) return { ok: false, reason: 'ip-rate', retryAfterSeconds: this.perMinute.retryAfterSeconds(ip) };
    if (!this.global.tryHit('*', this.config.globalPerMinute)) return { ok: false, reason: 'global-rate', retryAfterSeconds: this.global.retryAfterSeconds('*') };
    this.inFlight.set(ip, (this.inFlight.get(ip) ?? 0) + 1);
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        const left = (this.inFlight.get(ip) ?? 1) - 1;
        if (left <= 0) this.inFlight.delete(ip);
        else this.inFlight.set(ip, left);
      },
    };
  }

  /** Un intento de autenticación fallido: al llegar al tope dentro de la ventana, la IP queda bloqueada un rato. */
  recordFailure(ip: string): void {
    this.failures.tryHit(ip, Number.MAX_SAFE_INTEGER);
    if (this.failures.count(ip) >= this.config.lockoutFailures) {
      this.lockedUntil.set(ip, this.now() + this.config.lockoutDurationMs);
      this.failures.clear(ip);
    }
  }

  recordSuccess(ip: string): void {
    this.failures.clear(ip);
  }

  isLocked(ip: string): boolean {
    return (this.lockedUntil.get(ip) ?? 0) > this.now();
  }
}
