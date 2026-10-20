import { describe, expect, it } from 'vitest';
import { loadA2aConfig } from './a2a.config.js';

describe('loadA2aConfig', () => {
  it('toma la URL del entorno, sin barra final ni ruta de más', () => {
    expect(loadA2aConfig({ A2A_PUBLIC_BASE_URL: 'https://bot.automax.co/' }).publicBaseUrl).toBe('https://bot.automax.co');
    expect(loadA2aConfig({ A2A_PUBLIC_BASE_URL: 'https://BOT.automax.co:8443//' }).publicBaseUrl).toBe('https://bot.automax.co:8443');
    expect(loadA2aConfig({ A2A_PUBLIC_BASE_URL: 'https://automax.co/bot' }).publicBaseUrl).toBe('https://automax.co/bot');
  });

  it('sin variable: en desarrollo usa localhost y el puerto; en producción no arranca', () => {
    expect(loadA2aConfig({ PORT: '9000' }).publicBaseUrl).toBe('http://localhost:9000');
    expect(loadA2aConfig({}).publicBaseUrl).toBe('http://localhost:8000');
    expect(() => loadA2aConfig({ NODE_ENV: 'production' })).toThrow(/A2A_PUBLIC_BASE_URL/);
  });

  it('en producción exige https; en desarrollo admite http', () => {
    expect(() => loadA2aConfig({ NODE_ENV: 'production', A2A_PUBLIC_BASE_URL: 'http://bot.automax.co' })).toThrow(/https/);
    expect(loadA2aConfig({ NODE_ENV: 'production', A2A_PUBLIC_BASE_URL: 'https://bot.automax.co' }).publicBaseUrl).toBe('https://bot.automax.co');
    expect(loadA2aConfig({ A2A_PUBLIC_BASE_URL: 'http://192.168.1.20:8000' }).publicBaseUrl).toBe('http://192.168.1.20:8000');
  });

  it('rechaza valores raros y los errores no repiten el valor', () => {
    const bad = ['no es url', 'ftp://bot.co', 'javascript:alert(1)', 'https://user:clave-secreta@bot.co', 'https://bot.co/?x=1', 'https://bot.co/#f'];
    for (const value of bad) {
      expect(() => loadA2aConfig({ A2A_PUBLIC_BASE_URL: value }), value).toThrow(/A2A_PUBLIC_BASE_URL/);
      try {
        loadA2aConfig({ A2A_PUBLIC_BASE_URL: value });
      } catch (error) {
        expect((error as Error).message).not.toContain('clave-secreta');
      }
    }
  });
});
