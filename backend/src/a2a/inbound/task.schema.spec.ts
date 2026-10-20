import { describe, expect, it } from 'vitest';
import { financingParamsSchema, taskSchema } from './task.schema.js';

const GOOD = { amount: '100000000', downPayment: '20000000', months: 60 };

describe('financingParamsSchema: la tasa nunca la pone el bot', () => {
  it('acepta los tres datos, con dinero como texto o entero', () => {
    expect(financingParamsSchema.parse(GOOD)).toEqual(GOOD);
    expect(financingParamsSchema.parse({ ...GOOD, amount: 100000000, downPayment: 0 })).toEqual({ ...GOOD, amount: '100000000', downPayment: '0' });
  });

  it.each([
    ['annualRate', { annualRate: 0 }],
    ['annualRate alto', { annualRate: 0.99 }],
    ['annual_rate', { annual_rate: 0 }],
    ['AnnualRate', { AnnualRate: 0 }],
    ['annualrate', { annualrate: 0 }],
    ['tasa', { tasa: 0 }],
    ['rate', { rate: 0 }],
    ['anidada en extra', { extra: { annualRate: 0 } }],
    ['como texto', { annualRate: '0' }],
    ['constructor.prototype', { constructor: { prototype: { annualRate: 0 } } }],
  ])('rechaza %s', (_label, extra) => {
    expect(financingParamsSchema.safeParse({ ...GOOD, ...extra }).success).toBe(false);
  });

  it('rechaza `__proto__` con tasa (JSON crudo, que sí crea la clave)', () => {
    const parsed = JSON.parse(`{"amount":"100000000","downPayment":"20000000","months":60,"__proto__":{"annualRate":0}}`) as unknown;
    expect(financingParamsSchema.safeParse(parsed).success).toBe(false);
  });
});

describe('taskSchema', () => {
  it('es estricto en el nivel superior: ni tasa ni `__proto__` ni campos de más', () => {
    for (const body of [
      { skill: 'financiacion', params: GOOD, annualRate: 0 },
      { message: 'hola', extra: 1 },
      JSON.parse('{"message":"hola","__proto__":{"skill":"stock"}}') as unknown,
    ]) {
      expect(taskSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('exige un mensaje con texto o una habilidad', () => {
    expect(taskSchema.safeParse({}).success).toBe(false);
    expect(taskSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(taskSchema.safeParse({ message: '​\u0000' }).success).toBe(false);
    expect(taskSchema.safeParse({ skill: 'citas' }).success).toBe(true);
    expect(taskSchema.safeParse({ message: 'hola' }).success).toBe(true);
  });

  it('normaliza el mensaje y lo limita a 300 caracteres ya normalizado', () => {
    const parsed = taskSchema.parse({ message: '  Ｍａｚｄａ​   3  ' });
    expect(parsed.message).toBe('Mazda 3');
    expect(taskSchema.safeParse({ message: 'a'.repeat(300) }).success).toBe(true);
    expect(taskSchema.safeParse({ message: 'a'.repeat(301) }).success).toBe(false);
    expect(taskSchema.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('solo las cuatro habilidades', () => {
    for (const skill of ['stock', 'precios', 'citas', 'financiacion']) expect(taskSchema.safeParse({ skill }).success).toBe(true);
    for (const skill of ['clientes', 'STOCK', '', 'stock ', ['stock'], null, 1]) expect(taskSchema.safeParse({ skill }).success, String(skill)).toBe(false);
  });
});
