import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5 (servidor MCP).
 * - `bots_externos`: la key ENTRANTE de cada bot se guarda como prefijo + HMAC (nunca en claro) y llevan límites
 *   propios; la columna `api_key` pasa a `api_key_saliente` (la que NOSOTROS enviamos, cifrada por la aplicación).
 *   Si hubiera valores en texto plano la migración se detiene: no se cifran ni se borran en silencio.
 * - `intercambios_bots`: columnas estructurales para auditar sin texto libre.
 */
export class BotKeysAndAudit1700000000008 implements MigrationInterface {
  name = 'BotKeysAndAudit1700000000008';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "bots_externos" WHERE "api_key" IS NOT NULL) THEN
        RAISE EXCEPTION 'bots_externos.api_key tiene valores en texto plano: cífralos o bórralos a mano antes de migrar';
      END IF;
    END $$`);
    await q.query(`ALTER TABLE "bots_externos" RENAME COLUMN "api_key" TO "api_key_saliente"`);
    await q.query(`ALTER TABLE "bots_externos" ALTER COLUMN "url" DROP NOT NULL`);
    await q.query(`ALTER TABLE "bots_externos"
      ADD COLUMN "clave_prefijo" character(8),
      ADD COLUMN "clave_hash" character(64),
      ADD COLUMN "pepper_version" smallint,
      ADD COLUMN "clave_rotada_en" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "ultimo_uso_en" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "limite_minuto" integer NOT NULL DEFAULT 30,
      ADD COLUMN "limite_diario" integer NOT NULL DEFAULT 2000,
      ADD COLUMN "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "UQ_bots_clave_prefijo" UNIQUE ("clave_prefijo")`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_limite_minuto" CHECK ("limite_minuto" BETWEEN 1 AND 600)`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_limite_diario" CHECK ("limite_diario" BETWEEN 1 AND 100000)`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_clave" CHECK (
      ("clave_prefijo" IS NULL AND "clave_hash" IS NULL AND "pepper_version" IS NULL)
      OR ("clave_prefijo" IS NOT NULL AND "clave_hash" IS NOT NULL AND "pepper_version" IS NOT NULL))`);

    await q.query(`CREATE TYPE "public"."canal_intercambio_enum" AS ENUM('a2a', 'mcp')`);
    await q.query(`CREATE TYPE "public"."estado_intercambio_enum" AS ENUM('ok', 'error_validacion', 'error_interno')`);
    await q.query(`ALTER TABLE "intercambios_bots"
      ADD COLUMN "canal" "public"."canal_intercambio_enum" NOT NULL DEFAULT 'a2a',
      ADD COLUMN "herramienta" character varying(40),
      ADD COLUMN "args_resumen" character varying(200),
      ADD COLUMN "estado" "public"."estado_intercambio_enum",
      ADD COLUMN "duracion_ms" integer,
      ADD COLUMN "bytes_entrada" integer,
      ADD COLUMN "bytes_salida" integer`);
    await q.query(`ALTER TABLE "intercambios_bots" ALTER COLUMN "pregunta" DROP NOT NULL`);
    await q.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "CHK_intercambios_canal" CHECK (
      ("canal" = 'a2a' AND "pregunta" IS NOT NULL)
      OR ("canal" = 'mcp' AND "pregunta" IS NULL AND "respuesta" IS NULL AND "herramienta" IS NOT NULL AND "estado" IS NOT NULL))`);
    await q.query(`CREATE INDEX "IDX_intercambios_bot_fecha" ON "intercambios_bots" ("bot_id", "creado_en")`);
    await q.query(`CREATE INDEX "IDX_intercambios_fecha" ON "intercambios_bots" ("creado_en")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_intercambios_fecha"`);
    await q.query(`DROP INDEX "IDX_intercambios_bot_fecha"`);
    await q.query(`DELETE FROM "intercambios_bots" WHERE "canal" = 'mcp'`);
    await q.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "CHK_intercambios_canal"`);
    await q.query(`ALTER TABLE "intercambios_bots" ALTER COLUMN "pregunta" SET NOT NULL`);
    await q.query(`ALTER TABLE "intercambios_bots"
      DROP COLUMN "bytes_salida", DROP COLUMN "bytes_entrada", DROP COLUMN "duracion_ms",
      DROP COLUMN "estado", DROP COLUMN "args_resumen", DROP COLUMN "herramienta", DROP COLUMN "canal"`);
    await q.query(`DROP TYPE "public"."estado_intercambio_enum"`);
    await q.query(`DROP TYPE "public"."canal_intercambio_enum"`);

    await q.query(`ALTER TABLE "bots_externos"
      DROP CONSTRAINT "CHK_bots_clave", DROP CONSTRAINT "CHK_bots_limite_diario", DROP CONSTRAINT "CHK_bots_limite_minuto",
      DROP CONSTRAINT "UQ_bots_clave_prefijo"`);
    await q.query(`ALTER TABLE "bots_externos"
      DROP COLUMN "creado_en", DROP COLUMN "limite_diario", DROP COLUMN "limite_minuto", DROP COLUMN "ultimo_uso_en",
      DROP COLUMN "clave_rotada_en", DROP COLUMN "pepper_version", DROP COLUMN "clave_hash", DROP COLUMN "clave_prefijo"`);
    await q.query(`UPDATE "bots_externos" SET "url" = '' WHERE "url" IS NULL`);
    await q.query(`ALTER TABLE "bots_externos" ALTER COLUMN "url" SET NOT NULL`);
    // Las keys salientes cifradas no se pueden devolver a una columna "api_key" en claro: se descartan.
    await q.query(`UPDATE "bots_externos" SET "api_key_saliente" = NULL`);
    await q.query(`ALTER TABLE "bots_externos" RENAME COLUMN "api_key_saliente" TO "api_key"`);
  }
}
