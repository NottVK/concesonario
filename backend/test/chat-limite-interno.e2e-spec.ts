// ANTES de cargar la app: límite global por IP muy bajo para poder agotarlo.
process.env.THROTTLE_LIMIT = '5';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InternalSecret, INTERNAL_HEADER } from '../src/chat/security/internal-secret.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

describe('Exención del límite por IP para las llamadas internas del bot (e2e)', () => {
  let ctx: TestContext;
  let secret: string;
  const get = (path: string, header?: string) => {
    const req = request(ctx.server).get(path);
    if (header !== undefined) req.set(INTERNAL_HEADER, header);
    return req;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    secret = ctx.app.get(InternalSecret).header();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('sin el secreto, la IP se agota (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await get('/api/marcas')).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('con un secreto falso sigue siendo 429', async () => {
    expect((await get('/api/marcas', 'secreto-falso')).status).toBe(429);
    expect((await get('/api/marcas', 'a'.repeat(64))).status).toBe(429);
    expect((await get('/api/marcas', '')).status).toBe(429);
  });

  it('con el secreto correcto y una ruta de la lista, NO se limita', async () => {
    for (let i = 0; i < 30; i++) expect((await get('/api/marcas', secret)).status).toBe(200);
    expect((await get('/api/vehiculos', secret)).status).toBe(200);
  });

  // El límite se cuenta por ruta y por IP: cada ruta se golpea 6 veces con el secreto y la sexta debe dar 429.
  const hitSix = async (send: () => request.Test): Promise<number[]> => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await send()).status);
    return statuses;
  };

  it('con el secreto correcto en una ruta NO listada, sigue el 429', async () => {
    for (const path of ['/api/clientes', '/api/citas', '/api/ventas', '/api/auth/me', '/api/admin/vehiculos']) {
      const statuses = await hitSix(() => get(path, secret));
      expect(statuses[5], `${path} -> ${statuses.join(',')}`).toBe(429);
    }
  });

  it('el secreto no se concede por método: DELETE a una ruta interna sigue limitado', async () => {
    const del = await hitSix(() => request(ctx.server).delete('/api/vehiculos/1').set(INTERNAL_HEADER, secret));
    expect(del[5]).toBe(429);
  });

  it('una ruta de la lista con el secreto correcto pero con otro método interno (POST /vehiculos) sigue limitado', async () => {
    const statuses = await hitSix(() => request(ctx.server).post('/api/vehiculos').set(INTERNAL_HEADER, secret).send({}));
    expect(statuses[5]).toBe(429);
  });
});
