import { OUTBOUND_DEFAULTS } from './outbound.config.js';

type State = { kind: 'closed'; failures: number } | { kind: 'open'; since: number } | { kind: 'half-open'; probing: boolean };

export interface BreakerOptions {
  failures?: number;
  openMs?: number;
  now?: () => number;
}

/**
 * Circuit breaker por bot destino (decisión 115): tras 3 fallos SEGUIDOS corta las llamadas durante 60 s; pasado ese
 * tiempo deja pasar UNA sola sonda; si la sonda sale bien se cierra, si falla se vuelve a abrir. Así un bot caído o
 * lento no retiene el turno del chat (la inferencia es de una a la vez) una y otra vez. En memoria: un reinicio lo borra.
 */
export class CircuitBreaker {
  private readonly states = new Map<number, State>();
  private readonly threshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(options: BreakerOptions = {}) {
    this.threshold = options.failures ?? OUTBOUND_DEFAULTS.breakerFailures;
    this.openMs = options.openMs ?? OUTBOUND_DEFAULTS.breakerOpenMs;
    this.now = options.now ?? Date.now;
  }

  /** ¿Se puede llamar ahora? Si el circuito estaba abierto y ya pasó el tiempo, esta llamada es LA sonda (las demás esperan). */
  allow(botId: number): boolean {
    const state = this.states.get(botId) ?? { kind: 'closed', failures: 0 };
    if (state.kind === 'closed') return true;
    if (state.kind === 'open') {
      if (this.now() - state.since < this.openMs) return false;
      this.states.set(botId, { kind: 'half-open', probing: true });
      return true;
    }
    if (state.probing) return false;
    this.states.set(botId, { kind: 'half-open', probing: true });
    return true;
  }

  success(botId: number): void {
    this.states.delete(botId);
  }

  failure(botId: number): void {
    const state = this.states.get(botId) ?? { kind: 'closed', failures: 0 };
    if (state.kind === 'half-open') {
      this.states.set(botId, { kind: 'open', since: this.now() });
      return;
    }
    const failures = state.kind === 'closed' ? state.failures + 1 : this.threshold;
    this.states.set(botId, failures >= this.threshold ? { kind: 'open', since: this.now() } : { kind: 'closed', failures });
  }

  /** Estado para el panel y las pruebas. */
  stateOf(botId: number): 'closed' | 'open' | 'half-open' {
    return this.states.get(botId)?.kind ?? 'closed';
  }

  /** La llamada que tenía la sonda terminó sin ser un fallo ni un acierto del bot (p. ej. la cancelaron): libera la sonda. */
  release(botId: number): void {
    const state = this.states.get(botId);
    if (state?.kind === 'half-open') this.states.set(botId, { kind: 'half-open', probing: false });
  }

  /** Olvida un bot (si se borra o se le cambia la URL: el historial del destino anterior no cuenta). */
  reset(botId: number): void {
    this.states.delete(botId);
  }
}
