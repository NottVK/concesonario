import { describe, expect, it } from 'vitest';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { parseRemoteAnswer, parseRemoteCard } from './response-parser.js';

const status = (body: string): ExchangeStatus | null => {
  try {
    parseRemoteAnswer(body);
    return null;
  } catch (error) {
    return (error as { status: ExchangeStatus }).status;
  }
};

describe('parseRemoteAnswer', () => {
  it('lee las formas que se toleran', () => {
    expect(parseRemoteAnswer('{"answer":"uno"}')).toBe('uno');
    expect(parseRemoteAnswer('{"message":"dos"}')).toBe('dos');
    expect(parseRemoteAnswer('{"response":"tres"}')).toBe('tres');
    expect(parseRemoteAnswer('{"text":"cuatro"}')).toBe('cuatro');
    expect(parseRemoteAnswer('{"result":{"parts":[{"text":"cinco"}]}}')).toBe('cinco');
    expect(parseRemoteAnswer('{"id":"x","status":"completed","answer":"seis"}')).toBe('seis');
  });

  it('el orden es answer, message, response, text, result.parts[0].text; una cadena vacía se salta', () => {
    expect(parseRemoteAnswer('{"text":"t","message":"m","answer":"a"}')).toBe('a');
    expect(parseRemoteAnswer('{"answer":"   ","message":"m"}')).toBe('m');
    expect(parseRemoteAnswer('{"result":{"parts":[{"text":"p"}]},"text":"t"}')).toBe('t');
  });

  it('lo que no es JSON, ni un objeto, ni trae texto es respuesta_invalida', () => {
    const invalid = [
      '', ' ', 'hola', '{"answer":"se corta', 'null', 'true', '1', '"texto"', '[]', '[{"answer":"x"}]', '{}', '{"answer":""}', '{"answer":null}',
      '{"answer":5}', '{"answer":["x"]}', '{"answer":{"texto":"x"}}', '{"result":{"parts":[]}}', '{"result":{"parts":[{"text":5}]}}', '{"result":{"parts":"x"}}', '{"result":"x"}',
      '{"status":"completed"}', '['.repeat(20_000), '{"a":'.repeat(5_000), `{"answer":${'9'.repeat(400)}}`,
    ];
    for (const body of invalid) expect(status(body), body.slice(0, 40)).toBe(ExchangeStatus.INVALID_RESPONSE);
  });

  it('si el bot dice que falló, es error_remoto aunque traiga texto', () => {
    for (const state of ['failed', 'FAILED', 'rejected', 'error', 'canceled', 'cancelled']) {
      expect(status(`{"status":"${state}","answer":"no pude"}`), state).toBe(ExchangeStatus.REMOTE_ERROR);
      expect(status(`{"status":"${state}"}`), state).toBe(ExchangeStatus.REMOTE_ERROR);
    }
    expect(status('{"status":"completed","answer":"ok"}')).toBeNull();
    expect(status('{"status":"needs_input","answer":"dame más datos"}')).toBeNull();
  });

  it('un `__proto__` o `constructor` en el JSON no cambia el resultado', () => {
    expect(parseRemoteAnswer('{"__proto__":{"answer":"inyectado"},"answer":"real"}')).toBe('real');
    expect(status('{"__proto__":{"answer":"inyectado"}}')).toBe(ExchangeStatus.INVALID_RESPONSE);
    expect(status('{"constructor":{"prototype":{"answer":"x"}}}')).toBe(ExchangeStatus.INVALID_RESPONSE);
  });
});

describe('parseRemoteCard', () => {
  it('lee nombre, descripción, url y habilidades', () => {
    expect(parseRemoteCard('{"name":"Bot","description":"d","url":"http://x/a2a","skills":["a","b",3,null]}')).toEqual({ name: 'Bot', description: 'd', url: 'http://x/a2a', skills: ['a', 'b'] });
    expect(parseRemoteCard('{}')).toEqual({ name: null, description: null, url: null, skills: [] });
    expect(parseRemoteCard('{"name":5,"skills":"x"}')).toEqual({ name: null, description: null, url: null, skills: [] });
  });

  it('limita las habilidades a 20', () => {
    const skills = JSON.stringify(Array.from({ length: 100 }, (_, i) => `s${i}`));
    expect(parseRemoteCard(`{"skills":${skills}}`).skills).toHaveLength(20);
  });

  it('no es JSON o no es un objeto: respuesta_invalida', () => {
    for (const body of ['', 'x', '[]', 'null', '{"name":']) {
      expect(() => parseRemoteCard(body), body).toThrow(expect.objectContaining({ status: ExchangeStatus.INVALID_RESPONSE }));
    }
  });
});
