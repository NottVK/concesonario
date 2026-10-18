import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Reglas de integridad que TypeORM no genera solo: CHECKs y la FK de auditoría. */
export class AddConstraints1700000000002 implements MigrationInterface {
  name = 'AddConstraints1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehiculos" ADD CONSTRAINT "CHK_vehiculos_precio" CHECK ("precio" > 0)`);
    await queryRunner.query(`ALTER TABLE "vehiculos" ADD CONSTRAINT "CHK_vehiculos_km" CHECK ("km" >= 0)`);
    await queryRunner.query(`ALTER TABLE "vehiculos" ADD CONSTRAINT "CHK_vehiculos_anio" CHECK ("anio" BETWEEN 1990 AND 2100)`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "CHK_ventas_precio_final" CHECK ("precio_final" > 0)`);
    // El historial de intercambios es auditoría: no debe borrarse al eliminar un bot.
    await queryRunner.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "FK_a57a81e0fc9483242c932b6c062"`);
    await queryRunner.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "FK_a57a81e0fc9483242c932b6c062" FOREIGN KEY ("bot_id") REFERENCES "bots_externos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "intercambios_bots" DROP CONSTRAINT "FK_a57a81e0fc9483242c932b6c062"`);
    await queryRunner.query(`ALTER TABLE "intercambios_bots" ADD CONSTRAINT "FK_a57a81e0fc9483242c932b6c062" FOREIGN KEY ("bot_id") REFERENCES "bots_externos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "CHK_ventas_precio_final"`);
    await queryRunner.query(`ALTER TABLE "vehiculos" DROP CONSTRAINT "CHK_vehiculos_anio"`);
    await queryRunner.query(`ALTER TABLE "vehiculos" DROP CONSTRAINT "CHK_vehiculos_km"`);
    await queryRunner.query(`ALTER TABLE "vehiculos" DROP CONSTRAINT "CHK_vehiculos_precio"`);
  }
}
