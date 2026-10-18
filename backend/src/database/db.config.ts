import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { entities } from './entities.js';

/** Carga el .env de la raíz del repo cuando se corre fuera de Nest (CLI, seeds). */
export function loadRootEnv(): void {
  for (const path of ['.env', '../.env']) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env`);
  }
  return value;
}

/** Opciones de conexión compartidas por la app, el CLI de migraciones y los seeds. */
export function buildDataSourceOptions(): DataSourceOptions {
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
    entities,
    migrations: [join(here, 'migrations', '*.js')],
    synchronize: false,
  };
}
