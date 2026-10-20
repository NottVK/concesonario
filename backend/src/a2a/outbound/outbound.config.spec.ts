import { describe, expect, it } from 'vitest';
import { canonicalDevTarget, forbiddenPortsFrom, loadOutboundSettings } from './outbound.config.js';

describe('loadOutboundSettings', () => {
  it('sin variable: lista de desarrollo vacía', () => {
    expect(loadOutboundSettings({}).devAllowed.size).toBe(0);
    expect(loadOutboundSettings({ NODE_ENV: 'production' })).toMatchObject({ production: true });
  });

  it('acepta IP:puerto exactos, con espacios y repetidos, y los deja canónicos', () => {
    const settings = loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: ' 127.0.0.1:8100 , 127.0.0.1:8101,[::1]:8200,127.0.0.1:8100 ,[0:0:0:0:0:0:0:1]:8201' });
    expect([...settings.devAllowed].sort()).toEqual(['127.0.0.1:8100', '127.0.0.1:8101', '[::1]:8200', '[::1]:8201']);
  });

  it('la API NO arranca con la lista de desarrollo en producción', () => {
    expect(() => loadOutboundSettings({ NODE_ENV: 'production', A2A_DEV_ALLOWED_TARGETS: '127.0.0.1:8100' })).toThrow(/NODE_ENV=production/);
    expect(() => loadOutboundSettings({ NODE_ENV: 'production', A2A_DEV_ALLOWED_TARGETS: '   ' })).not.toThrow();
  });

  it('solo IP literal con puerto exacto: nada de nombres, rangos, comodines, esquemas ni rutas', () => {
    const bad = [
      'localhost:8100', 'bot.example.com:8100', '127.0.0.1', '127.0.0.1:', '127.0.0.1:0', '127.0.0.1:65536', '127.0.0.1:99999', '127.0.0.1:8100-8200', '127.0.0.0/24:8100',
      '*:8100', '127.0.0.*:8100', '0.0.0.0/0', 'http://127.0.0.1:8100', '127.0.0.1:8100/a2a', '999.0.0.1:8100', '127.0.0.1:abc', '::1:8200', '[::1]', '[nope]:8100', '2130706433:8100', '0x7f.1:8100',
    ];
    for (const entry of bad) {
      expect(() => loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: entry }), entry).toThrow(/A2A_DEV_ALLOWED_TARGETS/);
      expect(() => loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: `127.0.0.1:8100,${entry}` }), entry).toThrow(/A2A_DEV_ALLOWED_TARGETS/);
    }
  });

  it('rechaza los puertos propios: la API, la base de datos y Ollama', () => {
    for (const port of [8000, 5432, 11434]) expect(() => loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: `127.0.0.1:${port}` }), String(port)).toThrow(/puerto prohibido/);
    expect(() => loadOutboundSettings({ PORT: '9000', A2A_DEV_ALLOWED_TARGETS: '127.0.0.1:9000' })).toThrow(/puerto prohibido/);
    expect(() => loadOutboundSettings({ PORT: '9000', A2A_DEV_ALLOWED_TARGETS: '127.0.0.1:8000' })).not.toThrow(); // 8000 deja de ser el propio
    expect(() => loadOutboundSettings({ OLLAMA_HOST: 'http://192.168.1.50:11500', A2A_DEV_ALLOWED_TARGETS: '127.0.0.1:11500' })).toThrow(/puerto prohibido/);
    expect(() => loadOutboundSettings({ DB_PORT: '6543', A2A_DEV_ALLOWED_TARGETS: '127.0.0.1:6543' })).toThrow(/puerto prohibido/);
  });

  it('admite como máximo 10 entradas', () => {
    const many = Array.from({ length: 11 }, (_, i) => `127.0.0.1:${9000 + i}`).join(',');
    expect(() => loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: many })).toThrow(/máximo 10/);
    expect(() => loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: many.split(',').slice(0, 10).join(',') })).not.toThrow();
  });

  it('los errores nombran la variable pero nunca repiten el valor', () => {
    try {
      loadOutboundSettings({ A2A_DEV_ALLOWED_TARGETS: 'secreto-interno.corp:8100' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/A2A_DEV_ALLOWED_TARGETS/);
      expect((error as Error).message).not.toContain('secreto-interno');
    }
  });
});

describe('forbiddenPortsFrom', () => {
  it('siempre incluye 5432 y el puerto propio y el de Ollama, con valores por defecto', () => {
    expect([...forbiddenPortsFrom({})].sort((a, b) => a - b)).toEqual([5432, 8000, 11434]);
    expect(forbiddenPortsFrom({ OLLAMA_HOST: 'https://ollama.example.com' }).has(443)).toBe(true);
    expect(forbiddenPortsFrom({ OLLAMA_HOST: 'esto no es una url' }).has(11434)).toBe(true);
    expect(forbiddenPortsFrom({ PORT: 'abc' }).has(8000)).toBe(true);
  });
});

describe('canonicalDevTarget', () => {
  it('devuelve IP:puerto o null', () => {
    expect(canonicalDevTarget('127.0.0.1:8100')).toBe('127.0.0.1:8100');
    expect(canonicalDevTarget('[::1]:8200')).toBe('[::1]:8200');
    expect(canonicalDevTarget('[0:0:0:0:0:0:0:1]:8200')).toBe('[::1]:8200');
    expect(canonicalDevTarget('localhost:80')).toBeNull();
  });
});
