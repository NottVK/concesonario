/** Tope de claves distintas que una ventana recuerda a la vez (contra quien rota IPs para llenar la memoria). */
export const MAX_TRACKED_KEYS = 10_000;

/**
 * Ventana deslizante por clave, en memoria. La memoria tiene TOPE: al llegar a `maxKeys` se descartan primero las claves
 * vencidas y, si aún no cabe, la que se anotó hace más tiempo (quien rota miles de IPs puede hacer que se olvide un
 * contador ajeno, pero no puede hacer crecer la memoria sin límite).
 */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = MAX_TRACKED_KEYS,
  ) {}

  /** true si la petición entra (y queda contada); false si la clave ya llegó al límite dentro de la ventana. */
  tryHit(key: string, limit: number): boolean {
    const now = this.now();
    this.sweep(now);
    const known = this.hits.has(key);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    if (!known) this.makeRoom(now);
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Cuántas peticiones recientes cuenta la clave. */
  count(key: string): number {
    const now = this.now();
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length;
  }

  /** Segundos hasta que se libere un hueco (mínimo 1). */
  retryAfterSeconds(key: string): number {
    const oldest = (this.hits.get(key) ?? [])[0];
    return oldest === undefined ? 1 : Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  /** Claves recordadas ahora (para pruebas). */
  get size(): number {
    return this.hits.size;
  }

  private sweep(now: number, force = false): void {
    if (!force && now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }

  private makeRoom(now: number): void {
    if (this.hits.size < this.maxKeys) return;
    this.sweep(now, true);
    // Un Map recuerda el orden de inserción: la primera clave es la más antigua.
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}
