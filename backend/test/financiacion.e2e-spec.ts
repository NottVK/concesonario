import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers/app.js';

describe('Financiación (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const simulate = (body: object) => request(ctx.server).post('/api/financiacion/simular').send(body);

  it('es público y calcula cuota, total e intereses', async () => {
    const res = await simulate({ valor: '100000000', cuotaInicial: '20000000', plazoMeses: 60, tasaEA: 0.18 }).expect(200);
    expect(res.body).toMatchObject({
      valor: '100000000.00',
      cuotaInicial: '20000000.00',
      financiado: '80000000.00',
      plazoMeses: 60,
      tasaEA: 0.18,
    });
    const monthly = Number(res.body.cuotaMensual);
    expect(monthly).toBeGreaterThan(1_800_000);
    expect(monthly).toBeLessThan(2_100_000);
    expect(Number(res.body.totalPagar)).toBeCloseTo(monthly * 60, 2);
    expect(Number(res.body.totalIntereses)).toBeCloseTo(Number(res.body.totalPagar) - 80_000_000, 2);
  });

  it('usa la tasa por defecto cuando no se envía tasaEA', async () => {
    const res = await simulate({ valor: '50000000', cuotaInicial: '0', plazoMeses: 12 }).expect(200);
    expect(res.body.tasaEA).toBeGreaterThan(0);
  });

  it('con tasa 0 no cobra intereses', async () => {
    const res = await simulate({ valor: '12000000', cuotaInicial: '0', plazoMeses: 12, tasaEA: 0 }).expect(200);
    expect(res.body).toMatchObject({ cuotaMensual: '1000000.00', totalIntereses: '0.00' });
  });

  it.each([
    ['plazo menor a 12', { valor: '1000000', cuotaInicial: '0', plazoMeses: 11 }],
    ['plazo mayor a 84', { valor: '1000000', cuotaInicial: '0', plazoMeses: 85 }],
    ['cuota inicial igual al valor', { valor: '1000000', cuotaInicial: '1000000', plazoMeses: 24 }],
    ['cuota inicial mayor al valor', { valor: '1000000', cuotaInicial: '2000000', plazoMeses: 24 }],
    ['valor en cero', { valor: '0', cuotaInicial: '0', plazoMeses: 24 }],
    ['valor numérico en vez de texto', { valor: 1000000, cuotaInicial: '0', plazoMeses: 24 }],
    ['tasa negativa', { valor: '1000000', cuotaInicial: '0', plazoMeses: 24, tasaEA: -0.1 }],
    ['tasa mayor a 100 %', { valor: '1000000', cuotaInicial: '0', plazoMeses: 24, tasaEA: 1.5 }],
    ['campo desconocido', { valor: '1000000', cuotaInicial: '0', plazoMeses: 24, extra: 1 }],
    ['cuerpo vacío', {}],
  ])('rechaza con 400: %s', async (_name, body) => {
    await simulate(body).expect(400);
  });
});
