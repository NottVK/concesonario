import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flujo de garantías. Tablas NUEVAS (`propietarios_vin`, `casos_garantia`) y el rol `mecanico`. El documento del
 * propietario no se guarda: solo su HMAC. `down` elimina las tablas; un valor de enum no se puede quitar en
 * PostgreSQL, así que `mecanico` queda en `rol_usuario_enum` (inofensivo sin usuarios con ese rol).
 */
export class Garantias1700000000011 implements MigrationInterface {
  name = 'Garantias1700000000011';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."rol_usuario_enum" ADD VALUE IF NOT EXISTS 'mecanico'`);
    await q.query(`CREATE TABLE "propietarios_vin" (
      "id" SERIAL NOT NULL,
      "documento_hash" character(64) NOT NULL,
      "vin" character(17) NOT NULL,
      "fecha_compra" date NOT NULL,
      CONSTRAINT "PK_propietarios_vin" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_propietarios_vin_vin" CHECK ("vin" ~ '^[A-HJ-NPR-Z0-9]{17}$')
    )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_propietarios_vin_doc_vin" ON "propietarios_vin" ("documento_hash", "vin")`);
    await q.query(`CREATE TABLE "casos_garantia" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "propietario_id" integer NOT NULL,
      "sesion_id" uuid,
      "estado" character varying(24) NOT NULL DEFAULT 'identificado',
      "falla" character varying(500),
      "motivo" character varying(500),
      "cambios_ajenos" boolean NOT NULL DEFAULT false,
      "no_verificado" boolean NOT NULL DEFAULT false,
      "cita_id" character varying(80),
      "cita_inicio" TIMESTAMP WITH TIME ZONE,
      "cobro_ref" character varying(80),
      "repuestos" text array NOT NULL DEFAULT '{}',
      "decidido_por" integer,
      "decidido_en" TIMESTAMP WITH TIME ZONE,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_casos_garantia" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_casos_garantia_estado" CHECK ("estado" IN ('identificado','vencida','pendiente_mecanico','aceptada','rechazada')),
      CONSTRAINT "FK_casos_garantia_propietario" FOREIGN KEY ("propietario_id") REFERENCES "propietarios_vin"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "IDX_casos_garantia_propietario" ON "casos_garantia" ("propietario_id")`);
    await q.query(`CREATE INDEX "IDX_casos_garantia_sesion" ON "casos_garantia" ("sesion_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "casos_garantia"`);
    await q.query(`DROP TABLE "propietarios_vin"`);
  }
}
