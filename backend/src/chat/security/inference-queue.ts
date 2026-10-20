/** La cola está llena: se responde 503 con Retry-After. */
export class QueueFullError extends Error {
  constructor() {
    super('El asistente está atendiendo a otras personas; intenta en unos segundos');
    this.name = 'QueueFullError';
  }
}

interface Waiter {
  start: () => void;
  cancel: (reason: Error) => void;
}

/**
 * Una inferencia a la vez (la máquina del modelo es pequeña) con una cola corta. Quien espera y se
 * desconecta sale de la cola sin gastar un turno de inferencia.
 */
export class InferenceQueue {
  private running = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly concurrency = 1,
    private readonly maxQueue = 3,
  ) {}

  get pending(): number {
    return this.waiting.length;
  }

  get active(): number {
    return this.running;
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError(signal);
    if (this.running >= this.concurrency) await this.waitForSlot(signal);
    else this.running += 1;
    try {
      if (signal?.aborted) throw abortError(signal);
      return await task();
    } finally {
      this.release();
    }
  }

  private waitForSlot(signal?: AbortSignal): Promise<void> {
    if (this.waiting.length >= this.maxQueue) return Promise.reject(new QueueFullError());
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        // El hueco ya está contado como "en uso" cuando se avisa a quien esperaba.
        start: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        cancel: reject,
      };
      const onAbort = (): void => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(abortError(signal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next.start();
    else this.running -= 1;
  }
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error('Petición cancelada');
}
