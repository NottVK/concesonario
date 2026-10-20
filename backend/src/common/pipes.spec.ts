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

  it('también cuenta números y textos: una lista enorme de primitivos se rechaza, y una normal pasa', () => {
    expect(() => pipe.transform({ numbers: Array.from({ length: 30_000 }, () => 1) }, body)).toThrow(BadRequestException);
    expect(() => pipe.transform({ words: Array.from({ length: 30_000 }, () => 'x') }, body)).toThrow(BadRequestException);
    expect(() => pipe.transform({ numbers: Array.from({ length: 1000 }, () => 1), name: 'Ana' }, body)).not.toThrow();
  });

  describe('caracteres nulos (PostgreSQL no los admite en texto y daba 500)', () => {
    const nul = String.fromCharCode(0);
    const query = { type: 'query' } as never;

    it('rechaza un NUL en el cuerpo, anidado, en listas y en nombres de campo', () => {
      for (const value of [{ name: `a${nul}b` }, { customer: { name: nul } }, { tags: ['ok', `x${nul}`] }, { [`k${nul}`]: 1 }]) {
        expect(() => pipe.transform(value, body)).toThrow(BadRequestException);
      }
    });

    it('rechaza un NUL en la consulta, también en listas y objetos', () => {
      for (const value of [{ customer: `${nul}abc` }, { q: [`a${nul}`] }, { q: { a: nul } }]) {
        expect(() => pipe.transform(value, query)).toThrow(BadRequestException);
      }
    });

    it('deja pasar texto normal, con acentos y emojis, en cuerpo y consulta', () => {
      const value = { customer: 'Ñandú 😀', page: '2' };
      expect(pipe.transform(value, query)).toBe(value);
      expect(pipe.transform(value, body)).toBe(value);
    });
  });
});
