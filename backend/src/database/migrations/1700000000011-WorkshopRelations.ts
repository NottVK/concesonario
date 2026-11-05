import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decisión 130: relaciones cliente–vehículo (`relaciones`) y copia local de las órdenes del taller (`ordenes_taller`).
 * La cédula, el nombre y el teléfono van cifrados en `contacto_cifrado`; para buscar por cédula solo hay un HMAC.
 */
export class WorkshopRelations1700000000011 implements MigrationInterface {
  name = 'WorkshopRelations1700000000011';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "relaciones" (
      "id_relacion" character varying(12) NOT NULL,
      "vin" character(17) NOT NULL,
      "cedula_hmac" character(64) NOT NULL,
      "contacto_cifrado" text NOT NULL,
      "placa" character varying(10) NOT NULL,
      "kilometraje" integer NOT NULL,
      "fecha_venta" date NOT NULL,
      "plan_garantia" character varying(20) NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_relaciones" PRIMARY KEY ("id_relacion"),
      CONSTRAINT "FK_relaciones_vin" FOREIGN KEY ("vin") REFERENCES "vehiculos_vin"("vin") ON DELETE RESTRICT,
      CONSTRAINT "CHK_relaciones_id" CHECK ("id_relacion" ~ '^REL-[0-9]{4,6}$'),
      CONSTRAINT "CHK_relaciones_cifrado" CHECK ("contacto_cifrado" LIKE 'enc:v2:%'),
      CONSTRAINT "CHK_relaciones_hmac" CHECK ("cedula_hmac" ~ '^[0-9a-f]{64}$'),
      CONSTRAINT "CHK_relaciones_km" CHECK ("kilometraje" >= 0),
      CONSTRAINT "CHK_relaciones_plan" CHECK ("plan_garantia" IN ('todo', 'tren_motriz'))
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_relaciones_cedula_vin" ON "relaciones" ("cedula_hmac", "vin")`);

    await q.query(`CREATE TABLE "ordenes_taller" (
      "codigo" character varying(20) NOT NULL,
      "id_relacion" character varying(12) NOT NULL,
      "sede_codigo" character varying(20) NOT NULL,
      "sede_nombre" character varying(120) NOT NULL,
      "fecha_cita" TIMESTAMP WITH TIME ZONE NOT NULL,
      "estado" character varying(30) NOT NULL,
      "por_garantia" boolean NOT NULL DEFAULT false,
      "origen" character varying(12) NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_ordenes_taller" PRIMARY KEY ("codigo"),
      CONSTRAINT "FK_ordenes_taller_relacion" FOREIGN KEY ("id_relacion") REFERENCES "relaciones"("id_relacion") ON DELETE RESTRICT,
      CONSTRAINT "CHK_ordenes_taller_origen" CHECK ("origen" IN ('simulado', 'taller'))
    )`);
    await q.query(`CREATE INDEX "IDX_ordenes_taller_relacion" ON "ordenes_taller" ("id_relacion")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "ordenes_taller"`);
    await q.query(`DROP TABLE "relaciones"`);
  }
}
