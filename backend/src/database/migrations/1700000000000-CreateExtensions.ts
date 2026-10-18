import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExtensions1700000000000 implements MigrationInterface {
  name = 'CreateExtensions1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  public async down(): Promise<void> {
    // La extensión se deja instalada a propósito: puede ser compartida con otras bases
    // o tener objetos dependientes, y borrarla en un revert sería destructivo.
  }
}
