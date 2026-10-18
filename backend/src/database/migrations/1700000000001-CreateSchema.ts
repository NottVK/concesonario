import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSchema1700000000001 implements MigrationInterface {
    name = 'CreateSchema1700000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bots_externos" ("id" SERIAL NOT NULL, "nombre" character varying(80) NOT NULL, "url" character varying(255) NOT NULL, "api_key" character varying(255), "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_1c0018c6f7e52d5aaa662ddf89b" UNIQUE ("nombre"), CONSTRAINT "PK_9c61e5123a0d9d1acf468b6623e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."direccion_intercambio_enum" AS ENUM('saliente', 'entrante')`);
        await queryRunner.query(`CREATE TABLE "intercambios_bots" ("id" SERIAL NOT NULL, "bot_id" integer NOT NULL, "direccion" "public"."direccion_intercambio_enum" NOT NULL, "pregunta" text NOT NULL, "respuesta" text, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_daac4ce01940706491da32aa914" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a57a81e0fc9483242c932b6c06" ON "intercambios_bots"  ("bot_id") `);
        await queryRunner.query(`CREATE TABLE "clientes" ("id" SERIAL NOT NULL, "nombre" character varying(120) NOT NULL, "telefono" character varying(30), "correo" character varying(120) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1b10c7d5f7526810e1c70fb9656" UNIQUE ("correo"), CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "marcas" ("id" SERIAL NOT NULL, "nombre" character varying(60) NOT NULL, "pais" character varying(60) NOT NULL, "logo_url" character varying(255), CONSTRAINT "UQ_29f5713899c32a96a8900143c6f" UNIQUE ("nombre"), CONSTRAINT "PK_0dabf9ed9a15bfb634cb675f7d4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."combustible_enum" AS ENUM('gasolina', 'diesel', 'hibrido', 'electrico')`);
        await queryRunner.query(`CREATE TYPE "public"."transmision_enum" AS ENUM('manual', 'automatica')`);
        await queryRunner.query(`CREATE TYPE "public"."estado_vehiculo_enum" AS ENUM('nuevo', 'usado', 'vendido')`);
        await queryRunner.query(`CREATE TABLE "vehiculos" ("id" SERIAL NOT NULL, "marca_id" integer NOT NULL, "modelo" character varying(80) NOT NULL, "anio" integer NOT NULL, "version" character varying(80) NOT NULL, "precio" numeric(12,2) NOT NULL, "km" integer NOT NULL DEFAULT '0', "combustible" "public"."combustible_enum" NOT NULL, "transmision" "public"."transmision_enum" NOT NULL, "color" character varying(40) NOT NULL, "estado" "public"."estado_vehiculo_enum" NOT NULL DEFAULT 'nuevo', "descripcion" text, "imagenes" text array NOT NULL DEFAULT '{}', "embedding" vector(768), CONSTRAINT "PK_bc0b75baae377e599cd46b502e1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ff1379ca5e3b8220ba499302e" ON "vehiculos"  ("marca_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_fd85aaf9a0e4844f910e5036ab" ON "vehiculos"  ("anio") `);
        await queryRunner.query(`CREATE INDEX "IDX_b215bf76ab1c45975da804ce71" ON "vehiculos"  ("precio") `);
        await queryRunner.query(`CREATE INDEX "IDX_cdef0dbac176a550b3194ddbea" ON "vehiculos"  ("estado") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_202ecb295dcca65489127f8dcf" ON "vehiculos"  ("marca_id", "modelo", "anio", "version") `);
        await queryRunner.query(`CREATE TYPE "public"."estado_cita_enum" AS ENUM('pendiente', 'confirmada', 'cancelada')`);
        await queryRunner.query(`CREATE TABLE "citas" ("id" SERIAL NOT NULL, "cliente_id" integer NOT NULL, "vehiculo_id" integer NOT NULL, "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL, "estado" "public"."estado_cita_enum" NOT NULL DEFAULT 'pendiente', CONSTRAINT "PK_43851fd780e10030fbe5bb1b912" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f397ad5beb86af84c8376cc7af" ON "citas"  ("cliente_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_citas_vehiculo_fecha_activa" ON "citas"  ("vehiculo_id", "fecha_hora") WHERE estado <> 'cancelada'`);
        await queryRunner.query(`CREATE TYPE "public"."rol_conversacion_enum" AS ENUM('user', 'assistant', 'tool')`);
        await queryRunner.query(`CREATE TABLE "conversaciones" ("id" SERIAL NOT NULL, "sesion_id" character varying(64) NOT NULL, "rol" "public"."rol_conversacion_enum" NOT NULL, "mensaje" text NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f66299f2c12dd08b4ae19feefc5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_22aae236112836d0a38416abd6" ON "conversaciones"  ("sesion_id") `);
        await queryRunner.query(`CREATE TYPE "public"."rol_usuario_enum" AS ENUM('admin', 'vendedor', 'cliente')`);
        await queryRunner.query(`CREATE TABLE "usuarios" ("id" SERIAL NOT NULL, "nombre" character varying(120) NOT NULL, "correo" character varying(120) NOT NULL, "hash" character varying(100) NOT NULL, "rol" "public"."rol_usuario_enum" NOT NULL, CONSTRAINT "UQ_63665765c1a778a770c9bd585d3" UNIQUE ("correo"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."metodo_pago_enum" AS ENUM('contado', 'credito', 'leasing')`);
        await queryRunner.query(`CREATE TABLE "ventas" ("id" SERIAL NOT NULL, "vehiculo_id" integer NOT NULL, "cliente_id" integer NOT NULL, "vendedor_id" integer NOT NULL, "precio_final" numeric(12,2) NOT NULL, "pago" "public"."metodo_pago_enum" NOT NULL, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b8b73abe8561829c019531d9a2e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b508c8dc45fc6e98b980781080" ON "ventas"  ("vehiculo_id") `);
        await queryRunner.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "FK_a57a81e0fc9483242c932b6c062" FOREIGN KEY ("bot_id") REFERENCES "bots_externos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vehiculos" ADD CONSTRAINT "FK_9ff1379ca5e3b8220ba499302eb" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "citas" ADD CONSTRAINT "FK_f397ad5beb86af84c8376cc7af5" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "citas" ADD CONSTRAINT "FK_4f4e6d2f5a2c55f08ed3ba31695" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "FK_b508c8dc45fc6e98b980781080e" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "FK_9bed5755d2b7b6eea4147b81ddf" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_9bed5755d2b7b6eea4147b81ddf"`);
        await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52"`);
        await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_b508c8dc45fc6e98b980781080e"`);
        await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT "FK_4f4e6d2f5a2c55f08ed3ba31695"`);
        await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT "FK_f397ad5beb86af84c8376cc7af5"`);
        await queryRunner.query(`ALTER TABLE "vehiculos" DROP CONSTRAINT "FK_9ff1379ca5e3b8220ba499302eb"`);
        await queryRunner.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "FK_a57a81e0fc9483242c932b6c062"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b508c8dc45fc6e98b980781080"`);
        await queryRunner.query(`DROP TABLE "ventas"`);
        await queryRunner.query(`DROP TYPE "public"."metodo_pago_enum"`);
        await queryRunner.query(`DROP TABLE "usuarios"`);
        await queryRunner.query(`DROP TYPE "public"."rol_usuario_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_22aae236112836d0a38416abd6"`);
        await queryRunner.query(`DROP TABLE "conversaciones"`);
        await queryRunner.query(`DROP TYPE "public"."rol_conversacion_enum"`);
        await queryRunner.query(`DROP INDEX "public"."uq_citas_vehiculo_fecha_activa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f397ad5beb86af84c8376cc7af"`);
        await queryRunner.query(`DROP TABLE "citas"`);
        await queryRunner.query(`DROP TYPE "public"."estado_cita_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_202ecb295dcca65489127f8dcf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cdef0dbac176a550b3194ddbea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b215bf76ab1c45975da804ce71"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd85aaf9a0e4844f910e5036ab"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ff1379ca5e3b8220ba499302e"`);
        await queryRunner.query(`DROP TABLE "vehiculos"`);
        await queryRunner.query(`DROP TYPE "public"."estado_vehiculo_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transmision_enum"`);
        await queryRunner.query(`DROP TYPE "public"."combustible_enum"`);
        await queryRunner.query(`DROP TABLE "marcas"`);
        await queryRunner.query(`DROP TABLE "clientes"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a57a81e0fc9483242c932b6c06"`);
        await queryRunner.query(`DROP TABLE "intercambios_bots"`);
        await queryRunner.query(`DROP TYPE "public"."direccion_intercambio_enum"`);
        await queryRunner.query(`DROP TABLE "bots_externos"`);
    }

}
