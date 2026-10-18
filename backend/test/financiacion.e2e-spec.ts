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
    const res = await simulate({ amount: '100000000', downPayment: '20000000', months: 60, annualRate: 0.18 }).expect(200);
    expect(res.body).toMatchObject({
      amount: '100000000.00',
      downPayment: '20000000.00',
      financed: '80000000.00',
      months: 60,
      annualRate: 0.18,
    });
    expect(Object.keys(res.body).sort()).toEqual([
      'amount', 'annualRate', 'downPayment', 'financed', 'monthlyPayment',
      'monthlyRate', 'months', 'totalInterest', 'totalPayment',
    ]);
    const monthly = Number(res.body.monthlyPayment);
    expect(monthly).toBeGreaterThan(1_800_000);
    expect(monthly).toBeLessThan(2_100_000);
    expect(Number(res.body.totalPayment)).toBeCloseTo(monthly * 60, 2);
    expect(Number(res.body.totalInterest)).toBeCloseTo(Number(res.body.totalPayment) - 80_000_000, 2);
  });

  it('usa la tasa por defecto cuando no se envía annualRate', async () => {
    const res = await simulate({ amount: '50000000', downPayment: '0', months: 12 }).expect(200);
    expect(res.body.annualRate).toBeGreaterThan(0);
  });

  it('con tasa 0 no cobra intereses', async () => {
    const res = await simulate({ amount: '12000000', downPayment: '0', months: 12, annualRate: 0 }).expect(200);
    expect(res.body).toMatchObject({ monthlyPayment: '1000000.00', totalInterest: '0.00' });
  });

  it('rechaza con 400 los nombres antiguos en español', async () => {
    await simulate({ valor: '1000000', cuotaInicial: '0', plazoMeses: 24 }).expect(400);
    await simulate({ amount: '1000000', downPayment: '0', months: 24, tasaEA: 0.1 }).expect(400);
  });

  it.each([
    ['plazo menor a 12', { amount: '1000000', downPayment: '0', months: 11 }],
    ['plazo mayor a 84', { amount: '1000000', downPayment: '0', months: 85 }],
    ['cuota inicial igual al valor', { amount: '1000000', downPayment: '1000000', months: 24 }],
    ['cuota inicial mayor al valor', { amount: '1000000', downPayment: '2000000', months: 24 }],
    ['valor en cero', { amount: '0', downPayment: '0', months: 24 }],
    ['valor numérico en vez de texto', { amount: 1000000, downPayment: '0', months: 24 }],
    ['tasa negativa', { amount: '1000000', downPayment: '0', months: 24, annualRate: -0.1 }],
    ['tasa mayor a 100 %', { amount: '1000000', downPayment: '0', months: 24, annualRate: 1.5 }],
    ['campo desconocido', { amount: '1000000', downPayment: '0', months: 24, extra: 1 }],
    ['cuerpo vacío', {}],
  ])('rechaza con 400: %s', async (_name, body) => {
    await simulate(body).expect(400);
  });
});
