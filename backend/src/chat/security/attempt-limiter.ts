/** Ventana deslizante por clave (IP) con tope de intentos; se limpia sola para no crecer sin tope. */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** true si el intento entra; false si la clave ya llegó al tope dentro de la ventana. */
  tryConsume(key: string): boolean {
    const now = this.now();
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }

  reset(): void {
    this.hits.clear();
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
