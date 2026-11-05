import { z } from 'zod';
import { remoteMcpConfig } from '../../common/remote-mcp-config.js';
import { RemoteMcpClient, RemoteUnavailableError } from '../../common/remote-mcp.client.js';

/**
 * Tienda de repuestos (decisión 135), PREPARADA: todavía no hay conexión con su bot. Para la garantía se pregunta si
 * para ese VIN se compró un repuesto del componente que se reclama (si se compró, alguien lo cambió por fuera y no hay
 * garantía). Sin `REPUESTOS_MCP_URL` responde «sin conexión» y esa verificación se omite y se anota.
 * Contrato con la tienda (05/11/2026): `consultar_compras_vin { vin, categoria, codigo_repuesto? }` →
 * `{ compras: [{ fecha, codigo_repuesto, categoria, origen, codigo_orden, … }] }` (solo las ventas con VIN).
 */
export const PARTS_STORE = Symbol('PARTS_STORE');

export interface PartsPurchase {
  fecha?: string;
  codigo_repuesto?: string;
  categoria?: string;
  /** `mostrador` (la compró el cliente) u `orden_taller` (la compró facturación para una orden del taller). */
  origen?: string;
  /** La orden del taller para la que se compró, si fue para una orden. */
  codigo_orden?: string | null;
}

export type PartsCheck = { conectada: false } | { conectada: true; compras: PartsPurchase[] };

export interface PartsPurchaseRequest {
  vin: string;
  especialidad: string;
  sku?: string;
}

export interface PartsStoreClient {
  purchasesFor(request: PartsPurchaseRequest): Promise<PartsCheck>;
}

/** Mientras la tienda no esté conectada. */
export class DisconnectedPartsStore implements PartsStoreClient {
  purchasesFor(): Promise<PartsCheck> {
    return Promise.resolve({ conectada: false });
  }
}

const purchasesSchema = z.object({
  compras: z.array(z.object({
    fecha: z.string().max(40).optional(),
    codigo_repuesto: z.string().max(60).optional(),
    categoria: z.string().max(60).optional(),
    origen: z.string().max(30).optional(),
    codigo_orden: z.string().max(20).nullish(),
  })).max(100).default([]),
});

/** Plazo corto: corre mientras el taller espera la respuesta de `validar_garantia`. */
const PARTS_TIMEOUT_MS = 8_000;

export class McpPartsStore implements PartsStoreClient {
  private readonly remote: RemoteMcpClient;

  constructor(config: { url: URL; token: string }) {
    this.remote = new RemoteMcpClient('repuestos', config, PARTS_TIMEOUT_MS);
  }

  async purchasesFor(request: PartsPurchaseRequest): Promise<PartsCheck> {
    // Solo VIN y categoría: el `sku` del taller es un código de SERVICIO (FRE-PASTILLAS), no el código del repuesto
    // de la tienda (PAS-DEL-CER); filtrar por él no encontraría nunca la compra.
    const data = await this.remote.call('consultar_compras_vin', { vin: request.vin, categoria: request.especialidad }, PARTS_TIMEOUT_MS);
    const parsed = purchasesSchema.safeParse(data);
    if (!parsed.success) throw new RemoteUnavailableError('La respuesta de la tienda de repuestos no cumple el contrato');
    return { conectada: true, compras: parsed.data.compras };
  }
}

export function partsStoreConfig(env: NodeJS.ProcessEnv = process.env): { url: URL; token: string } | null {
  return remoteMcpConfig({ urlVar: 'REPUESTOS_MCP_URL', tokenVar: 'REPUESTOS_MCP_TOKEN', tokenHint: 'el token MCP que entrega la tienda de repuestos' }, env);
}
