import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metadatos del vector de cada vehículo: `embedding_hash` (sha256 del texto embebido más el nombre del modelo)
 * y `embedding_modelo`. Permiten que `npm run embeddings:sync` recalcule solo lo que cambió y que un cambio de
 * modelo invalide los vectores viejos.
 */
export class EmbeddingMetadata1700000000007 implements MigrationInterface {
  name = 'EmbeddingMetadata1700000000007';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vehiculos" ADD COLUMN "embedding_hash" character(64)`);
    await q.query(`ALTER TABLE "vehiculos" ADD COLUMN "embedding_modelo" character varying(40)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vehiculos" DROP COLUMN "embedding_modelo"`);
    await q.query(`ALTER TABLE "vehiculos" DROP COLUMN "embedding_hash"`);
  }
}
