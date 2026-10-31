import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ficha pública por VIN (chatbot limitado a una función). Tabla NUEVA: `vehiculos` no cambia.
 * `down` la elimina por completo.
 */
export class FichasVin1700000000010 implements MigrationInterface {
  name = 'FichasVin1700000000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "fichas_vin" (
      "id" SERIAL NOT NULL,
      "vin" character(17) NOT NULL,
      "vehiculo_id" integer NOT NULL,
      "carroceria" character varying(30) NOT NULL,
      "puertas" smallint NOT NULL,
      CONSTRAINT "PK_fichas_vin" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_fichas_vin_vin" UNIQUE ("vin"),
      CONSTRAINT "UQ_fichas_vin_vehiculo" UNIQUE ("vehiculo_id"),
      CONSTRAINT "CHK_fichas_vin_vin" CHECK ("vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
      CONSTRAINT "CHK_fichas_vin_puertas" CHECK ("puertas" BETWEEN 2 AND 5),
      CONSTRAINT "FK_fichas_vin_vehiculo" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "fichas_vin"`);
  }
}
