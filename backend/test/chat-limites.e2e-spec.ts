// ANTES de cargar la app: aquí se prueban los límites REALES del chat y de la búsqueda, sin los topes holgados de setup-env.
delete process.env.THROTTLE_PUBLIC_LIMIT;
delete process.env.CHAT_LIMIT_PER_MINUTE;
delete process.env.CHAT_LIMIT_PER_HOUR;
delete process.env.CHAT_MAX_TURNS;
process.env.CHAT_MIN_TURN_GAP_MS = '0';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

describe('Límites reales del chat (e2e)', () => {
  let ctx: TestContext;
  const chat = (token?: string) => {
    const req = request(ctx.server).post('/api/chat');
    if (token) req.set('X-Chat-Session', token);
    return req.send({ message: 'hola' });
  };

  // Una app nueva por prueba: así cada una parte con los contadores por IP en cero.
  beforeEach(async () => {
    ctx = await createTestContext({ listen: true });
    await resetDatabase(ctx.dataSource);
  });

  afterEach(async () => {
    await ctx.app.close();
    process.env.CHAT_MIN_TURN_GAP_MS = '0';
    delete process.env.CHAT_MAX_TURNS;
    delete process.env.CHAT_LIMIT_PER_HOUR;
  });

  it('pausa mínima entre turnos de la misma sesión: 429 con Retry-After, y luego pasa', async () => {
    process.env.CHAT_MIN_TURN_GAP_MS = '1500';
    const first = await chat().expect(200);
    const token = first.body.sessionToken as string;
    const tooFast = await chat(token).expect(429);
    expect(tooFast.headers['retry-after']).toBe('2');
    expect(tooFast.body.message).toMatch(/Espera un par de segundos/);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await chat(token).expect(200);
  });

  it('tope de turnos por sesión: el siguiente da 429 y una sesión nueva sí pasa', async () => {
    process.env.CHAT_MAX_TURNS = '3';
    const first = await chat().expect(200);
    const token = first.body.sessionToken as string;
    await chat(token).expect(200);
    await chat(token).expect(200);
    const over = await chat(token).expect(429);
    expect(over.body.message).toMatch(/límite de mensajes/);
    expect(over.headers['retry-after']).toBeDefined();
    await chat().expect(200);
  });

  it('por hora por IP (aquí 1): el siguiente da 429 con Retry-After en segundos', async () => {
    process.env.CHAT_LIMIT_PER_HOUR = '1';
    await chat().expect(200);
    const res = await chat().expect(429);
    expect(res.body.message).toMatch(/por hora/);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(60);
  });

  it('6 por minuto por IP: la séptima recibe 429 (límite propio de POST /chat)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await chat()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
  });

  it('GET /vehiculos/buscar: 10 por minuto, el 11.º recibe 429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) results.push((await request(ctx.server).get('/api/vehiculos/buscar?q=camioneta')).status);
    expect(results.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(results[10]).toBe(429);
  });
});
