import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Citas con duración y sin solapes (RF4). Reemplaza el índice único por hora exacta con
 * dos restricciones de exclusión: un vehículo y un cliente no pueden tener citas activas
 * cuyos intervalos se crucen.
 */
export class AppointmentOverlap1700000000003 implements MigrationInterface {
  name = 'AppointmentOverlap1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Necesaria para usar `=` sobre enteros dentro de un índice GiST.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    await queryRunner.query(`ALTER TABLE "citas" ADD COLUMN "duracion_min" integer NOT NULL DEFAULT 60`);
    await queryRunner.query(`ALTER TABLE "citas" ADD CONSTRAINT "CHK_citas_duracion" CHECK ("duracion_min" BETWEEN 15 AND 240)`);

    // `timestamptz + interval` es STABLE y PostgreSQL no lo admite en una restricción de
    // exclusión. Sumar solo minutos no depende de zona horaria ni de DST, así que es
    // inmutable de verdad; se encapsula en una función marcada IMMUTABLE.
    await queryRunner.query(`
      CREATE FUNCTION citas_rango(inicio timestamptz, minutos integer) RETURNS tstzrange
      LANGUAGE sql IMMUTABLE PARALLEL SAFE
      AS $$ SELECT tstzrange(inicio, inicio + minutos * interval '1 minute') $$
    `);

    await queryRunner.query(`DROP INDEX "public"."uq_citas_vehiculo_fecha_activa"`);
    await queryRunner.query(`
      ALTER TABLE "citas" ADD CONSTRAINT "ex_citas_vehiculo_solape"
      EXCLUDE USING gist ("vehiculo_id" WITH =, citas_rango("fecha_hora", "duracion_min") WITH &&)
      WHERE ("estado" <> 'cancelada')
    `);
    await queryRunner.query(`
      ALTER TABLE "citas" ADD CONSTRAINT "ex_citas_cliente_solape"
      EXCLUDE USING gist ("cliente_id" WITH =, citas_rango("fecha_hora", "duracion_min") WITH &&)
      WHERE ("estado" <> 'cancelada')
    `);
  }

  // No se borra la extensión btree_gist: otras partes de la BD podrían depender de ella.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT "ex_citas_cliente_solape"`);
    await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT "ex_citas_vehiculo_solape"`);
    await queryRunner.query(`DROP FUNCTION citas_rango(timestamptz, integer)`);
    await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT "CHK_citas_duracion"`);
    await queryRunner.query(`ALTER TABLE "citas" DROP COLUMN "duracion_min"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_citas_vehiculo_fecha_activa" ON "citas" ("vehiculo_id", "fecha_hora") WHERE estado <> 'cancelada'`);
  }
}
