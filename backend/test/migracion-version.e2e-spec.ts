import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { MigrationInterface } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDataSourceOptions } from '../src/database/db.config.js';

const MIGRATION_DB = 'concesionario_migracion_test';
const here = dirname(fileURLToPath(import.meta.url));
const VERSION_MIGRATION = 'CustomerVersion1700000000004';

type MigrationClass = new () => MigrationInterface;

async function loadMigrations(): Promise<MigrationClass[]> {
  const dir = join(here, '..', 'src', 'database', 'migrations');
  const files = readdirSync(dir).filter((file) => file.endsWith('.ts')).sort();
  const modules = await Promise.all(files.map((file) => import(pathToFileURL(join(dir, file)).href)));
  return modules.flatMap((mod) => Object.values(mod) as MigrationClass[]);
}

const adminClient = (): Client =>
  new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });

/** Base propia y desechable: aquí se puede subir y bajar la migración sin afectar a las demás pruebas. */
describe('Migración de la versión del cliente (sube y baja sin perder datos)', () => {
  let ds: DataSource;
  let all: MigrationClass[];

  const columns = async (): Promise<string[]> =>
    (await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'clientes'`)).map(
      (row: { column_name: string }) => row.column_name,
    );

  beforeAll(async () => {
    all = await loadMigrations();
    const admin = adminClient();
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${MIGRATION_DB}`);
      await admin.query(`CREATE DATABASE ${MIGRATION_DB}`);
    } finally {
      await admin.end();
    }
    process.env.DB_NAME = MIGRATION_DB;
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    const admin = adminClient();
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${MIGRATION_DB}`);
    } finally {
      await admin.end();
    }
  });

  it('sobre una base con clientes: sube a versión 1, baja sin perder nada y vuelve a subir', async () => {
    const withoutVersion = all.filter((migration) => migration.name !== VERSION_MIGRATION);
    expect(withoutVersion.length).toBe(all.length - 1);

    // 1) Estado anterior a la migración, con datos.
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: withoutVersion });
    await ds.initialize();
    await ds.runMigrations();
    expect(await columns()).not.toContain('version');
    await ds.query(
      `INSERT INTO clientes (nombre, telefono, correo) VALUES ('Ana Pérez', '3001234567', 'ana@correo.co'), ('Luis Gómez', NULL, 'luis@correo.co')`,
    );
    await ds.destroy();

    // 2) Sube: los clientes existentes quedan en versión 1 con todos sus datos.
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: all });
    await ds.initialize();
    expect((await ds.runMigrations()).map((m) => m.name)).toEqual([VERSION_MIGRATION]);
    const afterUp = await ds.query(`SELECT nombre, telefono, correo, version FROM clientes ORDER BY id`);
    expect(afterUp).toEqual([
      { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.co', version: 1 },
      { nombre: 'Luis Gómez', telefono: null, correo: 'luis@correo.co', version: 1 },
    ]);

    // 3) Baja: solo desaparece la columna; los datos siguen intactos.
    await ds.undoLastMigration();
    expect(await columns()).not.toContain('version');
    const afterDown = await ds.query(`SELECT nombre, telefono, correo FROM clientes ORDER BY id`);
    expect(afterDown).toEqual([
      { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.co' },
      { nombre: 'Luis Gómez', telefono: null, correo: 'luis@correo.co' },
    ]);

    // 4) Vuelve a subir sin problemas.
    await ds.runMigrations();
    expect(await ds.query(`SELECT version FROM clientes ORDER BY id`)).toEqual([{ version: 1 }, { version: 1 }]);
  });
});
