import { CHAT_PROPOSAL_RETENTION_MS, CHAT_RETENTION_DAYS } from '../chat.config.js';

export interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface PurgeResult {
  sessions: number;
  proposals: number;
}

/**
 * Retención: las sesiones (con su historial, en cascada) se borran a los 7 días de la última actividad y
 * las propuestas de cita a las 24 h. Sirve tanto a la purga horaria como al comando `npm run chat:purge`.
 */
export async function purgeExpired(db: Queryable, now = new Date()): Promise<PurgeResult> {
  const sessionLimit = new Date(now.getTime() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const proposalLimit = new Date(now.getTime() - CHAT_PROPOSAL_RETENTION_MS);
  // Con CTE el conteo llega como una fila normal (un DELETE ... RETURNING cambia de forma según el driver).
  const proposals = await countDeleted(db, 'chat_propuestas_cita', 'creado_en', proposalLimit);
  const sessions = await countDeleted(db, 'chat_sesiones', 'ultima_actividad', sessionLimit);
  return { sessions, proposals };
}

async function countDeleted(db: Queryable, table: string, column: string, limit: Date): Promise<number> {
  const rows = (await db.query(
    `WITH borradas AS (DELETE FROM ${table} WHERE ${column} < $1 RETURNING 1) SELECT count(*)::int AS n FROM borradas`,
    [limit],
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}
