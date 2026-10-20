import { describe, expect, it } from 'vitest';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import type { OutboundSettings } from './outbound.config.js';
import { pinnedLookup, SecureHttp } from './secure-http.js';
import { TargetPolicy } from './target-policy.js';

describe('pinnedLookup', () => {
  type Callback = (error: Error | null, address: unknown, family?: number) => void;
  const lookup = (pinned: { address: string; family: 4 | 6 }) => pinnedLookup(pinned) as unknown as (host: string, options: unknown, callback: Callback) => void;

  it('devuelve SIEMPRE la IP fijada, sea cual sea el nombre que se pida (no hay segunda resolución)', () => {
    const results: unknown[][] = [];
    const find = lookup({ address: '93.184.216.34', family: 4 });
    for (const host of ['bot.example.com', 'otro-nombre.example', 'localhost', '127.0.0.1']) find(host, {}, (...args) => results.push(args));
    expect(results).toEqual(Array(4).fill([null, '93.184.216.34', 4]));
  });

  it('con `all: true` (autoSelectFamily de Node) devuelve la lista con esa única dirección', () => {
    const results: unknown[][] = [];
    lookup({ address: '2606:4700:4700::1111', family: 6 })('bot.example.com', { all: true }, (...args) => results.push(args));
    expect(results).toEqual([[null, [{ address: '2606:4700:4700::1111', family: 6 }]]]);
  });
});

describe('SecureHttp: la política se aplica ANTES de abrir ninguna conexión', () => {
  const settings: OutboundSettings = { production: false, devAllowed: new Set(), forbiddenPorts: new Set([8000, 5432, 11434]) };
  const http = new SecureHttp(new TargetPolicy(() => settings, async () => [{ address: '10.0.0.5', family: 4 }]));

  it('un destino prohibido falla como bloqueado_ssrf sin tocar la red', async () => {
    const urls = ['https://127.0.0.1/a2a/tasks', 'https://localhost/a2a/tasks', 'http://example.com/a2a/tasks', 'https://169.254.169.254/latest', 'https://bot.example.com/a2a/tasks'];
    for (const url of urls) {
      await expect(http.request({ method: 'POST', url, body: '{}', maxBytes: 1024, deadlineMs: 500 }), url).rejects.toMatchObject({ status: ExchangeStatus.SSRF_BLOCKED });
    }
  });

  it('el último caso es un nombre que resuelve a una IP interna: bloqueado por el DNS, no por la URL', async () => {
    await expect(http.request({ method: 'GET', url: 'https://bot.example.com/x', maxBytes: 1024 })).rejects.toMatchObject({ code: 'dns-privada' });
  });
});
