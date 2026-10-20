import axios from 'axios';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/**
 * Verificación con las versiones REALES de axios y Node (la revisión de Codex la dejó «no verificable»): el nombre del
 * destino NO se resuelve por DNS; el socket va a la IP fijada, también en https y cuando Node pide todas las
 * direcciones (`all: true`, selección de familia).
 */
describe('axios + Node respetan el lookup fijado (sin segunda resolución)', () => {
  let server: http.Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(String(req.headers.host));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"answer":"ok"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const pinned = (family: 4 | 6 = 4) => pinnedLookup({ address: family === 4 ? '127.0.0.1' : '::1', family });

  it('http: un nombre que NO existe (.invalid) conecta a la IP fijada y la cabecera Host sigue siendo el nombre', async () => {
    const response = await axios.get('http://rebinding.invalid:' + port + '/x', { lookup: pinned(), proxy: false, maxRedirects: 0, validateStatus: () => true });
    expect(response.status).toBe(200);
    expect(hits.at(-1)).toBe(`rebinding.invalid:${port}`);
  });

  it('https: intenta la IP fijada (ECONNREFUSED en un puerto cerrado), no el DNS (que daría ENOTFOUND)', async () => {
    const closed = await new Promise<number>((resolve) => {
      const probe = http.createServer().listen(0, '127.0.0.1', () => {
        const free = (probe.address() as AddressInfo).port;
        probe.close(() => resolve(free));
      });
    });
    const error = await axios.get(`https://rebinding.invalid:${closed}/x`, { lookup: pinned(), proxy: false, maxRedirects: 0 }).catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe('ECONNREFUSED');
  });

  it('control: sin lookup fijado el mismo nombre NO llega a nuestro servidor (la prueba distingue los dos casos; el agente global reutilizaría una conexión keep-alive por nombre, por eso SecureHttp crea un agente nuevo sin keep-alive en cada llamada)', async () => {
    const before = hits.length;
    const error = await axios.get(`http://rebinding.invalid:${port}/x`, { proxy: false, maxRedirects: 0, timeout: 3_000, httpAgent: new http.Agent({ keepAlive: false }) }).catch((e: unknown) => e);
    expect(axios.isAxiosError(error)).toBe(true);
    expect(hits.length).toBe(before);
  });

  it('el proxy del entorno se ignora con proxy: false', async () => {
    const previous = { http: process.env.HTTP_PROXY, https: process.env.HTTPS_PROXY, lower: process.env.http_proxy };
    process.env.HTTP_PROXY = process.env.http_proxy = 'http://127.0.0.1:9';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    try {
      const response = await axios.get(`http://rebinding.invalid:${port}/x`, { lookup: pinned(), proxy: false, maxRedirects: 0 });
      expect(response.status).toBe(200);
    } finally {
      for (const [key, value] of [['HTTP_PROXY', previous.http], ['HTTPS_PROXY', previous.https], ['http_proxy', previous.lower]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
