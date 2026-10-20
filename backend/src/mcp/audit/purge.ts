import { MCP_DEFAULTS } from '../mcp.config.js';

export interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Retención de la auditoría del canal MCP: 90 días. (Las filas del canal a2a tendrán su propia regla en la Fase 6.)
 * Devuelve cuántas filas borró. Un CTE da el conteo como fila normal (un DELETE ... RETURNING cambia de forma según el driver).
 */
export async function purgeBotAudit(db: Queryable, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - MCP_DEFAULTS.auditRetentionDays * 24 * 60 * 60 * 1000);
  const rows = (await db.query(
    `WITH borradas AS (DELETE FROM intercambios_bots WHERE canal = 'mcp' AND creado_en < $1 RETURNING 1) SELECT count(*)::int AS n FROM borradas`,
    [limit],
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}
