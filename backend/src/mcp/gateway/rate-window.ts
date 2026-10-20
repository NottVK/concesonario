/** Ventana deslizante por clave, en memoria; se limpia sola para no crecer sin tope. */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** true si la petición entra (y queda contada); false si la clave ya llegó al límite dentro de la ventana. */
  tryHit(key: string, limit: number): boolean {
    const now = this.now();
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
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

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
