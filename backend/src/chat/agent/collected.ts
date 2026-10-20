import { parseColombianNumber } from '../text/amounts.js';
import { formatPesos } from '../tools/format.js';
import type { ProposalView, ToolResult, VehicleCard } from '../tools/tool-types.js';

/** Campos de las tools que son dinero en pesos: lo único que el validador acepta como "respaldado". */
const MONEY_KEYS = new Set([
  'precio',
  'cuota_inicial',
  'financiado',
  'cuota',
  'total_a_pagar',
  'intereses',
  'diferencia_precio',
]);

/** Texto de un dato de tool para la plantilla; lo que no sea texto o número queda vacío. */
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      visit(key, inner);
      walk(inner, visit);
    }
  }
}

/** Todo lo que devolvieron las tools en un turno: sirve para validar la respuesta y armar la plantilla. */
export class Collected {
  readonly money = new Set<number>();
  readonly counts = new Set<number>();
  readonly cards: VehicleCard[] = [];
  readonly seen = new Set<number>();
  readonly results: { tool: string; data: Record<string, unknown> }[] = [];
  proposal: ProposalView | null = null;

  add(tool: string, result: ToolResult): void {
    this.results.push({ tool, data: result.data });
    walk(result.data, (key, value) => {
      if (MONEY_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')) {
        const amount = typeof value === 'number' ? value : parseColombianNumber(value);
        if (Number.isFinite(amount)) this.money.add(amount);
      }
      if ((key === 'total' || key === 'mostrando') && typeof value === 'number') this.counts.add(value);
      if (key === 'vehiculos' && Array.isArray(value)) this.counts.add(value.length);
    });
    for (const card of result.cards ?? []) {
      if (!this.cards.some((c) => c.id === card.id)) this.cards.push(card);
    }
    for (const id of result.seen ?? []) this.seen.add(id);
    if (result.proposal) this.proposal = result.proposal;
  }

  /** Todo el texto que devolvieron las tools en el turno. */
  text(): string {
    return this.results.map((r) => JSON.stringify(r.data)).join(' ');
  }

  private last(tool: string): Record<string, unknown> | undefined {
    return [...this.results].reverse().find((r) => r.tool === tool && !('error' in r.data))?.data;
  }

  /**
   * Respuesta armada solo con datos de las tools (cuando el modelo no logra una respuesta válida).
   * Nada de aquí viene del modelo.
   */
  template(): string | null {
    if (this.proposal) {
      return `${this.proposal.summary}. Revisa la tarjeta y confírmala con tus datos; todavía no está agendada.`;
    }
    const credit = this.last('simular_credito');
    if (credit) {
      return `Con una cuota inicial de ${text(credit.cuota_inicial_texto)} a ${text(credit.meses)} meses, la cuota mensual sería de ${text(credit.cuota_texto)} (total a pagar ${text(credit.total_a_pagar_texto)}).`;
    }
    const compare = this.last('comparar_vehiculos');
    if (compare) return this.listTemplate(compare.vehiculos, 'Comparación');
    const search = this.last('buscar_vehiculos');
    if (search) return this.listTemplate(search.vehiculos, 'Encontré');
    const detail = this.last('detalle_vehiculo');
    if (detail?.vehiculo) return this.listTemplate([detail.vehiculo], 'Ficha');
    const failed = [...this.results].reverse().find((r) => typeof r.data.error === 'string');
    return failed ? String(failed.data.error) : null;
  }

  private listTemplate(vehicles: unknown, lead: string): string {
    if (!Array.isArray(vehicles) || vehicles.length === 0) return 'No encontré vehículos disponibles con esos criterios.';
    const lines = vehicles.slice(0, 3).map((raw) => {
      const v = raw as Record<string, unknown>;
      return `${text(v.marca)} ${text(v.modelo)} ${text(v.version)} ${text(v.anio)} por ${typeof v.precio === 'string' ? formatPesos(v.precio) : '$?'}`;
    });
    return `${lead}: ${lines.join('; ')}.`;
  }
}
