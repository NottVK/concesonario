const HOUR_MS = 60 * 60 * 1000;

/** Ventana deslizante por clave (IP) con límite por hora; se limpia sola para no crecer sin tope. */
export class HourlyLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  /** true si la petición entra; false si la clave ya llegó al límite de la última hora. */
  tryConsume(key: string): boolean {
    const now = this.now();
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= this.limit()) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Segundos hasta que se libere un hueco para la clave. */
  retryAfterSeconds(key: string): number {
    const oldest = (this.hits.get(key) ?? [])[0];
    return oldest === undefined ? 1 : Math.max(1, Math.ceil((oldest + HOUR_MS - this.now()) / 1000));
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= HOUR_MS)) this.hits.delete(key);
    }
  }
}
