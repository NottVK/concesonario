import { Logger } from '@nestjs/common';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExchangeStatus } from '../src/a2a/entities/bot-exchange.entity.js';
import { AuditService } from '../src/mcp/audit/audit.service.js';
import { purgeBotAudit } from '../src/mcp/audit/purge.js';
import { BotKeysService } from '../src/mcp/keys/bot-keys.service.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

interface Created {
  id: number;
  apiKey: string;
  prefix: string;
}

describe('Puerta de entrada del MCP (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;

  const createBot = async (name: string, extra: object = {}): Promise<Created> => {
    const res = await request(ctx.server).post('/api/admin/bots').set(auth(adminToken)).send({ name, ...extra }).expect(201);
    return { id: res.body.bot.id as number, apiKey: res.body.apiKey as string, prefix: res.body.bot.keyPrefix as string };
  };
  const call = (key?: string | null, headers: Record<string, string> = {}, body: object | string = { jsonrpc: '2.0', id: 7, method: 'tools/list' }) => {
    const req = request(ctx.server).post('/api/mcp').set(headers);
    if (key !== null && key !== undefined) req.set('Authorization', key);
    if (typeof body === 'string') return req.set('Content-Type', 'application/json').send(body);
    return req.send(body);
  };
  const rows = async (sql: string) => (await ctx.dataSource.query(sql)) as Record<string, unknown>[];

  beforeEach(async () => {
    // Una app nueva por prueba: el bloqueo por IP y las cuotas viven en memoria.
    ctx = await createTestContext({ listen: true });
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.app.close();
  });

  describe('autenticación: todos los fallos son IGUALES (byte a byte)', () => {
    it('key ausente, mal formada, falsa, de prefijo inexistente, de bot desactivado o rotada dan la misma respuesta', async () => {
      const bot = await createBot('Bot Respuesta');
      const disabled = await createBot('Bot Apagado');
      await request(ctx.server).patch(`/api/admin/bots/${disabled.id}`).set(auth(adminToken)).send({ active: false }).expect(200);
      const rotating = await createBot('Bot Rotado');
      await request(ctx.server).post(`/api/admin/bots/${rotating.id}/rotar-clave`).set(auth(adminToken)).expect(200);

      const attempts: [string, string | null][] = [
        ['sin cabecera', null],
        ['solo Bearer', 'Bearer'],
        ['basura', 'Bearer basura'],
        ['esquema distinto', `Basic ${bot.apiKey}`],
        ['prefijo válido, secreto falso', `Bearer amx_${bot.prefix}_${'A'.repeat(43)}`],
        ['prefijo inexistente', `Bearer amx_ffffffff_${'B'.repeat(43)}`],
        ['bot desactivado (key correcta)', `Bearer ${disabled.apiKey}`],
        ['key anterior a la rotación', `Bearer ${rotating.apiKey}`],
        ['key larguísima', `Bearer ${'x'.repeat(190)}`],
      ];
      // Se comparan todas las cabeceras salvo la fecha y los contadores del límite global (cuentan peticiones, no keys).
      const comparable = (headers: Record<string, string>): Record<string, string> =>
        Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'date' && !name.startsWith('x-ratelimit') && name !== 'retry-after'));
      const seen: { label: string; status: number; text: string; headers: Record<string, string> }[] = [];
      for (const [label, header] of attempts) {
        const res = await call(header);
        seen.push({ label, status: res.status, text: res.text, headers: comparable(res.headers as Record<string, string>) });
      }
      const first = seen[0]!;
      expect(first.status).toBe(401);
      expect(first.text).toBe('{"statusCode":401,"message":"Credenciales no válidas"}');
      expect(first.headers['www-authenticate']).toBe('Bearer realm="automax-mcp"');
      expect(first.headers['cache-control']).toBe('no-store');
      for (const other of seen) {
        expect(other.status, other.label).toBe(first.status);
        expect(other.text, other.label).toBe(first.text);
        expect(other.headers, other.label).toEqual(first.headers);
      }
      // Y ninguna respuesta repite lo que mandó el cliente ni el `id` de la petición JSON-RPC.
      for (const item of seen) expect(item.text).not.toMatch(/basura|amx_|"id"/);
    });

    it('la key correcta pasa la puerta y el servidor MCP responde, sin WWW-Authenticate', async () => {
      const bot = await createBot('Bot Bueno');
      const res = await call(`Bearer ${bot.apiKey}`);
      expect(res.status).toBe(200);
      expect(res.headers['www-authenticate']).toBeUndefined();
      expect(await rows('SELECT count(*)::int AS n FROM bots_externos WHERE ultimo_uso_en IS NOT NULL')).toEqual([{ n: 1 }]);
    });

    it('desactivar surte efecto en la siguiente llamada, y reactivar lo devuelve', async () => {
      const bot = await createBot('Bot Interruptor');
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(200);
      await request(ctx.server).patch(`/api/admin/bots/${bot.id}`).set(auth(adminToken)).send({ active: false }).expect(200);
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(401);
      await request(ctx.server).patch(`/api/admin/bots/${bot.id}`).set(auth(adminToken)).send({ active: true }).expect(200);
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(200);
    });

    it('los fallos de autenticación NO crean filas de auditoría (no hay bot al que atribuirlas)', async () => {
      for (let i = 0; i < 3; i++) await call('Bearer basura');
      expect(await rows('SELECT count(*)::int AS n FROM intercambios_bots')).toEqual([{ n: 0 }]);
    });
  });

  describe('la key nunca se registra', () => {
    it('ni en los logs de un fallo ni en los de un acierto', async () => {
      const lines: string[] = [];
      for (const level of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
        vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          lines.push(args.map((a) => String(a)).join(' '));
        });
      }
      const bot = await createBot('Bot Silencioso');
      const secret = bot.apiKey.slice(13);
      const wrongSecret = `amx_${bot.prefix}_${'Z'.repeat(43)}`;
      await call(`Bearer ${wrongSecret}`);
      await call(`Bearer ${bot.apiKey}`);
      await call(`Bearer ${bot.apiKey}x`);
      const everything = lines.join('\n');
      expect(everything).toMatch(/Autenticación MCP fallida/);
      expect(everything).toContain(`prefijo=${bot.prefix}`);
      for (const forbidden of [bot.apiKey, secret, wrongSecret, 'Z'.repeat(43), BotKeysService.prototype.hash.name === 'hash' ? 'Bearer ' : 'Bearer ']) {
        expect(everything, forbidden).not.toContain(forbidden);
      }
    });
  });

  describe('filtros previos a la autenticación', () => {
    it('Origin presente, Host ajeno y tipo de contenido que no es JSON se rechazan', async () => {
      const bot = await createBot('Bot Filtros');
      const key = `Bearer ${bot.apiKey}`;
      expect((await call(key, { Origin: 'https://evil.example' })).status).toBe(403);
      expect((await call(key, { Host: 'evil.example' })).status).toBe(403);
      expect((await call(key, { Host: 'evil.example:8000' })).status).toBe(403);
      const text = await request(ctx.server).post('/api/mcp').set('Authorization', key).set('Content-Type', 'text/plain').send('hola');
      expect(text.status).toBe(415);
      const none = await request(ctx.server).post('/api/mcp').set('Authorization', key);
      expect(none.status).toBe(415);
      expect((await call(key)).status).toBe(200); // y sin esos defectos, pasa
    });

    it('un cuerpo anunciado de más de 16 KB da 413 ANTES de mirar la key (con key falsa también) y no cuenta como fallo', async () => {
      const bot = await createBot('Bot Grande');
      const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { pad: 'x'.repeat(16_384) } });
      expect(big.length).toBeGreaterThan(16_384);
      expect((await call('Bearer basura', {}, big)).status).toBe(413);
      expect((await call(`Bearer ${bot.apiKey}`, {}, big)).status).toBe(413);
      for (let i = 0; i < 12; i++) await call(null, {}, big); // no es un fallo de autenticación: no bloquea la IP
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(200);
      const exact = '{"a":"' + 'x'.repeat(16_384 - 8) + '"}';
      expect(exact.length).toBe(16_384);
      // Exactamente 16 KB entra (no es un JSON-RPC válido, así que el servidor responde 400, no 413).
      expect((await call(`Bearer ${bot.apiKey}`, {}, exact)).status).toBe(400);
    });

    it('GET, DELETE, PUT y PATCH responden 405 con Allow: POST, sin pedir key', async () => {
      for (const method of ['get', 'delete', 'put', 'patch'] as const) {
        const res = await request(ctx.server)[method]('/api/mcp');
        expect(res.status, method).toBe(405);
        expect(res.headers.allow).toBe('POST');
      }
      expect((await request(ctx.server).get('/api/mcp/otra-cosa')).status).toBe(405);
    });
  });

  describe('límites', () => {
    it('10 fallos de autenticación bloquean la IP: el siguiente da 429 aunque la key sea buena', async () => {
      const bot = await createBot('Bot Bloqueado');
      for (let i = 0; i < 10; i++) expect((await call('Bearer basura')).status).toBe(401);
      const locked = await call(`Bearer ${bot.apiKey}`);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);
      expect(locked.text).toBe('{"statusCode":429,"message":"Demasiadas peticiones"}');
    });

    it('límite por IP antes de autenticar: la petición 61 en un minuto recibe 429', async () => {
      const bot = await createBot('Bot Veloz', { limitPerMinute: 600 });
      const statuses: number[] = [];
      for (let i = 0; i < 61; i++) statuses.push((await call(`Bearer ${bot.apiKey}`)).status);
      expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
      expect(statuses[60]).toBe(429);
    });

    it('límite propio de cada bot por minuto: el 4.º de un bot de 3 recibe 429 con Retry-After y otro bot no se ve afectado', async () => {
      const limited = await createBot('Bot Limitado', { limitPerMinute: 3 });
      const other = await createBot('Bot Libre');
      for (let i = 0; i < 3; i++) expect((await call(`Bearer ${limited.apiKey}`)).status).toBe(200);
      const over = await call(`Bearer ${limited.apiKey}`);
      expect(over.status).toBe(429);
      expect(over.text).toBe('{"statusCode":429,"message":"Límite de uso alcanzado"}');
      expect(Number(over.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect((await call(`Bearer ${other.apiKey}`)).status).toBe(200);
    });

    it('tope diario por bot: sale de la auditoría (sobrevive a un reinicio) y se libera a las 24 horas', async () => {
      const bot = await createBot('Bot Diario', { limitPerDay: 2 });
      const audit = ctx.app.get(AuditService);
      for (let i = 0; i < 2; i++) {
        await audit.record({ botId: bot.id, tool: 'listar_marcas', argsSummary: null, status: ExchangeStatus.OK, durationMs: 5, bytesIn: 40, bytesOut: 100 });
      }
      const blocked = await call(`Bearer ${bot.apiKey}`);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBe('3600');
      // Una app nueva (como tras reiniciar) ve el mismo conteo porque sale de la base.
      await ctx.app.close();
      ctx = await createTestContext();
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(429);
      await ctx.dataSource.query("UPDATE intercambios_bots SET creado_en = now() - interval '25 hours'");
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(200);
    });
  });

  describe('cuerpos y reservas', () => {
    const chunked = (key: string | null, totalBytes: number): Promise<{ status: number; closed: boolean }> =>
      new Promise((resolve) => {
        const port = (ctx.server.address() as AddressInfo).port;
        const req = http.request(
          { host: '127.0.0.1', port, method: 'POST', path: '/api/mcp', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked', ...(key ? { Authorization: `Bearer ${key}` } : {}) } },
          (res) => {
            res.resume();
            const status = res.statusCode ?? 0;
            res.on('end', () => resolve({ status, closed: res.headers.connection === 'close' }));
          },
        );
        req.on('error', () => resolve({ status: 0, closed: true }));
        req.on('response', () => undefined);
        const chunk = Buffer.alloc(2048, 0x61);
        let sent = 0;
        const pump = (): void => {
          if (sent >= totalBytes || req.destroyed) return void req.end();
          sent += chunk.length;
          req.write(chunk, () => setImmediate(pump));
        };
        req.write('{"jsonrpc":"2.0","id":1,"method":"ping","pad":"');
        pump();
      });

    it('un cuerpo chunked (sin Content-Length) que pasa de 16 KB mientras llega da 413 y se cierra la conexión', async () => {
      const bot = await createBot('Bot Chunked');
      const result = await chunked(bot.apiKey, 40_000);
      expect(result.status).toBe(413);
      expect(result.closed).toBe(true);
    });

    it('con una key falsa, el chunked da 401 sin leer el cuerpo', async () => {
      // Un cuerpo chunked de 12 KB (bajo el tope): el 401 sale sin leerlo y el cliente alcanza a recibirlo.
      const result = await chunked(`amx_ffffffff_${'A'.repeat(43)}`, 12_000);
      expect(result.status).toBe(401);
    });

    it('el tope diario es ATÓMICO: 5 peticiones simultáneas con un tope de 3 dejan pasar exactamente 3', async () => {
      const bot = await createBot('Bot Carrera', { limitPerDay: 3, limitPerMinute: 600 });
      const results = await Promise.all(Array.from({ length: 5 }, () => call(`Bearer ${bot.apiKey}`)));
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 200, 200, 429, 429]);
      expect((await call(`Bearer ${bot.apiKey}`)).status).toBe(429);
      expect(await rows("SELECT count(*)::int AS n FROM intercambios_bots WHERE canal = 'mcp'")).toEqual([{ n: 3 }]);
    });

    it('la reserva del tope diario se libera al terminar: llamadas SECUENCIALES hasta el tope y no más', async () => {
      const bot = await createBot('Bot Secuencial', { limitPerDay: 4, limitPerMinute: 600 });
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await call(`Bearer ${bot.apiKey}`)).status);
      expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
    });
  });

  describe('administración sin caché', () => {
    it('GET, POST, rotar y PATCH de /admin/bots llevan Cache-Control: no-store', async () => {
      const created = await request(ctx.server).post('/api/admin/bots').set(auth(adminToken)).send({ name: 'Bot Sin Cache' }).expect(201);
      const id = created.body.bot.id as number;
      const responses = [
        created,
        await request(ctx.server).get('/api/admin/bots').set(auth(adminToken)).expect(200),
        await request(ctx.server).patch(`/api/admin/bots/${id}`).set(auth(adminToken)).send({ limitPerMinute: 10 }).expect(200),
        await request(ctx.server).post(`/api/admin/bots/${id}/rotar-clave`).set(auth(adminToken)).expect(200),
      ];
      for (const res of responses) expect(res.headers['cache-control']).toMatch(/no-store/);
    });
  });

  describe('auditoría', () => {
    it('guarda solo campos estructurados y un CHECK de la base impide pregunta/respuesta en el canal mcp', async () => {
      const bot = await createBot('Bot Auditado');
      await ctx.app.get(AuditService).record({ botId: bot.id, tool: 'consultar_stock', argsSummary: 'marca=Mazda;modelo=3', status: ExchangeStatus.OK, durationMs: 12.6, bytesIn: 120, bytesOut: 900 });
      const [row] = await rows('SELECT canal, direccion, pregunta, respuesta, herramienta, args_resumen, estado, duracion_ms, bytes_entrada, bytes_salida FROM intercambios_bots');
      expect(row).toEqual({
        canal: 'mcp', direccion: 'entrante', pregunta: null, respuesta: null, herramienta: 'consultar_stock',
        args_resumen: 'marca=Mazda;modelo=3', estado: 'ok', duracion_ms: 13, bytes_entrada: 120, bytes_salida: 900,
      });
      const insert = (columns: string, values: string) =>
        ctx.dataSource.query(`INSERT INTO intercambios_bots (bot_id, direccion, ${columns}) VALUES (${bot.id}, 'entrante', ${values})`);
      await expect(insert("canal, pregunta, herramienta, estado", "'mcp', 'texto libre', 'x', 'ok'")).rejects.toThrow();
      await expect(insert("canal, respuesta, herramienta, estado", "'mcp', 'texto libre', 'x', 'ok'")).rejects.toThrow();
      await expect(insert("canal, herramienta", "'mcp', 'x'")).rejects.toThrow();
      await expect(insert("canal", "'a2a'")).rejects.toThrow(); // a2a exige pregunta
      await insert("canal, pregunta", "'a2a', '¿Tienen Mazda 3?'");
    });

    it('un resumen de argumentos largo se recorta a 200 caracteres', async () => {
      const bot = await createBot('Bot Recorte');
      await ctx.app.get(AuditService).record({ botId: bot.id, tool: 'x'.repeat(90), argsSummary: 'a'.repeat(900), status: ExchangeStatus.VALIDATION_ERROR, durationMs: 1, bytesIn: 1, bytesOut: 1 });
      const [row] = await rows('SELECT length(herramienta) AS h, length(args_resumen) AS a FROM intercambios_bots');
      expect(row).toEqual({ h: 40, a: 200 });
    });

    it('la purga borra a los 91 días y no a los 89, y no toca el canal a2a', async () => {
      const bot = await createBot('Bot Purga');
      const audit = ctx.app.get(AuditService);
      for (let i = 0; i < 3; i++) await audit.record({ botId: bot.id, tool: 'listar_marcas', argsSummary: null, status: ExchangeStatus.OK, durationMs: 1, bytesIn: 1, bytesOut: 1 });
      await ctx.dataSource.query("INSERT INTO intercambios_bots (bot_id, direccion, canal, pregunta, creado_en) VALUES ($1, 'entrante', 'a2a', '¿Hola?', now() - interval '400 days')", [bot.id]);
      await ctx.dataSource.query("UPDATE intercambios_bots SET creado_en = now() - interval '91 days' WHERE id = (SELECT min(id) FROM intercambios_bots WHERE canal = 'mcp')");
      await ctx.dataSource.query("UPDATE intercambios_bots SET creado_en = now() - interval '89 days' WHERE id = (SELECT max(id) FROM intercambios_bots WHERE canal = 'mcp')");
      expect(await purgeBotAudit(ctx.dataSource)).toBe(1);
      expect(await rows("SELECT count(*)::int AS n FROM intercambios_bots WHERE canal = 'mcp'")).toEqual([{ n: 2 }]);
      expect(await rows("SELECT count(*)::int AS n FROM intercambios_bots WHERE canal = 'a2a'")).toEqual([{ n: 1 }]);
    });
  });
});
