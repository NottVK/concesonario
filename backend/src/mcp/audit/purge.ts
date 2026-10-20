import { MCP_DEFAULTS } from '../mcp.config.js';

export interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Retención de la auditoría: canal MCP 90 días y canal a2a 30 (lleva texto redactado). Devuelve cuántas filas borró.
 * Un CTE da el conteo como fila normal (un DELETE ... RETURNING cambia de forma según el driver).
 */
export async function purgeBotAudit(db: Queryable, now = new Date()): Promise<number> {
  const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = (await db.query(
    `WITH borradas AS (
       DELETE FROM intercambios_bots
       WHERE (canal = 'mcp' AND creado_en < $1) OR (canal = 'a2a' AND creado_en < $2)
       RETURNING 1)
     SELECT count(*)::int AS n FROM borradas`,
    [daysAgo(MCP_DEFAULTS.auditRetentionDays), daysAgo(MCP_DEFAULTS.a2aAuditRetentionDays)],
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}
