import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decisión 129: registro de VIN del concesionario (`vehiculos_vin`). Solo datos de fábrica del vehículo, nada del
 * propietario. El CHECK repite las reglas del VIN (17 caracteres en mayúsculas, sin I, O ni Q).
 */
export class VinRegistry1700000000010 implements MigrationInterface {
  name = 'VinRegistry1700000000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "vehiculos_vin" (
      "vin" character(17) NOT NULL,
      "marca" character varying(60) NOT NULL,
      "modelo" character varying(80) NOT NULL,
      "anio" smallint NOT NULL,
      "version" character varying(80) NOT NULL,
      "carroceria" character varying(40) NOT NULL,
      "puertas" smallint NOT NULL,
      "motor" character varying(60) NOT NULL,
      "combustible" character varying(30) NOT NULL,
      "transmision" character varying(40) NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_vehiculos_vin" PRIMARY KEY ("vin"),
      CONSTRAINT "CHK_vehiculos_vin_formato" CHECK ("vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
      CONSTRAINT "CHK_vehiculos_vin_anio" CHECK ("anio" BETWEEN 1980 AND 2100),
      CONSTRAINT "CHK_vehiculos_vin_puertas" CHECK ("puertas" BETWEEN 1 AND 9)
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "vehiculos_vin"`);
  }
}
