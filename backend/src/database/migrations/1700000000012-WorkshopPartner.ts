import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decisión 134: lo que el taller llama en NUESTRO MCP.
 * - `bots_externos.permisos`: las herramientas con datos de clientes (consultar_relacion, validar_garantia…) solo las
 *   ve y usa un bot con el permiso `taller`. Por defecto ninguno: los bots existentes siguen viendo solo el catálogo.
 * - `validaciones_garantia`: lo que AutoMax respondió a `validar_garantia` y si ya se le envió al taller.
 * - `ordenes_taller.ultima_nota`: la nota (saneada) del último cambio de estado que avisó el taller.
 */
export class WorkshopPartner1700000000012 implements MigrationInterface {
  name = 'WorkshopPartner1700000000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bots_externos" ADD "permisos" text[] NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_permisos" CHECK ("permisos" <@ ARRAY['taller']::text[])`);
    await q.query(`CREATE TABLE "validaciones_garantia" (
      "codigo" character varying(20) NOT NULL,
      "id_relacion" character varying(12) NOT NULL,
      "resultados" jsonb NOT NULL,
      "id_mensaje" character varying(80) NOT NULL,
      "estado_envio" character varying(12) NOT NULL DEFAULT 'pendiente',
      "intentos" smallint NOT NULL DEFAULT 0,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_validaciones_garantia" PRIMARY KEY ("codigo"),
      CONSTRAINT "CHK_validaciones_envio" CHECK ("estado_envio" IN ('pendiente', 'enviado', 'fallido')),
      CONSTRAINT "CHK_validaciones_codigo" CHECK ("codigo" ~ '^OT-[0-9]{1,8}$')
    )`);
    await q.query(`ALTER TABLE "ordenes_taller" ADD "ultima_nota" character varying(300)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ordenes_taller" DROP COLUMN "ultima_nota"`);
    await q.query(`DROP TABLE "validaciones_garantia"`);
    await q.query(`ALTER TABLE "bots_externos" DROP CONSTRAINT "CHK_bots_permisos"`);
    await q.query(`ALTER TABLE "bots_externos" DROP COLUMN "permisos"`);
  }
}
