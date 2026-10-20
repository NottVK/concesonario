import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Núcleo del chat: sesiones (solo hash del token), conversaciones ligadas a la sesión con borrado en cascada,
 * y propuestas de cita de un solo uso. `conversaciones` nunca se había escrito, así que se rehace su `sesion_id`
 * (texto libre → uuid con clave foránea) sin migrar datos.
 */
export class ChatCore1700000000006 implements MigrationInterface {
  name = 'ChatCore1700000000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "chat_sesiones" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "token_hash" character(64) NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "ultima_actividad" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "ultimo_turno_en" TIMESTAMP WITH TIME ZONE,
      "turnos" integer NOT NULL DEFAULT 0,
      "vehiculos_vistos" integer array NOT NULL DEFAULT '{}',
      CONSTRAINT "PK_chat_sesiones" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX "IDX_chat_sesiones_token" ON "chat_sesiones" ("token_hash")`);
    await q.query(`CREATE INDEX "IDX_chat_sesiones_actividad" ON "chat_sesiones" ("ultima_actividad")`);

    await q.query(`DELETE FROM "conversaciones"`);
    await q.query(`ALTER TABLE "conversaciones" DROP COLUMN "sesion_id"`);
    await q.query(`ALTER TABLE "conversaciones" ADD COLUMN "sesion_id" uuid NOT NULL`);
    await q.query(`ALTER TABLE "conversaciones" ADD COLUMN "version_prompt" character varying(20)`);
    await q.query(`ALTER TABLE "conversaciones" ADD COLUMN "modelo" character varying(80)`);
    await q.query(
      `ALTER TABLE "conversaciones" ADD CONSTRAINT "FK_conversaciones_sesion" FOREIGN KEY ("sesion_id") REFERENCES "chat_sesiones"("id") ON DELETE CASCADE`,
    );
    await q.query(`CREATE INDEX "IDX_conversaciones_sesion" ON "conversaciones" ("sesion_id")`);

    await q.query(`CREATE TABLE "chat_propuestas_cita" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sesion_id" uuid NOT NULL,
      "vehiculo_id" integer NOT NULL,
      "etiqueta" character varying(160) NOT NULL,
      "inicia_en" TIMESTAMP WITH TIME ZONE NOT NULL,
      "resumen" text NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "vence_en" TIMESTAMP WITH TIME ZONE NOT NULL,
      "usada_en" TIMESTAMP WITH TIME ZONE,
      "cita_id" integer,
      CONSTRAINT "PK_chat_propuestas_cita" PRIMARY KEY ("id"),
      CONSTRAINT "FK_chat_propuestas_sesion" FOREIGN KEY ("sesion_id") REFERENCES "chat_sesiones"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_chat_propuestas_sesion" ON "chat_propuestas_cita" ("sesion_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "chat_propuestas_cita"`);
    await q.query(`DELETE FROM "conversaciones"`);
    await q.query(`DROP INDEX "IDX_conversaciones_sesion"`);
    await q.query(`ALTER TABLE "conversaciones" DROP CONSTRAINT "FK_conversaciones_sesion"`);
    await q.query(`ALTER TABLE "conversaciones" DROP COLUMN "modelo"`);
    await q.query(`ALTER TABLE "conversaciones" DROP COLUMN "version_prompt"`);
    await q.query(`ALTER TABLE "conversaciones" DROP COLUMN "sesion_id"`);
    await q.query(`ALTER TABLE "conversaciones" ADD COLUMN "sesion_id" character varying(64) NOT NULL`);
    await q.query(`CREATE INDEX "IDX_22aae236112836d0a38416abd6" ON "conversaciones" ("sesion_id")`);
    await q.query(`DROP TABLE "chat_sesiones"`);
  }
}
