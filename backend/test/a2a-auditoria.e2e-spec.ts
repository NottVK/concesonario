import { createCipheriv, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeDirection, ExchangeStatus } from '../src/a2a/entities/bot-exchange.entity.js';
import { AuditService } from '../src/mcp/audit/audit.service.js';
import { purgeBotAudit } from '../src/mcp/audit/purge.js';
import { BotKeysService } from '../src/mcp/keys/bot-keys.service.js';
import { SecretBox } from '../src/mcp/keys/secret-box.js';
import { loadMcpSecrets } from '../src/mcp/mcp.config.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

const URL_A = 'https://bot-a.example.com/a2a';

describe('Fase 6.2: auditoría a2a y key saliente enc:v2 (e2e)', () => {
  let ctx: TestContext;
  let audit: AuditService;
  let keys: BotKeysService;
  let adminToken: string;

  const createBot = async (name: string, extra: object = {}): Promise<number> => {
    const res = await request(ctx.server).post('/api/admin/bots').set(auth(adminToken)).send({ name, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.bot.id as number;
  };
  const patch = (id: number, body: object) => request(ctx.server).patch(`/api/admin/bots/${id}`).set(auth(adminToken)).send(body);
  const sql = async (query: string, params: unknown[] = []) => (await ctx.dataSource.query(query, params)) as Record<string, unknown>[];
  const storedKey = async (id: number): Promise<string | null> =>
    ((await sql('SELECT api_key_saliente FROM bots_externos WHERE id = $1', [id]))[0]!.api_key_saliente as string | null);

  /** Una fila a2a válida por SQL (para probar los CHECK y la retención con fechas a medida). */
  const insertA2a = (botId: number, overrides: Record<string, unknown> = {}) => {
    const row = {
      bot_id: botId, direccion: 'saliente', canal: 'a2a', pregunta: 'hola', pregunta_hash: 'a'.repeat(64), respuesta: null, respuesta_hash: null,
      estado: 'ok', peticion_id: '11111111-1111-4111-8111-111111111111', herramienta: null, args_resumen: null, creado_en: new Date(), ...overrides,
    };
    const columns = Object.keys(row);
    return sql(`INSERT INTO intercambios_bots (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row));
  };
  const insertMcp = (botId: number, overrides: Record<string, unknown> = {}) => {
    const row = { bot_id: botId, direccion: 'entrante', canal: 'mcp', herramienta: 'listar_marcas', estado: 'ok', creado_en: new Date(), ...overrides };
    const columns = Object.keys(row);
    return sql(`INSERT INTO intercambios_bots (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row));
  };
  const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 3600 * 1000);

  beforeAll(async () => {
    ctx = await createTestContext();
    audit = ctx.app.get(AuditService);
    keys = ctx.app.get(BotKeysService);
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE intercambios_bots, bots_externos RESTART IDENTITY CASCADE');
  });

  describe('restricciones de la base (migración 009)', () => {
    it('acepta una fila a2a válida y los estados nuevos', async () => {
      const id = await createBot('Bot Estados');
      for (const estado of ['ok', 'rechazado', 'timeout', 'error_remoto', 'bloqueado_ssrf', 'respuesta_invalida', 'circuito_abierto', 'limite']) {
        await insertA2a(id, { estado });
      }
      expect(await sql('SELECT count(*)::int AS n FROM intercambios_bots')).toEqual([{ n: 8 }]);
    });

    it('rechaza filas a2a mal formadas', async () => {
      const id = await createBot('Bot Checks');
      const bad: Record<string, unknown>[] = [
        { estado: null },
        { pregunta: null },
        { pregunta: 'x'.repeat(201) },
        { pregunta_hash: null },
        { peticion_id: null },
        { respuesta: 'texto', respuesta_hash: null },
        { respuesta: null, respuesta_hash: 'b'.repeat(64) },
        { respuesta: 'x'.repeat(601), respuesta_hash: 'b'.repeat(64) },
        { herramienta: 'consultar_stock' },
        { args_resumen: 'marca=Mazda' },
      ];
      for (const overrides of bad) await expect(insertA2a(id, overrides), JSON.stringify(overrides)).rejects.toThrow(/CHK_intercambios_canal|null value/);
      await insertA2a(id, { respuesta: 'x'.repeat(600), respuesta_hash: 'b'.repeat(64), pregunta: 'y'.repeat(200) });
    });

    it('una fila mcp sigue sin texto libre ni campos de a2a', async () => {
      const id = await createBot('Bot Mcp');
      await insertMcp(id);
      for (const overrides of [{ pregunta: 'hola' }, { respuesta: 'hola' }, { peticion_id: '11111111-1111-4111-8111-111111111111' }, { pregunta_hash: 'a'.repeat(64) }, { estado: null }, { herramienta: null }]) {
        await expect(insertMcp(id, overrides), JSON.stringify(overrides)).rejects.toThrow(/CHK_intercambios_canal|null value/);
      }
    });

    it('los bots guardan cómo autenticar la salida y su límite, con valores acotados', async () => {
      const id = await createBot('Bot Salida');
      expect(await sql('SELECT auth_saliente, limite_saliente_minuto FROM bots_externos WHERE id = $1', [id])).toEqual([{ auth_saliente: 'bearer', limite_saliente_minuto: 10 }]);
      await expect(sql(`UPDATE bots_externos SET auth_saliente = 'basic' WHERE id = $1`, [id])).rejects.toThrow(/CHK_bots_auth_saliente/);
      await expect(sql('UPDATE bots_externos SET limite_saliente_minuto = 0 WHERE id = $1', [id])).rejects.toThrow(/CHK_bots_limite_saliente/);
      await expect(sql('UPDATE bots_externos SET limite_saliente_minuto = 61 WHERE id = $1', [id])).rejects.toThrow(/CHK_bots_limite_saliente/);
    });
  });

  describe('AuditService.recordA2a', () => {
    it('guarda pregunta y respuesta redactadas y recortadas, con hashes y peticion_id', async () => {
      const id = await createBot('Bot Auditado');
      const requestId = await audit.recordA2a({
        botId: id,
        direction: ExchangeDirection.OUTBOUND,
        question: `¿Tienen seguro? Escribe a ana@correo.com o llama al 300 123 4567 ${'z'.repeat(300)}`,
        answer: `Visita https://phishing.example/x ${'r'.repeat(900)}`,
        status: ExchangeStatus.OK,
        durationMs: 120.4,
        bytesIn: 900,
        bytesOut: 150,
      });
      const [row] = await sql('SELECT * FROM intercambios_bots');
      expect(row!.peticion_id).toBe(requestId);
      expect(row!.canal).toBe('a2a');
      expect(row!.direccion).toBe('saliente');
      expect(row!.pregunta).toMatch(/^¿Tienen seguro\? Escribe a \[correo\] o llama al \[número\] z+$/);
      expect((row!.pregunta as string).length).toBe(200);
      expect(row!.respuesta).toMatch(/^Visita \[enlace\] r+$/);
      expect((row!.respuesta as string).length).toBe(600);
      expect(row!.pregunta_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.respuesta_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.duracion_ms).toBe(120);
      expect(JSON.stringify(row)).not.toMatch(/ana@correo|300 123|phishing\.example/);
    });

    it('una respuesta ausente deja respuesta y hash en null', async () => {
      const id = await createBot('Bot Caido');
      await audit.recordA2a({ botId: id, direction: ExchangeDirection.OUTBOUND, question: '¿Hay Mazda 3?', answer: null, status: ExchangeStatus.TIMEOUT, durationMs: 8000, bytesIn: 0, bytesOut: 40 });
      const [row] = await sql('SELECT respuesta, respuesta_hash, estado FROM intercambios_bots');
      expect(row).toEqual({ respuesta: null, respuesta_hash: null, estado: 'timeout' });
    });

    it('una pregunta que queda vacía tras redactar también se guarda (cumple el CHECK)', async () => {
      const id = await createBot('Bot Vacio');
      await audit.recordA2a({ botId: id, direction: ExchangeDirection.INBOUND, question: '\u0000​', answer: null, status: ExchangeStatus.REJECTED, durationMs: 1, bytesIn: 2, bytesOut: 0 });
      expect((await sql('SELECT pregunta FROM intercambios_bots'))[0]!.pregunta).toBe('');
    });
  });

  describe('cuota diaria compartida (decisión 109)', () => {
    it('suma las llamadas ENTRANTES de mcp y a2a y no cuenta las salientes ni las de otro bot ni las de hace más de un día', async () => {
      const a = await createBot('Bot Cuota A');
      const b = await createBot('Bot Cuota B');
      await insertMcp(a);
      await insertMcp(a);
      await insertA2a(a, { direccion: 'entrante' });
      await insertA2a(a, { direccion: 'saliente' });
      await insertMcp(a, { creado_en: daysAgo(2) });
      await insertA2a(a, { direccion: 'entrante', creado_en: daysAgo(2) });
      await insertMcp(b);
      expect(await audit.callsInLastDay(a)).toBe(3);
      expect(await audit.callsInLastDay(b)).toBe(1);
    });
  });

  describe('retención', () => {
    it('a2a se borra a los 30 días y mcp a los 90', async () => {
      const id = await createBot('Bot Purga');
      await insertA2a(id, { creado_en: daysAgo(29) }); // se queda
      await insertA2a(id, { creado_en: daysAgo(31) }); // se va
      await insertMcp(id, { creado_en: daysAgo(31) }); // se queda
      await insertMcp(id, { creado_en: daysAgo(89) }); // se queda
      await insertMcp(id, { creado_en: daysAgo(91) }); // se va
      expect(await purgeBotAudit(ctx.dataSource)).toBe(2);
      expect(await sql(`SELECT canal, count(*)::int AS n FROM intercambios_bots GROUP BY canal ORDER BY canal`)).toEqual([
        { canal: 'a2a', n: 1 },
        { canal: 'mcp', n: 2 },
      ]);
    });
  });

  describe('key saliente enc:v2 con AAD', () => {
    it('se guarda como enc:v2 y se recupera; sin url no se puede guardar', async () => {
      const id = await createBot('Bot V2', { url: URL_A, outboundApiKey: 'clave-saliente-001' });
      expect((await storedKey(id))!.startsWith('enc:v2:')).toBe(true);
      expect(await keys.outboundKeyOf(id)).toBe('clave-saliente-001');
      const noUrl = await request(ctx.server).post('/api/admin/bots').set(auth(adminToken)).send({ name: 'Bot Sin Url', outboundApiKey: 'clave-saliente-002' });
      expect(noUrl.status).toBe(400);
      const bare = await createBot('Bot Pelado');
      expect((await patch(bare, { outboundApiKey: 'clave-saliente-003' })).status).toBe(400);
      expect(await storedKey(bare)).toBeNull();
    });

    it('una key copiada a OTRA fila no descifra', async () => {
      const a = await createBot('Bot Fila A', { url: URL_A, outboundApiKey: 'clave-saliente-004' });
      const b = await createBot('Bot Fila B', { url: URL_A });
      await sql('UPDATE bots_externos SET api_key_saliente = $1 WHERE id = $2', [await storedKey(a), b]);
      await expect(keys.outboundKeyOf(b)).rejects.toThrow('No se pudo descifrar la clave guardada');
      expect(await keys.outboundKeyOf(a)).toBe('clave-saliente-004');
    });

    it('una key en una fila cuya URL cambió por SQL (otro origen) no descifra', async () => {
      const id = await createBot('Bot Url SQL', { url: URL_A, outboundApiKey: 'clave-saliente-005' });
      await sql('UPDATE bots_externos SET url = $1 WHERE id = $2', ['https://atacante.example.net/a2a', id]);
      await expect(keys.outboundKeyOf(id)).rejects.toThrow('No se pudo descifrar la clave guardada');
    });

    it('cambiar el ORIGEN de la url sin key nueva borra la key; cambiar solo la ruta la conserva', async () => {
      const id = await createBot('Bot Mueve', { url: URL_A, outboundApiKey: 'clave-saliente-006' });
      const sameOrigin = await patch(id, { url: 'https://bot-a.example.com/otra/ruta' }).expect(200);
      expect(sameOrigin.body.hasOutboundKey).toBe(true);
      expect(await keys.outboundKeyOf(id)).toBe('clave-saliente-006');
      const moved = await patch(id, { url: 'https://bot-b.example.com/a2a' }).expect(200);
      expect(moved.body.hasOutboundKey).toBe(false);
      expect(await storedKey(id)).toBeNull();
      for (const other of ['http://bot-b.example.com/a2a', 'https://bot-b.example.com:8443/a2a']) {
        await patch(id, { outboundApiKey: 'clave-saliente-007' }).expect(200);
        const res = await patch(id, { url: other }).expect(200);
        expect(res.body.hasOutboundKey, other).toBe(false);
      }
    });

    it('cambiar el origen CON una key nueva la deja atada al origen nuevo', async () => {
      const id = await createBot('Bot Mueve Con Key', { url: URL_A, outboundApiKey: 'clave-saliente-008' });
      await patch(id, { url: 'https://bot-c.example.com/a2a', outboundApiKey: 'clave-saliente-009' }).expect(200);
      expect(await keys.outboundKeyOf(id)).toBe('clave-saliente-009');
    });

    it('quitar la url de un bot con key borra la key', async () => {
      const id = await createBot('Bot Sin Destino', { url: URL_A, outboundApiKey: 'clave-saliente-010' });
      const res = await patch(id, { url: null }).expect(200);
      expect(res.body.hasOutboundKey).toBe(false);
    });

    describe('migración de enc:v1', () => {
      const legacy = (plain: string): string => {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', loadMcpSecrets().encryptionKey, iv);
        const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
      };

      it('upgradeLegacyKeys re-cifra las v1 con url y deja quietas las demás', async () => {
        const withUrl = await createBot('Bot Vieja', { url: URL_A });
        const withoutUrl = await createBot('Bot Vieja Sin Url');
        const current = await createBot('Bot Nueva', { url: URL_A, outboundApiKey: 'clave-saliente-011' });
        const v1 = legacy('clave-vieja-001');
        await sql('UPDATE bots_externos SET api_key_saliente = $1 WHERE id = $2', [v1, withUrl]);
        await sql('UPDATE bots_externos SET api_key_saliente = $1 WHERE id = $2', [legacy('clave-vieja-002'), withoutUrl]);
        const before = await storedKey(current);

        expect(await keys.upgradeLegacyKeys()).toBe(1);
        expect((await storedKey(withUrl))!.startsWith('enc:v2:')).toBe(true);
        expect(await keys.outboundKeyOf(withUrl)).toBe('clave-vieja-001');
        expect((await storedKey(withoutUrl))!.startsWith('enc:v1:')).toBe(true);
        expect(await storedKey(current)).toBe(before);
        expect(await keys.upgradeLegacyKeys()).toBe(0);
      });

      it('leer una v1 con outboundKeyOf la devuelve y la migra', async () => {
        const id = await createBot('Bot Lazy', { url: URL_A });
        await sql('UPDATE bots_externos SET api_key_saliente = $1 WHERE id = $2', [legacy('clave-vieja-003'), id]);
        expect(await keys.outboundKeyOf(id)).toBe('clave-vieja-003');
        expect(SecretBox.versionOf((await storedKey(id))!)).toBe(2);
        expect(await keys.outboundKeyOf(id)).toBe('clave-vieja-003');
      });
    });
  });
});
