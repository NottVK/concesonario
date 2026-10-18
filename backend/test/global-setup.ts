import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { DataSourceOptions, MigrationInterface } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from '../src/database/db.config.js';
import { TEST_DB_NAME } from './setup-env.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Crea la BD de pruebas si no existe (conectando a la BD de mantenimiento `postgres`). */
async function ensureDatabase(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB_NAME,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}

/** Importa las migraciones TypeScript directamente, así no hace falta compilar antes. */
async function loadMigrations(): Promise<(new () => MigrationInterface)[]> {
  const dir = join(here, '..', 'src', 'database', 'migrations');
  const files = readdirSync(dir).filter((file) => file.endsWith('.ts')).sort();
  const modules = await Promise.all(files.map((file) => import(pathToFileURL(join(dir, file)).href)));
  return modules.flatMap((mod) => Object.values(mod) as (new () => MigrationInterface)[]);
}

export default async function setup(): Promise<void> {
  loadRootEnv();
  await ensureDatabase();
  // setup-env.ts ya fijó DB_NAME=concesionario_test; solo se cambian las migraciones.
  const options: DataSourceOptions = { ...buildDataSourceOptions(), migrations: await loadMigrations() };
  const dataSource = new DataSource(options);
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
