import type { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_STATES = ['rechazado', 'timeout', 'error_remoto', 'bloqueado_ssrf', 'respuesta_invalida', 'circuito_abierto', 'limite'];

/**
 * Fase 6 (A2A), decisiones 115 y 117.
 * - `intercambios_bots`: estados nuevos, `peticion_id` y hashes de la pregunta y la respuesta, y un CHECK por canal que
 *   obliga a que `a2a` lleve pregunta (≤ 200), estado y hash, sin campos de MCP, y a que la respuesta (≤ 600) y su hash
 *   existan juntas. Las filas `a2a` anteriores (no debería haber) se completan: estado `ok`, texto recortado, hashes.
 * - `bots_externos`: cómo se autentica NUESTRA llamada saliente (`auth_saliente`) y su límite por minuto.
 * - `down`: descarta las keys `enc:v2` (el código anterior no las lee); las `enc:v1` se conservan.
 */
export class A2aAudit1700000000009 implements MigrationInterface {
  name = 'A2aAudit1700000000009';

  public async up(q: QueryRunner): Promise<void> {
    // ADD VALUE no se puede usar en la misma transacción: los valores nuevos no aparecen en ningún CHECK ni UPDATE de aquí.
    for (const state of NEW_STATES) await q.query(`ALTER TYPE "public"."estado_intercambio_enum" ADD VALUE IF NOT EXISTS '${state}'`);

    await q.query(`ALTER TABLE "intercambios_bots"
      ADD COLUMN "peticion_id" uuid,
      ADD COLUMN "pregunta_hash" character(64),
      ADD COLUMN "respuesta_hash" character(64)`);
    await q.query(`UPDATE "intercambios_bots" SET
      "pregunta" = left("pregunta", 200), "respuesta" = left("respuesta", 600),
      "estado" = COALESCE("estado", 'ok'), "peticion_id" = gen_random_uuid()
      WHERE "canal" = 'a2a'`);
    await q.query(`UPDATE "intercambios_bots" SET
      "pregunta_hash" = encode(sha256(convert_to("pregunta", 'UTF8')), 'hex'),
      "respuesta_hash" = CASE WHEN "respuesta" IS NULL THEN NULL ELSE encode(sha256(convert_to("respuesta", 'UTF8')), 'hex') END
      WHERE "canal" = 'a2a'`);

    await q.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "CHK_intercambios_canal"`);
    await q.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "CHK_intercambios_canal" CHECK (
      ("canal" = 'a2a'
        AND "pregunta" IS NOT NULL AND char_length("pregunta") <= 200
        AND ("respuesta" IS NULL OR char_length("respuesta") <= 600)
        AND "estado" IS NOT NULL AND "peticion_id" IS NOT NULL AND "pregunta_hash" IS NOT NULL
        AND (("respuesta" IS NULL) = ("respuesta_hash" IS NULL))
        AND "herramienta" IS NULL AND "args_resumen" IS NULL)
      OR ("canal" = 'mcp'
        AND "pregunta" IS NULL AND "respuesta" IS NULL AND "herramienta" IS NOT NULL AND "estado" IS NOT NULL
        AND "peticion_id" IS NULL AND "pregunta_hash" IS NULL AND "respuesta_hash" IS NULL))`);

    await q.query(`ALTER TABLE "bots_externos"
      ADD COLUMN "auth_saliente" character varying(12) NOT NULL DEFAULT 'bearer',
      ADD COLUMN "limite_saliente_minuto" integer NOT NULL DEFAULT 10`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_auth_saliente" CHECK ("auth_saliente" IN ('bearer', 'x_api_key'))`);
    await q.query(`ALTER TABLE "bots_externos" ADD CONSTRAINT "CHK_bots_limite_saliente" CHECK ("limite_saliente_minuto" BETWEEN 1 AND 60)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // El código anterior a esta migración solo lee `enc:v1`: una `enc:v2` (con AAD) le sería ilegible y daría error al
    // usarla. No se puede volver a cifrar sin la clave (vive en la aplicación), así que se descartan; el admin las vuelve a poner.
    await q.query(`UPDATE "bots_externos" SET "api_key_saliente" = NULL WHERE "api_key_saliente" LIKE 'enc:v2:%'`);
    await q.query(`ALTER TABLE "bots_externos" DROP CONSTRAINT "CHK_bots_limite_saliente", DROP CONSTRAINT "CHK_bots_auth_saliente"`);
    await q.query(`ALTER TABLE "bots_externos" DROP COLUMN "limite_saliente_minuto", DROP COLUMN "auth_saliente"`);

    // Los estados nuevos no se pueden quitar de un ENUM: se borran las filas que los usan y se recrea el tipo.
    await q.query(`DELETE FROM "intercambios_bots" WHERE "estado"::text = ANY($1)`, [NEW_STATES]);
    await q.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "CHK_intercambios_canal"`);
    await q.query(`ALTER TABLE "intercambios_bots"
      DROP COLUMN "respuesta_hash", DROP COLUMN "pregunta_hash", DROP COLUMN "peticion_id"`);
    await q.query(`ALTER TYPE "public"."estado_intercambio_enum" RENAME TO "estado_intercambio_enum_old"`);
    await q.query(`CREATE TYPE "public"."estado_intercambio_enum" AS ENUM('ok', 'error_validacion', 'error_interno')`);
    await q.query(`ALTER TABLE "intercambios_bots" ALTER COLUMN "estado" TYPE "public"."estado_intercambio_enum"
      USING "estado"::text::"public"."estado_intercambio_enum"`);
    await q.query(`DROP TYPE "public"."estado_intercambio_enum_old"`);
    await q.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "CHK_intercambios_canal" CHECK (
      ("canal" = 'a2a' AND "pregunta" IS NOT NULL)
      OR ("canal" = 'mcp' AND "pregunta" IS NULL AND "respuesta" IS NULL AND "herramienta" IS NOT NULL AND "estado" IS NOT NULL))`);
  }
}
