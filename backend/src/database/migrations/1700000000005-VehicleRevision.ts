import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revisión del vehículo (no confundir con la versión comercial, p. ej. "XEI") para detectar ediciones
 * simultáneas: PUT /vehiculos/:id debe traer la revisión que leyó y solo se aplica si sigue siendo la actual (si no, 409). La venta también la incrementa, así que una edición
 * abierta antes de vender el vehículo no puede guardarse después.
 */
export class VehicleRevision1700000000005 implements MigrationInterface {
  name = 'VehicleRevision1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehiculos" ADD COLUMN "revision" integer NOT NULL DEFAULT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehiculos" DROP COLUMN "revision"`);
  }
}
