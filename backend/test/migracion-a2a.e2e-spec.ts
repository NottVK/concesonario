import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { MigrationInterface } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDataSourceOptions } from '../src/database/db.config.js';

const MIGRATION_DB = 'concesionario_migracion_a2a_test';
const here = dirname(fileURLToPath(import.meta.url));
const A2A_MIGRATION = 'A2aAudit1700000000009';

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

/** Base propia y desechable: aquí se puede subir y bajar la migración 009 sin afectar a las demás pruebas. */
describe('Migración 009 (auditoría a2a): sube con datos, baja y vuelve a subir', () => {
  let ds: DataSource;
  let all: MigrationClass[];

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

  it('completa las filas a2a anteriores, acepta estados nuevos y al bajar conserva lo anterior', async () => {
    const before = all.filter((migration) => migration.name !== A2A_MIGRATION);
    expect(before.length).toBe(all.length - 1);

    // 1) Estado anterior (migración 008), con una fila a2a vieja (texto largo, sin estado) y una de mcp.
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: before });
    await ds.initialize();
    await ds.runMigrations();
    await ds.query(`INSERT INTO bots_externos (nombre, url) VALUES ('Bot Viejo', 'https://viejo.example.com/a2a')`);
    await ds.query(
      `INSERT INTO intercambios_bots (bot_id, direccion, canal, pregunta, respuesta) VALUES (1, 'saliente', 'a2a', $1, $2)`,
      ['p'.repeat(250), 'r'.repeat(700)],
    );
    await ds.query(`INSERT INTO intercambios_bots (bot_id, direccion, canal, herramienta, estado) VALUES (1, 'entrante', 'mcp', 'listar_marcas', 'ok')`);
    await ds.destroy();

    // 2) Sube: la fila a2a queda completa y válida; la de mcp no cambia.
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: all });
    await ds.initialize();
    expect((await ds.runMigrations()).map((m) => m.name)).toEqual([A2A_MIGRATION]);
    const [a2a] = await ds.query(
      `SELECT length(pregunta) AS p, length(respuesta) AS r, estado, peticion_id IS NOT NULL AS tiene_id, pregunta_hash, respuesta_hash FROM intercambios_bots WHERE canal = 'a2a'`,
    );
    expect(a2a).toMatchObject({ p: 200, r: 600, estado: 'ok', tiene_id: true });
    expect(a2a.pregunta_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a2a.respuesta_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await ds.query(`SELECT peticion_id, pregunta_hash FROM intercambios_bots WHERE canal = 'mcp'`)).toEqual([{ peticion_id: null, pregunta_hash: null }]);
    await ds.query(
      `INSERT INTO intercambios_bots (bot_id, direccion, canal, pregunta, pregunta_hash, estado, peticion_id) VALUES (1, 'saliente', 'a2a', 'hola', $1, 'bloqueado_ssrf', gen_random_uuid())`,
      ['a'.repeat(64)],
    );
    expect(await ds.query(`SELECT auth_saliente, limite_saliente_minuto FROM bots_externos`)).toEqual([{ auth_saliente: 'bearer', limite_saliente_minuto: 10 }]);

    // 3) Baja: se va la fila con el estado nuevo y los datos anteriores siguen (la fila a2a recortada y la de mcp).
    await ds.undoLastMigration();
    const states = await ds.query(`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'estado_intercambio_enum' ORDER BY enumsortorder`);
    expect(states.map((row: { enumlabel: string }) => row.enumlabel)).toEqual(['ok', 'error_validacion', 'error_interno']);
    expect(await ds.query(`SELECT canal, estado FROM intercambios_bots ORDER BY id`)).toEqual([
      { canal: 'a2a', estado: 'ok' },
      { canal: 'mcp', estado: 'ok' },
    ]);
    const columns = (await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'bots_externos'`)).map((row: { column_name: string }) => row.column_name);
    expect(columns).not.toContain('auth_saliente');

    // 4) Vuelve a subir sin problemas.
    expect((await ds.runMigrations()).map((m) => m.name)).toEqual([A2A_MIGRATION]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM intercambios_bots WHERE peticion_id IS NOT NULL`)).toEqual([{ n: 1 }]);
  });
});
