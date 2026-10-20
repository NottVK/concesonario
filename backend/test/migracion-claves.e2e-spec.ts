import { createCipheriv, randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { MigrationInterface } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExternalBot } from '../src/a2a/entities/external-bot.entity.js';
import { buildDataSourceOptions } from '../src/database/db.config.js';
import { BotKeysService } from '../src/mcp/keys/bot-keys.service.js';
import { SecretBox } from '../src/mcp/keys/secret-box.js';
import { loadMcpSecrets } from '../src/mcp/mcp.config.js';

const MIGRATION_DB = 'concesionario_migracion_claves_test';
const here = dirname(fileURLToPath(import.meta.url));

type MigrationClass = new () => MigrationInterface;

const timestampOf = (migration: MigrationClass): number => Number(/(\d{13})$/.exec(migration.name)![1]);

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

/** Un valor `enc:v1` como lo escribía la Fase 5 (sin AAD), con la clave de PRUEBAS. */
function legacyV1(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', loadMcpSecrets().encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
}

/** Base propia y desechable: aquí se suben y bajan las migraciones 008 y 009 con keys reales de por medio. */
describe('Migraciones de las keys de bots: api_key → api_key_saliente (008) y enc:v1 → enc:v2 (009)', () => {
  let ds: DataSource;
  let all: MigrationClass[];

  const sql = async (query: string, params: unknown[] = []) => (await ds.query(query, params)) as Record<string, unknown>[];
  const columns = async (): Promise<string[]> =>
    (await sql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'bots_externos'`)).map((row) => row.column_name as string);
  const stored = async (): Promise<Record<string, string | null>> =>
    Object.fromEntries((await sql('SELECT nombre, api_key_saliente AS k FROM bots_externos ORDER BY id')).map((row) => [row.nombre as string, row.k as string | null]));

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

  it('008: con un api_key en texto plano NO migra (no lo cifra ni lo borra en silencio); sin él, conserva el resto de la fila', async () => {
    // Estado de la Fase 4: migraciones 000 a 007, con dos bots, uno de ellos con una key en texto plano.
    const upTo7 = all.filter((migration) => timestampOf(migration) <= 1700000000007);
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: upTo7 });
    await ds.initialize();
    await ds.runMigrations();
    await sql(`INSERT INTO bots_externos (nombre, url, api_key, activo) VALUES ('Bot Sin Key', 'https://sin-key.example.com/a2a', NULL, true), ('Bot Con Key', 'https://con-key.example.com/a2a', 'clave-en-texto-plano', false)`);
    await ds.destroy();

    // 008 se niega, y como corre en una transacción no queda nada a medias: la columna y el valor siguen donde estaban.
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: all.filter((migration) => timestampOf(migration) <= 1700000000008) });
    await ds.initialize();
    await expect(ds.runMigrations()).rejects.toThrow(/texto plano/);
    expect(await columns()).toContain('api_key');
    expect(await columns()).not.toContain('api_key_saliente');
    expect(await sql(`SELECT api_key FROM bots_externos WHERE nombre = 'Bot Con Key'`)).toEqual([{ api_key: 'clave-en-texto-plano' }]);
    expect(await sql(`SELECT count(*)::int AS n FROM migrations WHERE name LIKE 'BotKeysAndAudit%'`)).toEqual([{ n: 0 }]);

    // Siguiendo el mensaje (borrarla a mano), la migración corre y la fila conserva todo lo demás.
    await sql(`UPDATE bots_externos SET api_key = NULL WHERE nombre = 'Bot Con Key'`);
    await ds.runMigrations();
    expect(await columns()).toContain('api_key_saliente');
    expect(await columns()).not.toContain('api_key');
    expect(await sql('SELECT nombre, url, activo, api_key_saliente FROM bots_externos ORDER BY id')).toEqual([
      { nombre: 'Bot Sin Key', url: 'https://sin-key.example.com/a2a', activo: true, api_key_saliente: null },
      { nombre: 'Bot Con Key', url: 'https://con-key.example.com/a2a', activo: false, api_key_saliente: null },
    ]);
  });

  it('008 down: devuelve la columna api_key, y las keys cifradas se descartan (no pueden volver a texto plano)', async () => {
    await sql(`UPDATE bots_externos SET api_key_saliente = $1 WHERE nombre = 'Bot Sin Key'`, [legacyV1('clave-que-se-pierde')]);
    await ds.undoLastMigration(); // 008
    expect(await columns()).toContain('api_key');
    expect(await sql('SELECT nombre, url, api_key FROM bots_externos ORDER BY id')).toEqual([
      { nombre: 'Bot Sin Key', url: 'https://sin-key.example.com/a2a', api_key: null },
      { nombre: 'Bot Con Key', url: 'https://con-key.example.com/a2a', api_key: null },
    ]);
    await ds.runMigrations(); // 008 de nuevo
  });

  it('009: varias keys enc:v1 pasan a enc:v2 y TODAS descifran; la de un bot sin url sigue legible como v1', async () => {
    await ds.destroy();
    ds = new DataSource({ ...buildDataSourceOptions(), migrations: all });
    await ds.initialize();
    await ds.runMigrations(); // 009
    expect(await columns()).toContain('auth_saliente');

    const origins = ['https://a.example.com/a2a', 'https://b.example.com:8443/a2a', 'http://127.0.0.1:8100/a2a', 'https://c.example.com/x/y'];
    for (const [index, url] of origins.entries()) {
      await sql(`INSERT INTO bots_externos (nombre, url, api_key_saliente) VALUES ($1, $2, $3)`, [`Bot V1 ${index}`, url, legacyV1(`secreto-${index}`)]);
    }
    await sql(`INSERT INTO bots_externos (nombre, url, api_key_saliente) VALUES ('Bot V1 Sin Url', NULL, $1)`, [legacyV1('secreto-sin-url')]);
    await sql(`INSERT INTO bots_externos (nombre, url, api_key_saliente) VALUES ('Bot Sin Key Alguna', 'https://d.example.com/a2a', NULL)`);

    const keys = new BotKeysService(ds.getRepository(ExternalBot), loadMcpSecrets());
    expect(await keys.upgradeLegacyKeys()).toBe(4);

    const after = await stored();
    for (let index = 0; index < origins.length; index++) expect(SecretBox.versionOf(after[`Bot V1 ${index}`]!), `v2 #${index}`).toBe(2);
    expect(SecretBox.versionOf(after['Bot V1 Sin Url']!)).toBe(1);
    expect(after['Bot Sin Key Alguna']).toBeNull();

    // Todas descifran por el camino real del servidor.
    const ids = Object.fromEntries((await sql('SELECT id, nombre FROM bots_externos')).map((row) => [row.nombre as string, row.id as number]));
    for (let index = 0; index < origins.length; index++) expect(await keys.outboundKeyOf(ids[`Bot V1 ${index}`]!), `bot ${index}`).toBe(`secreto-${index}`);
    expect(await keys.outboundKeyOf(ids['Bot V1 Sin Url']!)).toBe('secreto-sin-url');
    expect(await keys.outboundKeyOf(ids['Bot Sin Key Alguna']!)).toBeNull();
    // Y una segunda pasada no toca nada.
    expect(await keys.upgradeLegacyKeys()).toBe(0);
  });

  it('009 down: no deja ninguna key que el código anterior no pueda leer (descarta las v2, conserva las v1)', async () => {
    const before = await stored();
    expect(Object.values(before).some((value) => value?.startsWith('enc:v2:'))).toBe(true);

    await ds.undoLastMigration(); // 009
    expect(await columns()).not.toContain('auth_saliente');
    const after = await stored();
    const box = new SecretBox(loadMcpSecrets().encryptionKey);
    for (const [name, value] of Object.entries(after)) {
      if (value === null) continue;
      expect(value.startsWith('enc:v1:'), name).toBe(true);
      expect(() => box.decrypt(value, ''), name).not.toThrow(); // legible sin AAD, como lo lee el código anterior
    }
    expect(after['Bot V1 Sin Url']).toBe(before['Bot V1 Sin Url']); // la v1 que no se migró queda intacta
    for (let index = 0; index < 4; index++) expect(after[`Bot V1 ${index}`]).toBeNull();

    // Y volver a subir deja la base utilizable.
    await ds.runMigrations();
    expect(await columns()).toContain('auth_saliente');
  });
});
