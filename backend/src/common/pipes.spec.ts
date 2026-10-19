import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { BodyShapePipe, MAX_BODY_DEPTH } from './body-shape.pipe.js';
import { MAX_DB_INT } from './limits.js';
import { ParseIdPipe } from './parse-id.pipe.js';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it('acepta enteros positivos hasta el máximo de un integer de PostgreSQL', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('42')).toBe(42);
    expect(pipe.transform(String(MAX_DB_INT))).toBe(MAX_DB_INT);
  });

  it.each([
    '0', '-1', '01', '1.5', '1e3', '1e20', '1E400', '2147483648', '4294967296', '9223372036854775808',
    '99999999999999999999', 'abc', '', ' ', ' 12 ', '１２３', '0x10', 'NaN', 'Infinity', '1,2', "1'--", '9'.repeat(400),
  ])('rechaza %j con 400 (ParseIntPipe de Nest aceptaba "1e20" como 1)', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});

describe('BodyShapePipe', () => {
  const pipe = new BodyShapePipe();
  const body = { type: 'body' } as never;
  const nest = (levels: number): unknown => {
    let node: unknown = 1;
    for (let i = 0; i < levels; i++) node = [node];
    return node;
  };

  it('deja pasar cuerpos normales, y lo que no es cuerpo', () => {
    const value = { name: 'Ana', customer: { email: 'a@b.co', tags: ['x', 'y'] } };
    expect(pipe.transform(value, body)).toBe(value);
    expect(pipe.transform('texto', body)).toBe('texto');
    expect(pipe.transform(nest(5000), { type: 'query' } as never)).toBeDefined(); // solo revisa el cuerpo
  });

  it('acepta justo la profundidad máxima y rechaza una más', () => {
    expect(() => pipe.transform(nest(MAX_BODY_DEPTH), body)).not.toThrow();
    expect(() => pipe.transform(nest(MAX_BODY_DEPTH + 1), body)).toThrow(BadRequestException);
  });

  it('rechaza 5000 niveles sin desbordar la pila (el recorrido es iterativo)', () => {
    expect(() => pipe.transform(nest(5000), body)).toThrow(BadRequestException);
  });

  it('rechaza cuerpos con decenas de miles de nodos', () => {
    const wide = { items: Array.from({ length: 30_000 }, () => ({})) };
    expect(() => pipe.transform(wide, body)).toThrow(BadRequestException);
  });
});
