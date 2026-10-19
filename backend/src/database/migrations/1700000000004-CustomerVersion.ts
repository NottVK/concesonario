import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versión del cliente para detectar ediciones simultáneas: PUT /clientes/:id debe traer la versión que leyó
 * y solo se aplica si sigue siendo la actual (si no, 409).
 */
export class CustomerVersion1700000000004 implements MigrationInterface {
  name = 'CustomerVersion1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ADD COLUMN "version" integer NOT NULL DEFAULT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "version"`);
  }
}
