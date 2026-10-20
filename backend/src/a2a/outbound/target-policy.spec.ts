import { describe, expect, it, vi } from 'vitest';
import { BlockedTarget, OutboundFailure } from './errors.js';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import type { OutboundSettings } from './outbound.config.js';
import { TargetPolicy } from './target-policy.js';
import type { Resolver } from './target-policy.js';

const DEV: OutboundSettings = { production: false, devAllowed: new Set(['127.0.0.1:8100', '[::1]:8200']), forbiddenPorts: new Set([8000, 5432, 11434]) };
const PROD: OutboundSettings = { production: true, devAllowed: new Set(), forbiddenPorts: new Set([8000, 5432, 11434]) };

const policy = (settings: OutboundSettings = DEV, resolver?: Resolver) => new TargetPolicy(() => settings, resolver);

/** Cada entrada: [url, motivo esperado]. El motivo es el `code` interno (solo para registro y pruebas). */
const BLOCKED: [string, string][] = [
  // Loopback e IPv4 internas escritas de todas las formas que normaliza el parser WHATWG
  ['https://127.0.0.1/a2a', 'ip-privada'],
  ['https://127.1/a2a', 'ip-privada'],
  ['https://127.0.1/a2a', 'ip-privada'],
  ['https://2130706433/a2a', 'ip-privada'],
  ['https://0x7f000001/a2a', 'ip-privada'],
  ['https://0x7f.0.0.1/a2a', 'ip-privada'],
  ['https://0177.0.0.1/a2a', 'ip-privada'],
  ['https://017700000001/a2a', 'ip-privada'],
  ['https://0x7f.1/a2a', 'ip-privada'],
  ['https://127.0.0.1./a2a', 'ip-privada'],
  ['https://0/a2a', 'ip-privada'],
  ['https://0.0.0.0/a2a', 'ip-privada'],
  ['https://0x0/a2a', 'ip-privada'],
  ['https://10.0.0.1/a2a', 'ip-privada'],
  ['https://10.255.255.255/a2a', 'ip-privada'],
  ['https://167772161/a2a', 'ip-privada'],
  ['https://172.16.0.1/a2a', 'ip-privada'],
  ['https://172.31.255.254/a2a', 'ip-privada'],
  ['https://192.168.0.10/a2a', 'ip-privada'],
  ['https://192.168.1.1:8443/a2a', 'ip-privada'],
  ['https://3232235777/a2a', 'ip-privada'],
  ['https://169.254.169.254/latest/meta-data', 'ip-privada'],
  ['https://2852039166/a2a', 'ip-privada'],
  ['https://0xa9fea9fe/a2a', 'ip-privada'],
  ['https://100.64.0.1/a2a', 'ip-privada'],
  ['https://198.18.0.1/a2a', 'ip-privada'],
  ['https://192.0.0.8/a2a', 'ip-privada'],
  ['https://224.0.0.251/a2a', 'ip-privada'],
  ['https://255.255.255.255/a2a', 'ip-privada'],
  // IPv6 y formas mapeadas
  ['https://[::1]/a2a', 'ip-privada'],
  ['https://[0:0:0:0:0:0:0:1]/a2a', 'ip-privada'],
  ['https://[::]/a2a', 'ip-privada'],
  ['https://[::ffff:127.0.0.1]/a2a', 'ip-privada'],
  ['https://[::ffff:7f00:1]/a2a', 'ip-privada'],
  ['https://[::ffff:10.0.0.1]/a2a', 'ip-privada'],
  ['https://[::ffff:169.254.169.254]/a2a', 'ip-privada'],
  ['https://[::ffff:a9fe:a9fe]/a2a', 'ip-privada'],
  ['https://[::ffff:192.168.0.1]/a2a', 'ip-privada'],
  ['https://[::127.0.0.1]/a2a', 'ip-privada'],
  ['https://[64:ff9b::7f00:1]/a2a', 'ip-privada'],
  ['https://[64:ff9b::a9fe:a9fe]/a2a', 'ip-privada'],
  ['https://[2002:7f00:1::]/a2a', 'ip-privada'],
  ['https://[fe80::1]/a2a', 'ip-privada'],
  ['https://[fc00::1]/a2a', 'ip-privada'],
  ['https://[fd00:ec2::254]/a2a', 'ip-privada'],
  ['https://[ff02::1]/a2a', 'ip-privada'],
  ['https://[2001:db8::1]/a2a', 'ip-privada'],
  ['https://[2001::1]/a2a', 'ip-privada'],
  // Nombres que no son de Internet público
  ['https://localhost/a2a', 'nombre'],
  ['https://LOCALHOST/a2a', 'nombre'],
  ['https://localhost./a2a', 'nombre'],
  ['https://api.localhost/a2a', 'nombre'],
  ['https://intranet/a2a', 'nombre'],
  ['https://metadata/a2a', 'nombre'],
  ['https://metadata.google.internal/a2a', 'nombre'],
  ['https://printer.local/a2a', 'nombre'],
  ['https://router.lan/a2a', 'nombre'],
  ['https://nas.home/a2a', 'nombre'],
  ['https://x.home.arpa/a2a', 'nombre'],
  ['https://abc.onion/a2a', 'nombre'],
  ['https://db.corp/a2a', 'nombre'],
  ['https://host.localdomain/a2a', 'nombre'],
  ['https://1.0.0.127.in-addr.arpa/a2a', 'nombre'],
  // Esquemas
  ['http://example.com/a2a', 'http'],
  ['http://8.8.8.8/a2a', 'http'],
  ['http://127.0.0.1:9999/a2a', 'http'],
  ['ftp://example.com/a2a', 'esquema'],
  ['file:///etc/passwd', 'esquema'],
  ['gopher://example.com/', 'esquema'],
  ['javascript:alert(1)', 'esquema'],
  ['data:text/plain,hola', 'esquema'],
  ['ws://example.com/a2a', 'esquema'],
  ['wss://example.com/a2a', 'esquema'],
  ['//example.com/a2a', 'url'],
  ['example.com/a2a', 'url'],
  ['/a2a', 'url'],
  ['', 'url'],
  // Credenciales, fragmento, consulta, caracteres raros
  ['https://user:clave@example.com/a2a', 'credenciales'],
  ['https://user@example.com/a2a', 'credenciales'],
  ['https://example.com@evil.com/a2a', 'credenciales'],
  ['https://example.com/a2a#frag', 'fragmento'],
  ['https://example.com/a2a#', 'fragmento'],
  ['https://example.com/a2a?x=1', 'consulta'],
  ['https://example.com/a2a?', 'consulta'],
  ['https://example.com\\@evil.com/a2a', 'caracteres'],
  ['https://example.com/a2a\\..\\x', 'caracteres'],
  ['https://exa mple.com/a2a', 'caracteres'],
  ['https://example.com/a2a\n', 'caracteres'],
  ['https://example.com/\ta2a', 'caracteres'],
  ['https://example.com/a2a\u0000', 'caracteres'],
  ['https://example.com/a2a\u0085', 'caracteres'],
  [' https://example.com/a2a', 'caracteres'],
  ['https://a..b.com/a2a', 'nombre'],
  [`https://${'a'.repeat(64)}.example.com/a2a`, 'nombre'],
  [`https://example.com/${'a'.repeat(300)}`, 'url'],
  // Puertos propios
  ['https://example.com:8000/a2a', 'puerto'],
  ['https://example.com:5432/a2a', 'puerto'],
  ['https://example.com:11434/a2a', 'puerto'],
  ['https://8.8.8.8:8000/a2a', 'puerto'],
];

const ALLOWED: string[] = [
  'https://example.com/a2a',
  'https://bot.automax.co/a2a',
  'https://sub.example.co.uk:8443/a2a/',
  'https://xn--bcher-kva.example/a2a',
  'https://bücher.example/a2a',
  'https://EXAMPLE.com./a2a',
  'https://example.com:443/a2a',
  'https://8.8.8.8/a2a',
  'https://172.15.255.255/a2a',
  'https://172.32.0.1/a2a',
  'https://100.128.0.1/a2a',
  'https://[2606:4700:4700::1111]/a2a',
  'https://[::ffff:8.8.8.8]/a2a',
  // Lista de desarrollo: IP exacta + puerto exacto, y solo ahí vale http
  'http://127.0.0.1:8100/a2a',
  'http://127.1:8100/a2a',
  'https://127.0.0.1:8100/a2a',
  'http://[::1]:8200/a2a',
  'http://[0:0:0:0:0:0:0:1]:8200/a2a',
];

describe('TargetPolicy.check (modo desarrollo)', () => {
  it.each(BLOCKED)('rechaza %s', (url, code) => {
    let thrown: unknown;
    try {
      policy().check(url);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, url).toBeInstanceOf(BlockedTarget);
    expect((thrown as BlockedTarget).status).toBe(ExchangeStatus.SSRF_BLOCKED);
    expect((thrown as BlockedTarget).code, url).toBe(code);
  });

  it.each(ALLOWED)('acepta %s', (url) => {
    expect(() => policy().check(url), url).not.toThrow();
  });

  it('más de 80 casos rechazados y los aceptados que correspondan', () => {
    expect(BLOCKED.length).toBeGreaterThan(80);
    expect(ALLOWED.length).toBeGreaterThan(15);
  });

  it('la lista de desarrollo es IP + puerto EXACTOS: otro puerto, otra IP o un nombre no entran', () => {
    for (const url of ['http://127.0.0.1:8101/a2a', 'http://127.0.0.1/a2a', 'http://127.0.0.2:8100/a2a', 'http://localhost:8100/a2a', 'http://[::1]:8100/a2a', 'http://[::1]:8201/a2a', 'http://0.0.0.0:8100/a2a']) {
      expect(() => policy().check(url), url).toThrow(BlockedTarget);
    }
    expect(policy().check('http://127.0.0.1:8100/a2a').devAllowed).toBe(true);
    expect(policy().check('http://127.1:8100/a2a').hostname).toBe('127.0.0.1');
    expect(policy().check('https://example.com/a2a').devAllowed).toBe(false);
  });

  it('un puerto prohibido lo es aunque la IP esté en la lista de desarrollo', () => {
    const odd: OutboundSettings = { ...DEV, devAllowed: new Set(['127.0.0.1:8000', '127.0.0.1:5432', '127.0.0.1:11434']) };
    for (const port of [8000, 5432, 11434]) expect(() => policy(odd).check(`http://127.0.0.1:${port}/a2a`)).toThrow(BlockedTarget);
  });

  it('devuelve la URL normalizada por el parser, que es la que se usa para conectar', () => {
    const target = policy().check('https://EXAMPLE.com./a2a/');
    expect(target.hostname).toBe('example.com');
    expect(target.port).toBe(443);
    expect(target.url.protocol).toBe('https:');
    expect(policy().check('http://127.1:8100/a2a').url.host).toBe('127.0.0.1:8100');
  });

  it('un valor que no es texto se rechaza', () => {
    for (const value of [undefined, null, 1, {}, [], true]) expect(() => policy().check(value)).toThrow(BlockedTarget);
  });
});

describe('TargetPolicy.check (producción)', () => {
  it('solo https con nombre: ni http, ni IP literal (aunque sea pública), ni la lista de desarrollo', () => {
    expect(() => policy(PROD).check('https://example.com/a2a')).not.toThrow();
    for (const url of ['http://example.com/a2a', 'https://8.8.8.8/a2a', 'https://[2606:4700:4700::1111]/a2a', 'http://127.0.0.1:8100/a2a', 'https://127.0.0.1:8100/a2a', 'https://localhost/a2a']) {
      expect(() => policy(PROD).check(url), url).toThrow(BlockedTarget);
    }
    const withDevList: OutboundSettings = { ...PROD, devAllowed: new Set(['127.0.0.1:8100']) };
    expect(() => policy(withDevList).check('http://127.0.0.1:8100/a2a')).toThrow(BlockedTarget);
  });
});

describe('TargetPolicy.pin (DNS)', () => {
  const checked = (settings = DEV, resolver?: Resolver) => {
    const instance = policy(settings, resolver);
    return { instance, target: instance.check('https://bot.example.com/a2a') };
  };

  it('resuelve UNA vez y fija la IP validada', async () => {
    const resolver = vi.fn<Resolver>().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { instance, target } = checked(DEV, resolver);
    const pinned = await instance.pin(target);
    expect(pinned).toMatchObject({ address: '93.184.216.34', family: 4 });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('rechaza si CUALQUIERA de las direcciones está prohibida, esté donde esté en la lista', async () => {
    const lists = [
      [{ address: '10.0.0.5', family: 4 }],
      [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }],
      [{ address: '10.0.0.5', family: 4 }, { address: '93.184.216.34', family: 4 }],
      [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }],
      [{ address: '127.0.0.1', family: 4 }],
      [{ address: '169.254.169.254', family: 4 }],
      [{ address: '::ffff:10.0.0.1', family: 6 }],
      [{ address: 'fe80::1', family: 6 }],
      [{ address: '64:ff9b::7f00:1', family: 6 }],
      [{ address: 'no-es-una-ip', family: 4 }],
    ] as const;
    for (const list of lists) {
      const { instance, target } = checked(DEV, async () => [...list] as never);
      await expect(instance.pin(target), JSON.stringify(list)).rejects.toMatchObject({ status: ExchangeStatus.SSRF_BLOCKED, code: 'dns-privada' });
    }
  });

  it('un nombre que resuelve a una IP de la lista de desarrollo SIGUE bloqueado (la lista es solo para IP literales)', async () => {
    const { instance, target } = checked(DEV, async () => [{ address: '127.0.0.1', family: 4 }]);
    await expect(instance.pin(target)).rejects.toBeInstanceOf(BlockedTarget);
  });

  it('DNS rebinding: la IP que se usa es la de la validación; una segunda resolución distinta no se consulta', async () => {
    let calls = 0;
    const resolver: Resolver = async () => (++calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
    const { instance, target } = checked(DEV, resolver);
    const pinned = await instance.pin(target);
    expect(pinned.address).toBe('93.184.216.34');
    expect(calls).toBe(1);
    // Una llamada NUEVA vuelve a validar desde cero, y esta vez ve la dirección interna.
    await expect(instance.pin(target)).rejects.toBeInstanceOf(BlockedTarget);
  });

  it('sin respuesta del DNS o con error: es un fallo remoto, no un bloqueo', async () => {
    const empty = checked(DEV, async () => []);
    await expect(empty.instance.pin(empty.target)).rejects.toMatchObject({ status: ExchangeStatus.REMOTE_ERROR });
    const broken = checked(DEV, async () => {
      throw new Error('ENOTFOUND 10.0.0.1');
    });
    const error = await broken.instance.pin(broken.target).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OutboundFailure);
    expect((error as OutboundFailure).status).toBe(ExchangeStatus.REMOTE_ERROR);
    expect((error as OutboundFailure).message).not.toMatch(/10\.0\.0\.1/);
  });

  it('una IP literal de desarrollo no consulta el DNS', async () => {
    const resolver = vi.fn<Resolver>();
    const instance = policy(DEV, resolver);
    const pinned = await instance.pin(instance.check('http://127.0.0.1:8100/a2a'));
    expect(pinned).toMatchObject({ address: '127.0.0.1', family: 4 });
    const v6 = await instance.pin(instance.check('http://[::1]:8200/a2a'));
    expect(v6).toMatchObject({ address: '::1', family: 6 });
    expect(resolver).not.toHaveBeenCalled();
  });
});
