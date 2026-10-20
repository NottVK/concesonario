import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BotKeysService, KEY_FORMAT } from '../src/mcp/keys/bot-keys.service.js';
import { loadMcpSecrets } from '../src/mcp/mcp.config.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

interface BotRow {
  nombre: string;
  clave_prefijo: string | null;
  clave_hash: string | null;
  pepper_version: number | null;
  api_key_saliente: string | null;
  activo: boolean;
}

describe('Bots externos: keys para el MCP (admin, e2e)', () => {
  let ctx: TestContext;
  let keys: BotKeysService;
  let adminToken: string;
  let sellerToken: string;

  const create = (body: object, token = adminToken) => request(ctx.server).post('/api/admin/bots').set(auth(token)).send(body);
  const rows = async (): Promise<BotRow[]> =>
    (await ctx.dataSource.query('SELECT nombre, clave_prefijo, clave_hash, pepper_version, api_key_saliente, activo FROM bots_externos ORDER BY id')) as BotRow[];

  beforeAll(async () => {
    ctx = await createTestContext();
    keys = ctx.app.get(BotKeysService);
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE intercambios_bots, bots_externos RESTART IDENTITY CASCADE');
  });

  describe('acceso', () => {
    it('solo el admin: sin token 401, vendedor 403', async () => {
      const calls = [
        () => request(ctx.server).get('/api/admin/bots'),
        () => request(ctx.server).post('/api/admin/bots').send({ name: 'Bot Prueba' }),
        () => request(ctx.server).post('/api/admin/bots/1/rotar-clave'),
        () => request(ctx.server).patch('/api/admin/bots/1').send({ active: false }),
      ];
      for (const call of calls) {
        expect((await call()).status).toBe(401);
        expect((await call().set(auth(sellerToken))).status).toBe(403);
      }
    });
  });

  describe('crear', () => {
    it('muestra la key UNA vez, con Cache-Control no-store, y en la base solo hay su prefijo y un HMAC', async () => {
      const res = await create({ name: 'Concesionario Amigo', limitPerMinute: 12 }).expect(201);
      const apiKey = res.body.apiKey as string;
      expect(apiKey).toMatch(KEY_FORMAT);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.headers.pragma).toBe('no-cache');
      expect(res.body.bot).toMatchObject({ name: 'Concesionario Amigo', active: true, hasKey: true, hasOutboundKey: false, limitPerMinute: 12, limitPerDay: 2000 });
      expect(res.body.bot.keyPrefix).toBe(KEY_FORMAT.exec(apiKey)![1]);

      const [row] = await rows();
      expect(row!.clave_prefijo).toBe(res.body.bot.keyPrefix);
      expect(row!.clave_hash).toBe(keys.hash(apiKey));
      expect(row!.pepper_version).toBe(1);
      // Ni la key ni su parte secreta están en ninguna columna de ninguna tabla de bots.
      const everything = JSON.stringify(await ctx.dataSource.query('SELECT * FROM bots_externos'));
      expect(everything).not.toContain(apiKey);
      expect(everything).not.toContain(apiKey.slice(13));
    });

    it('la key no vuelve a aparecer: ni en el listado ni en ningún GET', async () => {
      const created = await create({ name: 'Bot Uno', outboundApiKey: 'clave-saliente-de-prueba-123' }).expect(201);
      const apiKey = created.body.apiKey as string;
      const list = await request(ctx.server).get('/api/admin/bots').set(auth(adminToken)).expect(200);
      const text = JSON.stringify(list.body);
      expect(text).not.toContain(apiKey);
      expect(text).not.toContain(apiKey.slice(13));
      expect(text).not.toContain('clave-saliente-de-prueba-123');
      expect(text).not.toMatch(/keyHash|clave_hash|apiKey|outboundApiKey"/);
      expect(list.body[0]).toMatchObject({ hasKey: true, hasOutboundKey: true });
    });

    it('la key saliente se guarda CIFRADA y se recupera solo desde el servidor', async () => {
      const created = await create({ name: 'Bot Dos', outboundApiKey: 'clave-saliente-de-prueba-123' }).expect(201);
      const [row] = await rows();
      expect(row!.api_key_saliente!.startsWith('enc:v1:')).toBe(true);
      expect(row!.api_key_saliente).not.toContain('clave-saliente');
      expect(await keys.outboundKeyOf(created.body.bot.id as number)).toBe('clave-saliente-de-prueba-123');
    });

    it('valida la entrada y rechaza nombres repetidos', async () => {
      await create({ name: 'Bot Tres' }).expect(201);
      expect((await create({ name: 'Bot Tres' })).status).toBe(409);
      const bad: object[] = [
        {}, { name: '' }, { name: 'a' }, { name: 'x'.repeat(81) }, { name: '<script>' }, { name: 'Bot Ok', url: 'no-es-url' },
        { name: 'Bot Ok', url: 'ftp://x.example' }, { name: 'Bot Ok', limitPerMinute: 0 }, { name: 'Bot Ok', limitPerMinute: 601 },
        { name: 'Bot Ok', limitPerDay: 100_001 }, { name: 'Bot Ok', outboundApiKey: 'corta' }, { name: 'Bot Ok', outboundApiKey: 'con espacios en la clave' },
        { name: 'Bot Ok', extra: 1 }, { name: 123 },
      ];
      for (const body of bad) expect((await create(body)).status, JSON.stringify(body)).toBe(400);
    });
  });

  describe('verificar una key', () => {
    it('la key correcta pasa; la falsa, la mal formada y la ausente no, por el mismo camino', async () => {
      const { body } = await create({ name: 'Bot Cuatro' }).expect(201);
      const ok = await keys.verify(body.apiKey);
      expect(ok).toMatchObject({ ok: true, bot: { id: body.bot.id, limitPerMinute: 30, limitPerDay: 2000 } });
      const prefix = body.bot.keyPrefix as string;
      const forged = `amx_${prefix}_${'A'.repeat(43)}`;
      for (const candidate of [forged, 'amx_ffffffff_' + 'B'.repeat(43), 'basura', '', undefined, null, 42, 'x'.repeat(5000), `${body.apiKey} `]) {
        expect((await keys.verify(candidate)).ok, String(candidate).slice(0, 20)).toBe(false);
      }
    });

    it('un bot desactivado falla; reactivarlo lo devuelve; el motivo solo lo conoce quien audita', async () => {
      const { body } = await create({ name: 'Bot Cinco' }).expect(201);
      await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send({ active: false }).expect(200);
      expect(await keys.verify(body.apiKey)).toMatchObject({ ok: false, reason: 'inactive', botId: body.bot.id });
      expect(await keys.verify('amx_ffffffff_' + 'B'.repeat(43))).toMatchObject({ ok: false, reason: 'invalid' });
      await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send({ active: true }).expect(200);
      expect((await keys.verify(body.apiKey)).ok).toBe(true);
    });

    it('registra el último uso (como mucho una vez por minuto)', async () => {
      const { body } = await create({ name: 'Bot Seis' }).expect(201);
      await keys.verify(body.apiKey);
      const first = (await ctx.dataSource.query('SELECT ultimo_uso_en FROM bots_externos')) as { ultimo_uso_en: Date }[];
      expect(first[0]!.ultimo_uso_en).toBeTruthy();
      await keys.verify(body.apiKey);
      const second = (await ctx.dataSource.query('SELECT ultimo_uso_en FROM bots_externos')) as { ultimo_uso_en: Date }[];
      expect(second[0]!.ultimo_uso_en.getTime()).toBe(first[0]!.ultimo_uso_en.getTime());
    });
  });

  describe('rotar', () => {
    it('la key nueva se muestra una vez (no-store) y la anterior deja de servir al instante', async () => {
      const first = await create({ name: 'Bot Siete' }).expect(201);
      const rotated = await request(ctx.server).post(`/api/admin/bots/${first.body.bot.id}/rotar-clave`).set(auth(adminToken)).expect(200);
      expect(rotated.headers['cache-control']).toMatch(/no-store/);
      expect(rotated.body.apiKey).toMatch(KEY_FORMAT);
      expect(rotated.body.apiKey).not.toBe(first.body.apiKey);
      expect((await keys.verify(first.body.apiKey)).ok).toBe(false);
      expect((await keys.verify(rotated.body.apiKey)).ok).toBe(true);
      expect(JSON.stringify(await rows())).not.toContain(rotated.body.apiKey);
    });

    it('un id inexistente da 404 y uno basura 400', async () => {
      await request(ctx.server).post('/api/admin/bots/9999/rotar-clave').set(auth(adminToken)).expect(404);
      for (const id of ['abc', '0', '-1', '1.5', '99999999999999999999']) {
        expect((await request(ctx.server).post(`/api/admin/bots/${id}/rotar-clave`).set(auth(adminToken))).status, id).toBe(400);
      }
    });
  });

  describe('editar', () => {
    it('cambia límites y valida rangos', async () => {
      const { body } = await create({ name: 'Bot Ocho' }).expect(201);
      const ok = await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send({ limitPerMinute: 99, limitPerDay: 500 }).expect(200);
      expect(ok.body).toMatchObject({ limitPerMinute: 99, limitPerDay: 500 });
      for (const bad of [{ limitPerMinute: 0 }, { limitPerMinute: 601 }, { limitPerDay: 0 }, { active: 'si' }, { url: 'nada' }, { name: 'otro' }]) {
        expect((await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send(bad)).status, JSON.stringify(bad)).toBe(400);
      }
      await request(ctx.server).patch('/api/admin/bots/9999').set(auth(adminToken)).send({ active: false }).expect(404);
    });

    it('la key saliente se puede cambiar y quitar sin que nunca salga', async () => {
      const { body } = await create({ name: 'Bot Nueve' }).expect(201);
      const set = await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send({ outboundApiKey: 'otra-clave-saliente-9999' }).expect(200);
      expect(set.body.hasOutboundKey).toBe(true);
      expect(JSON.stringify(set.body)).not.toContain('otra-clave');
      expect(await keys.outboundKeyOf(body.bot.id as number)).toBe('otra-clave-saliente-9999');
      const cleared = await request(ctx.server).patch(`/api/admin/bots/${body.bot.id}`).set(auth(adminToken)).send({ outboundApiKey: null }).expect(200);
      expect(cleared.body.hasOutboundKey).toBe(false);
    });
  });

  describe('rotación del pepper', () => {
    it('una key calculada con el pepper anterior sigue sirviendo y se recalcula con el vigente', async () => {
      const { body } = await create({ name: 'Bot Diez' }).expect(201);
      const current = loadMcpSecrets();
      const rotated = new BotKeysService(ctx.dataSource.getRepository('ExternalBot') as never, {
        ...current,
        pepper: 'nuevo-pepper-'.padEnd(40, 'n'),
        pepperVersion: 2,
        pepperPrevious: current.pepper,
      });
      const before = (await rows())[0]!.clave_hash;
      expect((await rotated.verify(body.apiKey)).ok).toBe(true);
      const after = (await rows())[0]!;
      expect(after.pepper_version).toBe(2);
      expect(after.clave_hash).not.toBe(before);
      expect(after.clave_hash).toBe(rotated.hash(body.apiKey));
      // El servicio con el pepper VIEJO ya no la acepta (su hash cambió): no sirve un hash de una versión descartada.
      expect((await keys.verify(body.apiKey)).ok).toBe(false);
      expect((await rotated.verify(body.apiKey)).ok).toBe(true);
    });

    it('sin el pepper anterior configurado, una key de la versión vieja no se acepta', async () => {
      const { body } = await create({ name: 'Bot Once' }).expect(201);
      const current = loadMcpSecrets();
      const orphan = new BotKeysService(ctx.dataSource.getRepository('ExternalBot') as never, {
        ...current,
        pepper: 'nuevo-pepper-'.padEnd(40, 'n'),
        pepperVersion: 2,
        pepperPrevious: null,
      });
      expect((await orphan.verify(body.apiKey)).ok).toBe(false);
    });
  });

  describe('arranque', () => {
    it('la API NO arranca si falta MCP_KEY_PEPPER o BOT_KEY_ENCRYPTION_KEY', async () => {
      for (const name of ['MCP_KEY_PEPPER', 'BOT_KEY_ENCRYPTION_KEY']) {
        const saved = process.env[name];
        delete process.env[name];
        try {
          await expect(createTestContext()).rejects.toThrow(new RegExp(name));
        } finally {
          process.env[name] = saved;
        }
      }
    });
  });
});
