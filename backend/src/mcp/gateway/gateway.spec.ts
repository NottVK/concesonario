import { Server } from 'node:http';
import { summarizeArgs } from '../audit/args-summary.js';
import { allowedHosts, applyServerTimeouts, clientIp, hostOf } from '../mcp-http.js';
import { MCP_DEFAULTS } from '../mcp.config.js';
import { IpGate } from './ip-gate.js';
import { RateWindow } from './rate-window.js';
import type { Request } from 'express';

describe('RateWindow', () => {
  it('cuenta por clave dentro de la ventana y libera con el tiempo', () => {
    let now = 0;
    const window = new RateWindow(60_000, () => now);
    expect([1, 2, 3].map(() => window.tryHit('a', 3))).toEqual([true, true, true]);
    expect(window.tryHit('a', 3)).toBe(false);
    expect(window.tryHit('b', 3)).toBe(true);
    expect(window.retryAfterSeconds('a')).toBe(60);
    now = 60_001;
    expect(window.tryHit('a', 3)).toBe(true);
    expect(window.count('a')).toBe(1);
  });
});

describe('memoria acotada (contra quien rota IPs)', () => {
  it('RateWindow nunca recuerda más claves que su tope: olvida primero las vencidas y luego las más antiguas', () => {
    let now = 0;
    const window = new RateWindow(60_000, () => now, 5);
    for (let i = 0; i < 20; i++) window.tryHit(`ip-${i}`, 10);
    expect(window.size).toBeLessThanOrEqual(5);
    expect(window.count('ip-19')).toBe(1); // lo más reciente se conserva
    expect(window.count('ip-0')).toBe(0); // lo más antiguo se olvidó
    now = 120_000;
    for (let i = 0; i < 3; i++) window.tryHit(`otra-${i}`, 10);
    expect(window.size).toBeLessThanOrEqual(5);
  });

  it('IpGate: los bloqueos vencidos se barren aunque la IP no vuelva, y el total de bloqueos tiene tope', () => {
    let now = 0;
    const gate = new IpGate({ ...MCP_DEFAULTS, lockoutFailures: 1, ipPerMinute: 1000 }, () => now);
    for (let i = 0; i < 12_000; i++) gate.recordFailure(`10.${i >> 8}.${i & 255}.1`);
    const locked = Array.from({ length: 12_000 }, (_, i) => gate.isLocked(`10.${i >> 8}.${i & 255}.1`)).filter(Boolean).length;
    expect(locked).toBeLessThanOrEqual(10_000);
    now = MCP_DEFAULTS.lockoutDurationMs + 120_000;
    gate.enter('9.9.9.9'); // dispara el barrido
    const stillLocked = Array.from({ length: 12_000 }, (_, i) => gate.isLocked(`10.${i >> 8}.${i & 255}.1`)).filter(Boolean).length;
    expect(stillLocked).toBe(0);
  });
});

describe('IpGate (límites antes de autenticar)', () => {
  const config = { ...MCP_DEFAULTS, ipPerMinute: 5, ipConcurrent: 2, lockoutFailures: 3, globalPerMinute: 8 };

  it('deja pasar hasta el límite por minuto y luego rechaza', () => {
    let now = 0;
    const gate = new IpGate(config, () => now);
    const results = Array.from({ length: 6 }, () => gate.enter('1.1.1.1'));
    for (const r of results.slice(0, 2)) if (r.ok) r.release();
    expect(results.filter((r) => r.ok)).toHaveLength(2); // el tope de simultáneas (2) corta antes
    now = 61_000;
    expect(gate.enter('1.1.1.1').ok).toBe(true);
  });

  it('peticiones simultáneas: el tercero espera hasta que alguno termina', () => {
    const gate = new IpGate({ ...config, ipPerMinute: 100 }, () => 0);
    const a = gate.enter('2.2.2.2');
    const b = gate.enter('2.2.2.2');
    const c = gate.enter('2.2.2.2');
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
    if (!c.ok) expect(c.reason).toBe('ip-concurrent');
    if (a.ok) {
      a.release();
      a.release(); // liberar dos veces no cuenta doble
    }
    expect(gate.enter('2.2.2.2').ok).toBe(true);
  });

  it('el tope global suma todas las IPs', () => {
    const gate = new IpGate({ ...config, ipPerMinute: 100, ipConcurrent: 100 }, () => 0);
    const outcomes = Array.from({ length: 10 }, (_, i) => gate.enter(`10.0.0.${i}`));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(8);
    const refused = outcomes.find((o) => !o.ok);
    expect(refused && !refused.ok && refused.reason).toBe('global-rate');
  });

  it('bloquea la IP tras N fallos de autenticación y la libera pasado el bloqueo', () => {
    let now = 0;
    const gate = new IpGate({ ...config, ipPerMinute: 1000 }, () => now);
    for (let i = 0; i < 3; i++) gate.recordFailure('3.3.3.3');
    expect(gate.isLocked('3.3.3.3')).toBe(true);
    const locked = gate.enter('3.3.3.3');
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.reason).toBe('locked');
      expect(locked.retryAfterSeconds).toBeGreaterThan(800);
    }
    expect(gate.enter('4.4.4.4').ok).toBe(true); // otra IP no se ve afectada
    now = MCP_DEFAULTS.lockoutDurationMs + 1;
    expect(gate.enter('3.3.3.3').ok).toBe(true);
  });

  it('los fallos fuera de la ventana no cuentan y un acierto reinicia la cuenta', () => {
    let now = 0;
    const gate = new IpGate({ ...config, ipPerMinute: 1000 }, () => now);
    gate.recordFailure('5.5.5.5');
    gate.recordFailure('5.5.5.5');
    now = MCP_DEFAULTS.lockoutWindowMs + 1;
    gate.recordFailure('5.5.5.5');
    expect(gate.isLocked('5.5.5.5')).toBe(false);
    gate.recordFailure('5.5.5.5');
    gate.recordSuccess('5.5.5.5');
    gate.recordFailure('5.5.5.5');
    gate.recordFailure('5.5.5.5');
    expect(gate.isLocked('5.5.5.5')).toBe(false);
  });
});

describe('resumen de argumentos para la auditoría', () => {
  it('se arma solo con claves conocidas y valores simples, y cabe en 200 caracteres', () => {
    expect(summarizeArgs({ marca: 'Mazda', modelo: '3', anio: 2024 })).toBe('marca=Mazda;modelo=3;anio=2024');
    expect(summarizeArgs({ marca: 'Mazda', otra: 'x', secreto: 'y' } as never)).toBe('marca=Mazda');
    expect(summarizeArgs({ marca: undefined })).toBe('');
    expect(summarizeArgs({ marca: '<script>alert(1)</script>\n;DROP' })).not.toMatch(/[<>()\n;]{1}.*DROP|<|>|\n/);
    const long = summarizeArgs({ marca: 'a'.repeat(500), modelo: 'b'.repeat(500), estado: 'c'.repeat(500), limite: 5 });
    expect(long.length).toBeLessThanOrEqual(MCP_DEFAULTS.argsSummaryMaxChars);
  });
});

describe('reglas HTTP del MCP', () => {
  it('hostOf: puerto fuera, IPv6 entre corchetes, y nada raro', () => {
    expect(hostOf('localhost:8000')).toBe('localhost');
    expect(hostOf('API.Ejemplo.com')).toBe('api.ejemplo.com');
    expect(hostOf('[::1]:8000')).toBe('::1');
    expect(hostOf('127.0.0.1')).toBe('127.0.0.1');
    for (const bad of [undefined, '', 'a b', 'host:99999999', 'x'.repeat(400), 'evil.com/path', 'a@b']) expect(hostOf(bad), String(bad)).toBeNull();
  });

  it('allowedHosts: loopback por defecto y los de MCP_ALLOWED_HOSTS', () => {
    expect([...allowedHosts({})].sort()).toEqual(['127.0.0.1', '::1', 'localhost']);
    const hosts = allowedHosts({ MCP_ALLOWED_HOSTS: 'mcp.automax.co, OTRO.example ,inválido!!' });
    expect(hosts.has('mcp.automax.co')).toBe(true);
    expect(hosts.has('otro.example')).toBe(true);
    expect([...hosts].some((h) => h.includes('!'))).toBe(false);
  });

  it('clientIp limpia lo que no parece una IP', () => {
    const req = (ip: string | undefined) => ({ ip, socket: { remoteAddress: undefined } }) as unknown as Request;
    expect(clientIp(req('::ffff:127.0.0.1'))).toBe('::ffff:127.0.0.1');
    expect(clientIp(req('2001:db8::1'))).toBe('2001:db8::1');
    expect(clientIp(req('1.2.3.4\nX-Evil: 1'))).toBe('desconocida');
    expect(clientIp(req(undefined))).toBe('desconocida');
  });

  it('los tiempos del servidor HTTP quedan en 10 s, 15 s y 5 s', () => {
    const server = new Server();
    applyServerTimeouts(server);
    expect([server.headersTimeout, server.requestTimeout, server.keepAliveTimeout]).toEqual([10_000, 15_000, 5_000]);
  });
});
