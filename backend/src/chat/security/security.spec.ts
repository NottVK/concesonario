import { HourlyLimiter } from './hourly-limiter.js';
import { InferenceQueue, QueueFullError } from './inference-queue.js';
import { INTERNAL_HEADER, InternalSecret } from './internal-secret.js';
import { isInternalCall } from './internal-throttler.guard.js';

const tick = (ms = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('InferenceQueue', () => {
  it('ejecuta una tarea a la vez y respeta el orden', async () => {
    const queue = new InferenceQueue(1, 3);
    const order: string[] = [];
    const gate = deferred();
    const first = queue.run(async () => {
      order.push('a-inicia');
      await gate.promise;
      order.push('a-fin');
    });
    const second = queue.run(async () => {
      order.push('b');
    });
    await tick();
    expect(order).toEqual(['a-inicia']);
    expect(queue.pending).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['a-inicia', 'a-fin', 'b']);
    expect(queue.active).toBe(0);
  });

  it('con la cola llena rechaza con QueueFullError', async () => {
    const queue = new InferenceQueue(1, 3);
    const gate = deferred();
    const running = [queue.run(() => gate.promise)];
    await tick();
    for (let i = 0; i < 3; i++) running.push(queue.run(() => gate.promise));
    await expect(queue.run(async () => 'x')).rejects.toBeInstanceOf(QueueFullError);
    gate.resolve();
    await Promise.all(running);
  });

  it('quien espera y se desconecta sale de la cola sin ejecutar su tarea', async () => {
    const queue = new InferenceQueue(1, 3);
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    const controller = new AbortController();
    let executed = false;
    const waiting = queue.run(async () => {
      executed = true;
    }, controller.signal);
    await tick();
    controller.abort(new Error('cerró'));
    await expect(waiting).rejects.toThrow('cerró');
    expect(queue.pending).toBe(0);
    gate.resolve();
    await first;
    expect(executed).toBe(false);
  });

  it('un error en la tarea libera el hueco', async () => {
    const queue = new InferenceQueue(1, 1);
    await expect(queue.run(async () => Promise.reject(new Error('falló')))).rejects.toThrow('falló');
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('una señal ya cancelada ni siquiera entra', async () => {
    const controller = new AbortController();
    controller.abort(new Error('antes'));
    await expect(new InferenceQueue().run(async () => 'x', controller.signal)).rejects.toThrow('antes');
  });
});

describe('HourlyLimiter', () => {
  it('deja pasar hasta el límite por clave y libera con el tiempo', () => {
    let now = 0;
    const limiter = new HourlyLimiter(() => 3, () => now);
    expect([1, 2, 3].map(() => limiter.tryConsume('ip-a'))).toEqual([true, true, true]);
    expect(limiter.tryConsume('ip-a')).toBe(false);
    expect(limiter.tryConsume('ip-b')).toBe(true); // otra IP no se ve afectada
    expect(limiter.retryAfterSeconds('ip-a')).toBe(3600);
    now = 3_600_001;
    expect(limiter.tryConsume('ip-a')).toBe(true);
  });
});

describe('isInternalCall (exención del límite por IP)', () => {
  const secret = new InternalSecret();
  const req = (overrides: { remote?: string; method?: string; path?: string; header?: string | null } = {}) => ({
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/api/vehiculos/12',
    socket: { remoteAddress: overrides.remote ?? '127.0.0.1' },
    headers: overrides.header === null ? {} : { [INTERNAL_HEADER]: overrides.header ?? secret.header() },
  }) as unknown as Parameters<typeof isInternalCall>[0];

  it('se exime solo con loopback + ruta de la lista + secreto correcto', () => {
    expect(isInternalCall(req(), secret)).toBe(true);
    expect(isInternalCall(req({ remote: '::1' }), secret)).toBe(true);
    expect(isInternalCall(req({ remote: '::ffff:127.0.0.1', method: 'POST', path: '/api/citas' }), secret)).toBe(true);
    expect(isInternalCall(req({ path: '/api/vehiculos/buscar' }), secret)).toBe(true);
  });

  it('con un secreto falso, sin secreto, desde fuera del loopback o en una ruta no listada: NO', () => {
    expect(isInternalCall(req({ header: 'secreto-falso' }), secret)).toBe(false);
    expect(isInternalCall(req({ header: '' }), secret)).toBe(false);
    expect(isInternalCall(req({ header: null }), secret)).toBe(false);
    expect(isInternalCall(req({ remote: '192.168.1.20' }), secret)).toBe(false);
    expect(isInternalCall(req({ remote: '10.0.0.5' }), secret)).toBe(false);
    for (const path of ['/api/clientes', '/api/chat', '/api/auth/login', '/api/vehiculos/12/otra', '/api/admin/vehiculos', '/api/vehiculos/1e3']) {
      expect(isInternalCall(req({ path }), secret), path).toBe(false);
    }
    expect(isInternalCall(req({ method: 'DELETE', path: '/api/vehiculos/12' }), secret)).toBe(false);
    expect(isInternalCall(req({ method: 'POST', path: '/api/clientes' }), secret)).toBe(false);
  });

  it('el secreto de otra instancia no sirve, y el secreto no se deja ver en texto', () => {
    const other = new InternalSecret();
    expect(isInternalCall(req({ header: other.header() }), secret)).toBe(false);
    expect(secret.matches(undefined)).toBe(false);
    expect(secret.matches(['x'])).toBe(false);
    expect(secret.matches('a'.repeat(5000))).toBe(false);
    expect(String(secret)).not.toContain(secret.header());
    expect(JSON.stringify(secret)).not.toContain(secret.header());
    expect(secret.header()).toHaveLength(64);
  });
});
