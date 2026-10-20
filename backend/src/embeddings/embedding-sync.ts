import type { DataSource } from 'typeorm';
import { buildEmbeddingText, embeddingHash } from './embedding-text.js';
import { EmbeddingUnavailableError, toVectorLiteral } from './embedding-provider.js';
import type { EmbeddingProvider } from './embedding-provider.js';

export interface SyncStats {
  /** Vehículos no vendidos revisados. */
  total: number;
  updated: number;
  /** Ya tenían un vector vigente (mismo texto y mismo modelo). */
  skipped: number;
  /** El vehículo cambió mientras se calculaba el vector: el cambio posterior lo recalcula. */
  stale: number;
}

export type RefreshOutcome = 'updated' | 'skipped' | 'stale' | 'missing';

interface Row {
  id: number;
  revision: number;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  combustible: string;
  transmision: string;
  estado: string;
  color: string;
  descripcion: string | null;
  tiene_vector: boolean;
  embedding_hash: string | null;
}

const SELECT = `
  SELECT v.id, v.revision, b.nombre AS marca, v.modelo, v.version, v.anio, v.combustible, v.transmision,
         v.estado, v.color, v.descripcion, (v.embedding IS NOT NULL) AS tiene_vector, v.embedding_hash
    FROM vehiculos v JOIN marcas b ON b.id = v.marca_id
   WHERE v.estado <> 'vendido'`;

/**
 * Calcula y guarda los vectores de los vehículos. Sirve a la API (recalcular al crear o editar), al comando
 * `npm run embeddings:sync` y al seed, sin depender de Nest. Es idempotente: solo recalcula lo que no tiene
 * vector o cuyo texto/modelo cambió.
 */
export class EmbeddingSync {
  constructor(
    private readonly dataSource: DataSource,
    private readonly provider: EmbeddingProvider,
  ) {}

  private textOf(row: Row): string {
    return buildEmbeddingText({
      brandName: row.marca,
      model: row.modelo,
      version: row.version,
      year: row.anio,
      fuel: row.combustible,
      transmission: row.transmision,
      status: row.estado,
      color: row.color,
      description: row.descripcion,
    });
  }

  /**
   * Un vehículo. El UPDATE exige la MISMA revisión que se leyó: si alguien editó el vehículo mientras se
   * calculaba el vector, ese vector es viejo y no se guarda (la edición posterior calcula el suyo).
   */
  async refreshOne(id: number): Promise<RefreshOutcome> {
    const rows = (await this.dataSource.query(`${SELECT} AND v.id = $1`, [id])) as Row[];
    return rows[0] ? this.refreshRow(rows[0]) : 'missing';
  }

  private async refreshRow(row: Row): Promise<RefreshOutcome> {
    const text = this.textOf(row);
    const hash = embeddingHash(text, this.provider.model);
    if (row.tiene_vector && row.embedding_hash === hash) return 'skipped';
    const vector = await this.provider.embed(text, 'document');
    const written = (await this.dataSource.query(
      `WITH guardado AS (
         UPDATE vehiculos SET embedding = $1::vector, embedding_hash = $2, embedding_modelo = $3
          WHERE id = $4 AND revision = $5 AND estado <> 'vendido'
        RETURNING 1)
       SELECT count(*)::int AS n FROM guardado`,
      [toVectorLiteral(vector), hash, this.provider.model.slice(0, 40), row.id, row.revision],
    )) as { n: number }[];
    return (written[0]?.n ?? 0) > 0 ? 'updated' : 'stale';
  }

  /** Todos los vehículos no vendidos. Si el servicio de embeddings se cae, se detiene (EmbeddingUnavailableError). */
  async syncAll(onProgress?: (done: number, total: number) => void): Promise<SyncStats> {
    const rows = (await this.dataSource.query(`${SELECT} ORDER BY v.id`)) as Row[];
    const stats: SyncStats = { total: rows.length, updated: 0, skipped: 0, stale: 0 };
    for (const [index, row] of rows.entries()) {
      const outcome = await this.refreshRow(row);
      if (outcome === 'updated') stats.updated += 1;
      else if (outcome === 'skipped') stats.skipped += 1;
      else stats.stale += 1;
      onProgress?.(index + 1, rows.length);
    }
    return stats;
  }
}

export { EmbeddingUnavailableError };
