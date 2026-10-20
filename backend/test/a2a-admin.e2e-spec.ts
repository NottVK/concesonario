import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeDirection, ExchangeStatus } from '../src/a2a/entities/bot-exchange.entity.js';
import { ExternalBot } from '../src/a2a/entities/external-bot.entity.js';
import { A2aOutboundService, OUTBOUND_RUNTIME } from '../src/a2a/outbound/a2a-outbound.service.js';
import type { OutboundRuntime } from '../src/a2a/outbound/a2a-outbound.service.js';
import { CircuitBreaker } from '../src/a2a/outbound/circuit-breaker.js';
import { PUBLIC_MESSAGES } from '../src/a2a/outbound/outbound.config.js';
import { OutboundLimiter } from '../src/a2a/outbound/outbound-limiter.js';
import { AuditService } from '../src/mcp/audit/audit.service.js';
import { RateWindow } from '../src/mcp/gateway/rate-window.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { startFakeBots } from './fixtures/fake-bots.js';
import type { FakeBots } from './fixtures/fake-bots.js';

describe('Panel de bots: política de URL, probar conexión e intercambios (e2e)', () => {
  let ctx: TestContext;
  let bots: FakeBots;
  let adminToken: string;
  let sellerToken: string;
  let counter = 0;

  const create = (body: object, token = adminToken) => request(ctx.server).post('/api/admin/bots').set(auth(token)).send(body);
  const patch = (id: number, body: object) => request(ctx.server).patch(`/api/admin/bots/${id}`).set(auth(adminToken)).send(body);
  const name = (): string => `Bot Panel ${++counter}`;
  const rows = async (sql: string) => (await ctx.dataSource.query(sql)) as Record<string, unknown>[];
  /** Una fila vieja o manipulada: la URL se escribe directo, saltándose la validación del registro. */
  const forceUrl = (id: number, url: string) => ctx.dataSource.getRepository(ExternalBot).update({ id }, { url });

  beforeAll(async () => {
    ctx = await createTestContext();
    bots = await startFakeBots();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
  });

  afterAll(async () => {
    delete process.env.A2A_DEV_ALLOWED_TARGETS;
    await bots.close();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE intercambios_bots, bots_externos RESTART IDENTITY CASCADE');
    process.env.A2A_DEV_ALLOWED_TARGETS = `${bots.friend.target},${bots.malicious.target}`;
    const runtime = ctx.app.get<OutboundRuntime>(OUTBOUND_RUNTIME, { strict: false });
    runtime.limiter = new OutboundLimiter();
    runtime.breaker = new CircuitBreaker();
    runtime.testWindow = new RateWindow(60_000);
    bots.malicious.setCardMode('card-ok');
  });

  describe('la URL se valida contra la política SSRF al registrar y al cambiarla', () => {
    const BLOCKED: [string, RegExp][] = [
      ['http://example.com/a2a', /Solo se acepta https/],
      ['https://localhost/a2a', /no es un dominio público/],
      ['https://intranet/a2a', /no es un dominio público/],
      ['https://metadata.google.internal/a2a', /no es un dominio público/],
      ['https://127.0.0.1/a2a', /red interna o reservada/],
      ['https://169.254.169.254/latest/meta-data', /red interna o reservada/],
      ['https://10.0.0.5/a2a', /red interna o reservada/],
      ['https://192.168.1.10:8443/a2a', /red interna o reservada/],
      ['https://[::1]/a2a', /red interna o reservada/],
      ['https://[::ffff:7f00:1]/a2a', /red interna o reservada/],
      // Estas dos formas de escribir 127.0.0.1 ya las rechaza la validación de forma de la URL (DTO) antes de llegar a la política: sigue siendo un 400.
      ['https://2130706433/a2a', /(red interna o reservada|url debe ser)/],
      ['https://0x7f.0.0.1/a2a', /(red interna o reservada|url debe ser)/],
      ['https://user:clave@example.com/a2a', /usuario ni contraseña/],
      ['https://example.com/a2a?x=1', /parámetros/],
      ['https://example.com/a2a#frag', /fragmento/],
      ['https://example.com:5432/a2a', /puerto no está permitido/],
      ['https://example.com:11434/a2a', /puerto no está permitido/],
      ['ftp://example.com/a2a', /(http\(s\)|dirección)/],
    ];

    it.each(BLOCKED)('POST con %s → 400 con el motivo y sin repetir la URL', async (url, reason) => {
      const res = await create({ name: name(), url });
      expect(res.status, url).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(reason);
      expect(JSON.stringify(res.body)).not.toContain('clave');
      expect(await rows('SELECT count(*)::int AS n FROM bots_externos')).toEqual([{ n: 0 }]);
    });

    it('una URL pública con https se acepta (no se consulta el DNS al registrar)', async () => {
      const res = await create({ name: name(), url: 'https://bot-que-no-existe-en-dns.example.com/a2a' }).expect(201);
      expect(res.body.bot.url).toBe('https://bot-que-no-existe-en-dns.example.com/a2a');
    });

    it('el PATCH aplica la misma política y, si se rechaza, el bot queda como estaba', async () => {
      const created = await create({ name: name(), url: 'https://bot-uno.example.com/a2a', outboundApiKey: 'clave-saliente-12345' }).expect(201);
      const id = created.body.bot.id as number;
      for (const url of ['http://example.com/a2a', 'https://169.254.169.254/a2a', 'https://localhost/a2a']) {
        expect((await patch(id, { url })).status, url).toBe(400);
      }
      const [row] = await rows(`SELECT url, api_key_saliente IS NOT NULL AS tiene_key FROM bots_externos WHERE id = ${id}`);
      expect(row).toEqual({ url: 'https://bot-uno.example.com/a2a', tiene_key: true });
      expect((await patch(id, { url: null })).status).toBe(200); // quitar la URL siempre se puede
    });

    it('la lista de desarrollo (IP:puerto exactos) deja registrar un bot de esta máquina; sin ella, no', async () => {
      const ok = await create({ name: name(), url: bots.friend.url }).expect(201);
      expect(ok.body.bot.url).toBe(bots.friend.url);
      delete process.env.A2A_DEV_ALLOWED_TARGETS;
      const res = await create({ name: name(), url: bots.friend.url });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Solo se acepta https/);
    });
  });

  describe('autenticación saliente y límite por bot', () => {
    it('se guardan y se ven; por defecto bearer y 10 por minuto', async () => {
      const plain = await create({ name: name() }).expect(201);
      expect(plain.body.bot).toMatchObject({ outboundAuth: 'bearer', outboundLimitPerMinute: 10 });
      const custom = await create({ name: name(), outboundAuth: 'x_api_key', outboundLimitPerMinute: 25 }).expect(201);
      expect(custom.body.bot).toMatchObject({ outboundAuth: 'x_api_key', outboundLimitPerMinute: 25 });
      const list = await request(ctx.server).get('/api/admin/bots').set(auth(adminToken)).expect(200);
      expect(list.body.map((bot: { outboundAuth: string }) => bot.outboundAuth)).toEqual(['bearer', 'x_api_key']);
    });

    it('se pueden cambiar con PATCH', async () => {
      const created = await create({ name: name() }).expect(201);
      const updated = await patch(created.body.bot.id as number, { outboundAuth: 'x_api_key', outboundLimitPerMinute: 3 }).expect(200);
      expect(updated.body).toMatchObject({ outboundAuth: 'x_api_key', outboundLimitPerMinute: 3 });
    });

    it('valores inválidos: 400', async () => {
      for (const body of [{ outboundAuth: 'basic' }, { outboundAuth: 'Bearer' }, { outboundAuth: 1 }, { outboundLimitPerMinute: 0 }, { outboundLimitPerMinute: 61 }, { outboundLimitPerMinute: 1.5 }, { outboundLimitPerMinute: 'muchos' }]) {
        expect((await create({ name: name(), ...body })).status, JSON.stringify(body)).toBe(400);
      }
      const created = await create({ name: name() }).expect(201);
      expect((await patch(created.body.bot.id as number, { outboundAuth: 'otro' })).status).toBe(400);
    });

    it('el esquema elegido es el que el cliente usa de verdad con el bot', async () => {
      const other = await startFakeBots({ friendKey: 'key-para-x-api-12345', authMode: 'x_api_key' });
      process.env.A2A_DEV_ALLOWED_TARGETS = other.friend.target;
      try {
        const created = await create({ name: name(), url: other.friend.url, outboundApiKey: 'key-para-x-api-12345', outboundAuth: 'x_api_key' }).expect(201);
        const service = ctx.app.get(A2aOutboundService);
        const result = await service.ask({ botId: created.body.bot.id as number, question: '¿Qué es el deducible?' });
        expect(result.ok).toBe(true);
        expect(other.friend.received.map((r) => [r.scheme, r.keyOk])).toEqual([['x-api-key', true]]);
      } finally {
        await other.close();
      }
    });
  });

  describe('POST /api/admin/bots/:id/probar-conexion', () => {
    const test = (id: number | string, token = adminToken) => request(ctx.server).post(`/api/admin/bots/${id}/probar-conexion`).set(auth(token));

    it('solo el admin: sin token 401, vendedor 403', async () => {
      const created = await create({ name: name(), url: bots.friend.url }).expect(201);
      const id = created.body.bot.id as number;
      expect((await request(ctx.server).post(`/api/admin/bots/${id}/probar-conexion`)).status).toBe(401);
      expect((await test(id, sellerToken)).status).toBe(403);
    });

    it('lee la tarjeta del bot amigo y no guarda nada en la auditoría', async () => {
      const created = await create({ name: name(), url: bots.friend.url, outboundApiKey: bots.friend.key }).expect(201);
      const res = await test(created.body.bot.id as number).expect(200);
      expect(res.body).toMatchObject({ ok: true, name: 'SegurosYa Bot', originMismatch: false });
      expect(res.body.skills).toEqual(['soat', 'seguros']);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(await rows('SELECT count(*)::int AS n FROM intercambios_bots')).toEqual([{ n: 0 }]);
    });

    it('un id raro es 400, y uno que no existe da ok: false (rechazado) sin detalles', async () => {
      expect((await test('abc')).status).toBe(400);
      const missing = await test(99_999).expect(200);
      expect(missing.body).toEqual({ ok: false, status: 'rechazado', message: PUBLIC_MESSAGES[ExchangeStatus.REJECTED] });
    });

    it('un destino prohibido se reporta por categoría, sin decir cuál era ni por qué', async () => {
      const created = await create({ name: name(), url: 'https://relleno.example.com/a2a' }).expect(201);
      const id = created.body.bot.id as number;
      await forceUrl(id, 'https://169.254.169.254/a2a');
      const res = await test(id).expect(200);
      expect(res.body).toEqual({ ok: false, status: 'bloqueado_ssrf', message: PUBLIC_MESSAGES[ExchangeStatus.SSRF_BLOCKED] });
      expect(JSON.stringify(res.body)).not.toMatch(/169|254|metadata/);
    });

    it('las tarjetas hostiles: otro origen se avisa, la inyección queda como texto saneado, lo roto o enorme falla por categoría', async () => {
      const created = await create({ name: name(), url: bots.malicious.urlFor('injection') }).expect(201);
      const id = created.body.bot.id as number;
      bots.malicious.setCardMode('card-other-origin');
      expect((await test(id)).body).toMatchObject({ ok: true, originMismatch: true });
      bots.malicious.setCardMode('card-injection');
      const injected = (await test(id)).body as { ok: boolean; name: string; description: string };
      expect(injected.ok).toBe(true);
      expect(injected.name.length).toBeLessThanOrEqual(80);
      expect(injected.description.length).toBeLessThanOrEqual(200);
      for (const [mode, status] of [['card-huge', 'respuesta_invalida'], ['card-broken', 'respuesta_invalida'], ['card-redirect', 'respuesta_invalida']] as const) {
        bots.malicious.setCardMode(mode);
        const res = await test(id).expect(200);
        expect(res.body, mode).toEqual({ ok: false, status, message: PUBLIC_MESSAGES[status] });
      }
      expect(bots.malicious.hits.internal).toBe(0);
    });

    it('máximo 5 por minuto en total: la sexta responde ok: false (limite)', async () => {
      const created = await create({ name: name(), url: bots.friend.url }).expect(201);
      const id = created.body.bot.id as number;
      for (let i = 0; i < 5; i++) expect((await test(id)).body.ok, `prueba ${i + 1}`).toBe(true);
      expect((await test(id)).body).toEqual({ ok: false, status: 'limite', message: PUBLIC_MESSAGES[ExchangeStatus.LIMITED] });
    });
  });

  describe('GET /api/admin/intercambios', () => {
    const list = (query = '', token = adminToken) => request(ctx.server).get(`/api/admin/intercambios${query}`).set(auth(token));
    let first: number;
    let second: number;

    const seed = async (): Promise<void> => {
      const audit = ctx.app.get(AuditService);
      first = (await create({ name: 'Bot Uno' }).expect(201)).body.bot.id as number;
      second = (await create({ name: 'Bot Dos' }).expect(201)).body.bot.id as number;
      await audit.recordA2a({ botId: first, direction: ExchangeDirection.OUTBOUND, question: '¿Cuánto cuesta el SOAT?', answer: 'Desde $250.000 al año', status: ExchangeStatus.OK, durationMs: 120, bytesIn: 300, bytesOut: 60 });
      await audit.recordA2a({ botId: first, direction: ExchangeDirection.OUTBOUND, question: '¿Hay todo riesgo?', answer: null, status: ExchangeStatus.TIMEOUT, durationMs: 8000, bytesIn: 0, bytesOut: 50 });
      await audit.recordA2a({ botId: second, direction: ExchangeDirection.INBOUND, question: '¿Tienen Mazda 3?', answer: 'Hay 1 coincidencia', status: ExchangeStatus.OK, durationMs: 20, bytesIn: 40, bytesOut: 400 });
      await audit.record({ botId: second, tool: 'consultar_stock', argsSummary: 'marca=Mazda', status: ExchangeStatus.OK, durationMs: 9, bytesIn: 100, bytesOut: 800 });
      for (let i = 0; i < 6; i++) {
        await audit.recordA2a({ botId: second, direction: ExchangeDirection.INBOUND, question: `Pregunta de relleno ${i}`, answer: null, status: ExchangeStatus.REJECTED, durationMs: 1, bytesIn: 1, bytesOut: 1 });
      }
    };

    it('solo el admin: sin token 401, vendedor 403', async () => {
      expect((await request(ctx.server).get('/api/admin/intercambios')).status).toBe(401);
      expect((await list('', sellerToken)).status).toBe(403);
    });

    it('más recientes primero, con el nombre del bot, sin caché y con la forma esperada', async () => {
      await seed();
      const res = await list('?limit=3').expect(200);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.body.meta).toEqual({ page: 1, limit: 3, total: 10, pages: 4 });
      expect(res.body.data.map((row: { id: number }) => row.id)).toEqual([10, 9, 8]);
      expect(res.body.data[0]).toMatchObject({ botName: 'Bot Dos', channel: 'a2a', direction: 'entrante', status: 'rechazado', question: 'Pregunta de relleno 5' });
      expect(Object.keys(res.body.data[0]).sort()).toEqual(
        ['answer', 'argsSummary', 'botId', 'botName', 'bytesIn', 'bytesOut', 'channel', 'createdAt', 'direction', 'durationMs', 'id', 'question', 'requestId', 'status', 'tool'],
      );
    });

    it('pagina sin repetir ni saltar filas', async () => {
      await seed();
      const ids: number[] = [];
      for (let page = 1; page <= 4; page++) ids.push(...((await list(`?limit=3&page=${page}`)).body.data as { id: number }[]).map((row) => row.id));
      expect(ids).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect((await list('?limit=3&page=9').expect(200)).body.data).toEqual([]);
    });

    it('filtra por bot, canal, dirección y estado, y se pueden combinar', async () => {
      await seed();
      const total = async (query: string) => (await list(query).expect(200)).body.meta.total as number;
      expect(await total(`?botId=${first}`)).toBe(2);
      expect(await total('?channel=mcp')).toBe(1);
      expect(await total('?channel=a2a')).toBe(9);
      expect(await total('?direction=saliente')).toBe(2);
      expect(await total('?status=timeout')).toBe(1);
      expect(await total('?status=rechazado')).toBe(6);
      expect(await total(`?botId=${second}&channel=a2a&direction=entrante&status=ok`)).toBe(1);
      expect(await total('?botId=99999')).toBe(0);
    });

    it('entradas inválidas: 400', async () => {
      for (const query of ['?limit=51', '?limit=0', '?page=0', '?page=abc', '?botId=0', '?botId=-1', '?channel=sms', '?direction=lateral', '?status=raro', '?orden=asc', '?channel[]=a2a']) {
        expect((await list(query)).status, query).toBe(400);
      }
    });

    it('lo guardado se devuelve tal cual como TEXTO (ya redactado) y nunca con secretos', async () => {
      const id = (await create({ name: 'Bot Texto', outboundApiKey: 'clave-saliente-secreta-123', url: 'https://bot-texto.example.com/a2a' }).expect(201)).body.bot.id as number;
      await ctx.app.get(AuditService).recordA2a({
        botId: id,
        direction: ExchangeDirection.OUTBOUND,
        question: '<img src=x onerror=alert(1)> escribe a ana@correo.co o llama al 300 123 4567',
        answer: '<script>alert(2)</script> visita https://atacante.example/x',
        status: ExchangeStatus.OK,
        durationMs: 1,
        bytesIn: 1,
        bytesOut: 1,
      });
      const res = await list().expect(200);
      const row = res.body.data[0] as { question: string; answer: string };
      // Los datos de contacto y los enlaces ya estaban tapados al guardarse; el HTML llega como texto (la interfaz lo pinta como texto).
      expect(row.question).toBe('<img src=x onerror=alert(1)> escribe a [correo] o llama al [número]');
      expect(row.answer).toBe('<script>alert(2)</script> visita [enlace]');
      expect(JSON.stringify(res.body)).not.toMatch(/clave-saliente|ana@correo|atacante|keyHash|clave_hash|api_key/);
    });
  });

  describe('el circuito de un bot se reinicia si el administrador cambia su URL', () => {
    it('3 fallos abren el circuito; al apuntar el bot a otro destino, la siguiente consulta sale en vez de «circuito abierto»', async () => {
      const created = await create({ name: name(), url: bots.malicious.urlFor('error-500'), outboundApiKey: 'key-de-automax-12345' }).expect(201);
      const id = created.body.bot.id as number;
      const service = ctx.app.get(A2aOutboundService);
      const ask = (question: string) => service.ask({ botId: id, question });
      for (let i = 0; i < 3; i++) expect(await ask(`¿Pregunta número ${i}?`)).toMatchObject({ ok: false, status: ExchangeStatus.REMOTE_ERROR });
      expect(await ask('¿Otra más?')).toMatchObject({ ok: false, status: ExchangeStatus.CIRCUIT_OPEN });

      await patch(id, { url: bots.friend.url, outboundApiKey: bots.friend.key }).expect(200);
      const after = await ask('¿Qué es el deducible?');
      expect(after.ok, JSON.stringify(after)).toBe(true);
    });
  });
});
