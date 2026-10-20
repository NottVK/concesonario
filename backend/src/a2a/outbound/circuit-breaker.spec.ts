import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import { OutboundLimiter } from './outbound-limiter.js';

const clock = (start = 1_000_000) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};

describe('CircuitBreaker', () => {
  it('se abre tras 3 fallos seguidos y corta durante 60 s', () => {
    const time = clock();
    const breaker = new CircuitBreaker({ now: time.now });
    expect(breaker.allow(1)).toBe(true);
    breaker.failure(1);
    breaker.failure(1);
    expect(breaker.stateOf(1)).toBe('closed');
    expect(breaker.allow(1)).toBe(true);
    breaker.failure(1);
    expect(breaker.stateOf(1)).toBe('open');
    expect(breaker.allow(1)).toBe(false);
    time.advance(59_999);
    expect(breaker.allow(1)).toBe(false);
  });

  it('un acierto en medio reinicia la cuenta: los fallos tienen que ser SEGUIDOS', () => {
    const breaker = new CircuitBreaker();
    breaker.failure(1);
    breaker.failure(1);
    breaker.success(1);
    breaker.failure(1);
    breaker.failure(1);
    expect(breaker.stateOf(1)).toBe('closed');
    expect(breaker.allow(1)).toBe(true);
  });

  it('pasados los 60 s deja pasar UNA sola sonda; las demás esperan', () => {
    const time = clock();
    const breaker = new CircuitBreaker({ now: time.now });
    for (let i = 0; i < 3; i++) breaker.failure(1);
    time.advance(60_000);
    expect(breaker.allow(1)).toBe(true); // la sonda
    expect(breaker.stateOf(1)).toBe('half-open');
    expect(breaker.allow(1)).toBe(false);
    expect(breaker.allow(1)).toBe(false);
  });

  it('si la sonda sale bien se cierra; si falla vuelve a abrirse por otros 60 s', () => {
    const time = clock();
    const breaker = new CircuitBreaker({ now: time.now });
    for (let i = 0; i < 3; i++) breaker.failure(1);
    time.advance(60_000);
    breaker.allow(1);
    breaker.failure(1);
    expect(breaker.stateOf(1)).toBe('open');
    time.advance(30_000);
    expect(breaker.allow(1)).toBe(false);
    time.advance(30_000);
    expect(breaker.allow(1)).toBe(true);
    breaker.success(1);
    expect(breaker.stateOf(1)).toBe('closed');
    expect(breaker.allow(1)).toBe(true);
    breaker.failure(1);
    expect(breaker.stateOf(1)).toBe('closed'); // la cuenta empieza de cero
  });

  it('una sonda que no llega a ser fallo ni acierto se libera para que otra la intente', () => {
    const time = clock();
    const breaker = new CircuitBreaker({ now: time.now });
    for (let i = 0; i < 3; i++) breaker.failure(1);
    time.advance(60_000);
    expect(breaker.allow(1)).toBe(true);
    breaker.release(1);
    expect(breaker.allow(1)).toBe(true);
  });

  it('cada bot tiene su circuito', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 3; i++) breaker.failure(1);
    expect(breaker.allow(1)).toBe(false);
    expect(breaker.allow(2)).toBe(true);
  });

  it('reset olvida el historial', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 3; i++) breaker.failure(1);
    breaker.reset(1);
    expect(breaker.allow(1)).toBe(true);
  });
});

describe('OutboundLimiter', () => {
  it('2 simultáneas: la tercera espera hasta que una termine', () => {
    const limiter = new OutboundLimiter();
    const a = limiter.tryAcquire(1, 100);
    const b = limiter.tryAcquire(2, 100);
    expect(a.ok && b.ok).toBe(true);
    expect(limiter.tryAcquire(3, 100)).toEqual({ ok: false, scope: 'simultaneas' });
    if (a.ok) a.release();
    expect(limiter.inFlight).toBe(1);
    expect(limiter.tryAcquire(3, 100).ok).toBe(true);
  });

  it('liberar dos veces no libera de más', () => {
    const limiter = new OutboundLimiter();
    const a = limiter.tryAcquire(1, 100);
    if (a.ok) {
      a.release();
      a.release();
    }
    expect(limiter.inFlight).toBe(0);
  });

  it('20 por minuto en total, y el minuto se renueva', () => {
    const time = clock();
    const limiter = new OutboundLimiter({ now: time.now });
    for (let i = 0; i < 20; i++) {
      const slot = limiter.tryAcquire(i, 100);
      expect(slot.ok, `llamada ${i}`).toBe(true);
      if (slot.ok) slot.release();
    }
    expect(limiter.tryAcquire(99, 100)).toEqual({ ok: false, scope: 'global' });
    time.advance(60_001);
    expect(limiter.tryAcquire(99, 100).ok).toBe(true);
  });

  it('cada bot tiene su límite por minuto', () => {
    const limiter = new OutboundLimiter();
    for (let i = 0; i < 3; i++) {
      const slot = limiter.tryAcquire(1, 3);
      expect(slot.ok).toBe(true);
      if (slot.ok) slot.release();
    }
    expect(limiter.tryAcquire(1, 3)).toEqual({ ok: false, scope: 'bot' });
    expect(limiter.tryAcquire(2, 3).ok).toBe(true);
  });

  it('3 por sesión y hora; otra sesión tiene su propio cupo; sin sesión no aplica', () => {
    const time = clock();
    const limiter = new OutboundLimiter({ now: time.now, globalPerMinute: 1000 });
    const use = (session?: string) => {
      const slot = limiter.tryAcquire(1, 1000, session);
      if (slot.ok) slot.release();
      return slot;
    };
    for (let i = 0; i < 3; i++) expect(use('ses-a').ok).toBe(true);
    expect(use('ses-a')).toEqual({ ok: false, scope: 'sesion' });
    expect(use('ses-b').ok).toBe(true);
    for (let i = 0; i < 10; i++) expect(use(undefined).ok).toBe(true);
    time.advance(60 * 60_000 + 1);
    expect(use('ses-a').ok).toBe(true);
  });

  it('una llamada rechazada no gasta cupo de las demás ventanas', () => {
    const limiter = new OutboundLimiter({ perSessionPerHour: 3, globalPerMinute: 20 });
    // El bot 1 solo admite 1 por minuto: la segunda se rechaza por «bot» y no debe contar para la sesión ni el total.
    const first = limiter.tryAcquire(1, 1, 's');
    if (first.ok) first.release();
    for (let i = 0; i < 10; i++) expect(limiter.tryAcquire(1, 1, 's')).toEqual({ ok: false, scope: 'bot' });
    for (let i = 0; i < 2; i++) {
      const slot = limiter.tryAcquire(2, 100, 's');
      expect(slot.ok, `sesión ${i}`).toBe(true); // la sesión llevaba 1 de 3
      if (slot.ok) slot.release();
    }
    expect(limiter.tryAcquire(2, 100, 's')).toEqual({ ok: false, scope: 'sesion' });
  });
});
