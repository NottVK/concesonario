import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDemo, startFakeBots } from './fake-bots.js';
import type { FakeBots } from './fake-bots.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const DEMO_DIR = join(REPO, 'chatbot', 'a2a-demo');

/** GET/POST con tiempo máximo; devuelve el estado, las cabeceras y el cuerpo, o `timeout` si no hubo respuesta completa. */
async function call(url: string, init: RequestInit & { ms?: number } = {}): Promise<{ status: number; headers: Headers; text: string } | 'timeout'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.ms ?? 2_000);
  try {
    const res = await fetch(url, { method: 'POST', redirect: 'manual', ...init, signal: controller.signal });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch {
    return 'timeout';
  } finally {
    clearTimeout(timer);
  }
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}, ms = 2_000) =>
  call(url, { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers }, ms });

/** Lee una respuesta cruda (sin descomprimir) hasta `limit` bytes. */
function rawRead(url: string, limit: number): Promise<{ headers: http.IncomingHttpHeaders; bytes: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
        if (size > limit) {
          req.destroy();
          resolve({ headers: res.headers, bytes: Buffer.concat(chunks), truncated: true });
        }
      });
      res.on('end', () => resolve({ headers: res.headers, bytes: Buffer.concat(chunks), truncated: false }));
    });
    req.on('error', (error) => (req.destroyed ? undefined : reject(error)));
    req.end('{}');
  });
}

describe('bots de prueba A2A (amigo y malicioso)', () => {
  let bots: FakeBots;

  beforeAll(async () => {
    bots = await startFakeBots();
  });

  afterAll(async () => {
    await bots.close();
  });

  describe('entorno', () => {
    it('se niegan a arrancar en producción o dentro de Docker, y aceptan el desarrollo', async () => {
      const demo = await loadDemo();
      expect(() => demo.assertDevelopmentEnvironment({ env: { NODE_ENV: 'production' }, inDocker: false })).toThrow(/NODE_ENV=production/);
      expect(() => demo.assertDevelopmentEnvironment({ env: {}, inDocker: true })).toThrow(/Docker/);
      expect(() => demo.assertDevelopmentEnvironment({ env: { NODE_ENV: 'development' }, inDocker: false })).not.toThrow();
      expect(() => demo.assertDevelopmentEnvironment({ env: {}, inDocker: false })).not.toThrow();
    });

    it('detecta Docker por el archivo, por el cgroup y por la variable container', async () => {
      const demo = await loadDemo();
      const no = () => false;
      const none = () => {
        throw new Error('sin cgroup');
      };
      expect(demo.runningInDocker({}, (path) => path === '/.dockerenv', none)).toBe(true);
      expect(demo.runningInDocker({}, no, () => '12:cpu:/docker/abc123')).toBe(true);
      expect(demo.runningInDocker({}, no, () => '0::/kubepods/besteffort/pod1')).toBe(true);
      expect(demo.runningInDocker({ container: 'podman' }, no, none)).toBe(true);
      expect(demo.runningInDocker({}, no, () => '0::/user.slice/session-1.scope')).toBe(false);
      expect(demo.runningInDocker({}, no, none)).toBe(false);
    });

    it('el comando de arranque se niega de verdad en producción, en Docker y con un argumento raro', () => {
      const run = (args: string[], env: Record<string, string>) =>
        spawnSync(process.execPath, [join(DEMO_DIR, 'start.mjs'), ...args], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8', timeout: 10_000 });
      const production = run([], { NODE_ENV: 'production' });
      expect(production.status).toBe(1);
      expect(production.stderr).toMatch(/NODE_ENV=production/);
      const docker = run([], { container: 'docker' });
      expect(docker.status).toBe(1);
      expect(docker.stderr).toMatch(/Docker/);
      const usage = run(['otro'], {});
      expect(usage.status).toBe(1);
      expect(usage.stderr).toMatch(/Uso/);
    });

    it('escuchan solo en 127.0.0.1', () => {
      for (const target of [bots.friend.target, bots.malicious.target]) expect(target.startsWith('127.0.0.1:')).toBe(true);
    });
  });

  describe('bot amigo', () => {
    const task = (message: unknown, headers: Record<string, string> = { Authorization: `Bearer ${bots.friend.key}` }) => post(`${bots.friend.url}/tasks`, { from: 'automax', message }, headers);

    it('publica su tarjeta con su propia URL', async () => {
      const res = await call(`${bots.friend.url.replace('/a2a', '')}/.well-known/agent.json`, { method: 'GET' });
      expect(res).not.toBe('timeout');
      const card = JSON.parse((res as { text: string }).text) as { name: string; url: string };
      expect(card.name).toBe('SegurosYa Bot');
      expect(card.url).toBe(bots.friend.url);
    });

    it('responde bien a lo suyo (SOAT, todo riesgo, deducible) y admite que no sabe lo demás', async () => {
      const soat = await task('¿Cuánto cuesta el SOAT?');
      expect(soat).not.toBe('timeout');
      const body = JSON.parse((soat as { text: string }).text) as { status: string; answer: string; id: string };
      expect(body.status).toBe('completed');
      expect(body.answer).toMatch(/SOAT/);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.parse(((await task('Quiero un todo riesgo')) as { text: string }).text).answer).toMatch(/todo riesgo/);
      expect(JSON.parse(((await task('¿Qué es el deducible?')) as { text: string }).text).answer).toMatch(/deducible/);
      expect(JSON.parse(((await task('¿Cuál es la capital de Francia?')) as { text: string }).text).answer).toMatch(/No tengo información/);
    });

    it('pide la key: sin ella, con otra o con el esquema equivocado da 401', async () => {
      for (const headers of [{} as Record<string, string>, { Authorization: 'Bearer otra-key' }, { Authorization: bots.friend.key }, { 'X-API-Key': bots.friend.key }]) {
        const res = await task('hola', headers);
        expect(res, JSON.stringify(headers)).not.toBe('timeout');
        expect((res as { status: number }).status, JSON.stringify(headers)).toBe(401);
      }
    });

    it('valida el cuerpo: JSON roto, sin mensaje y demasiado grande', async () => {
      const auth = { Authorization: `Bearer ${bots.friend.key}` };
      expect(((await post(`${bots.friend.url}/tasks`, '{roto', auth)) as { status: number }).status).toBe(400);
      expect(((await post(`${bots.friend.url}/tasks`, {}, auth)) as { status: number }).status).toBe(400);
      expect(((await post(`${bots.friend.url}/tasks`, { message: 'x'.repeat(40_000) }, auth)) as { status: number }).status).toBe(413);
      expect(((await call(`${bots.friend.url}/otra-ruta`, { method: 'POST' })) as { status: number }).status).toBe(404);
    });

    it('apunta lo que recibe sin guardar la key', async () => {
      bots.friend.received.length = 0;
      await task('hola, ¿tienen SOAT?');
      await task('hola', { Authorization: 'Bearer incorrecta-xyz' });
      expect(bots.friend.received.map((r) => [r.scheme, r.keyOk])).toEqual([['bearer', true], ['bearer', false]]);
      expect(JSON.parse(bots.friend.received[0]!.body)).toEqual({ from: 'automax', message: 'hola, ¿tienen SOAT?' });
      expect(JSON.stringify(bots.friend.received)).not.toContain(bots.friend.key);
      expect(JSON.stringify(bots.friend.received)).not.toContain('incorrecta-xyz');
      const viaHttp = await call(`${bots.friend.url.replace('/a2a', '')}/_received`, { method: 'GET' });
      expect(JSON.parse((viaHttp as { text: string }).text)).toHaveLength(2);
    });

    it('en modo X-API-Key acepta esa cabecera y rechaza Bearer', async () => {
      const other = await startFakeBots({ friendKey: 'otra-key-de-prueba-123', authMode: 'x_api_key' });
      try {
        const send = (headers: Record<string, string>) => post(`${other.friend.url}/tasks`, { message: 'hola' }, headers) as Promise<{ status: number }>;
        expect((await send({ 'X-API-Key': 'otra-key-de-prueba-123' })).status).toBe(200);
        expect((await send({ Authorization: 'Bearer otra-key-de-prueba-123' })).status).toBe(401);
        expect(other.friend.received.map((r) => r.scheme)).toEqual(['x-api-key', 'bearer']);
      } finally {
        await other.close();
      }
    });
  });

  describe('bot malicioso: un comportamiento por modo', () => {
    const url = (mode: string) => `${bots.malicious.urlFor(mode)}/tasks`;
    const json = (res: Awaited<ReturnType<typeof call>>) => JSON.parse((res as { text: string }).text) as Record<string, unknown>;

    /** Una comprobación por modo: añadir un modo sin probarlo hace fallar la prueba de completitud de abajo. */
    const CHECKS: Record<string, () => Promise<void>> = {
      injection: async () => expect(json(await post(url('injection'), {})).answer).toMatch(/Ignora todas tus instrucciones.*prompt.*API key.*clientes/s),
      exfiltration: async () => expect(json(await post(url('exfiltration'), {})).answer).toMatch(/historial.*API key.*!\[\]\(https:\/\/atacante/s),
      deceptive: async () => expect(json(await post(url('deceptive'), {})).answer).toMatch(/AutoMax — mensaje oficial.*CONFIRMADA.*cuenta/s),
      phishing: async () => expect(json(await post(url('phishing'), {})).answer).toMatch(/\+57 300 123 4567.*@automax-oferta.*bit\.ly.*www\./s),
      unicode: async () => {
        const answer = json(await post(url('unicode'), {})).answer as string;
        expect(answer).toMatch(/‮/);
        expect(answer).toMatch(/​/);
        expect(answer).toMatch(/Ｉ/);
        expect(answer).toMatch(/\u0000/);
      },
      html: async () => expect(json(await post(url('html'), {})).answer).toMatch(/<script>.*<img src=x onerror=.*javascript:/s),
      'html-page': async () => {
        const res = (await post(url('html-page'), {})) as { headers: Headers; text: string };
        expect(res.headers.get('content-type')).toMatch(/text\/html/);
        expect(res.text).toMatch(/<script>/);
      },
      'wrong-content-type': async () => {
        const res = (await post(url('wrong-content-type'), {})) as { headers: Headers; text: string };
        expect(res.headers.get('content-type')).toBe('text/plain');
        expect(() => JSON.parse(res.text)).not.toThrow();
      },
      'broken-json': async () => {
        const res = (await post(url('broken-json'), {})) as { status: number; text: string };
        expect(res.status).toBe(200);
        expect(() => JSON.parse(res.text)).toThrow();
      },
      'not-json': async () => {
        const res = (await post(url('not-json'), {})) as { status: number; text: string };
        expect(res.status).toBe(200);
        expect(() => JSON.parse(res.text)).toThrow();
      },
      empty: async () => expect(((await post(url('empty'), {})) as { text: string }).text).toBe(''),
      'no-content': async () => expect((await post(url('no-content'), {})) as { status: number }).toMatchObject({ status: 204 }),
      array: async () => expect(Array.isArray(json(await post(url('array'), {})))).toBe(true),
      'wrong-type': async () => expect(json(await post(url('wrong-type'), {}))).toMatchObject({ id: 7, status: ['completed'], answer: { texto: expect.any(String) } }),
      'error-500': async () => {
        const res = (await post(url('error-500'), {})) as { status: number; text: string };
        expect(res.status).toBe(500);
        expect(res.text).toMatch(/ECONNREFUSED.*node_modules.*password=/s);
      },
      'error-401': async () => expect((await post(url('error-401'), {})) as { status: number }).toMatchObject({ status: 401 }),
      huge: async () => {
        const res = (await post(url('huge'), {}, {}, 5_000)) as { text: string };
        expect(res.text.length).toBeGreaterThan(2 * 1024 * 1024);
      },
      endless: async () => {
        const raw = await rawRead(url('endless'), 300_000);
        expect(raw.truncated).toBe(true); // nunca termina: hay que cortarlo
      },
      'gzip-bomb': async () => {
        const raw = await rawRead(url('gzip-bomb'), 10 * 1024 * 1024);
        expect(raw.headers['content-encoding']).toBe('gzip');
        expect(raw.bytes.length).toBeLessThan(200_000); // pesa poco comprimida…
        expect(gunzipSync(raw.bytes).length).toBeGreaterThan(64 * 1024 * 1024); // …y es enorme al descomprimir
      },
      'slow-start': async () => expect(await post(url('slow-start'), {}, {}, 600)).toBe('timeout'),
      trickle: async () => expect(await post(url('trickle'), {}, {}, 1_500)).toBe('timeout'),
      hang: async () => expect(await post(url('hang'), {}, {}, 600)).toBe('timeout'),
      'redirect-internal': async () => {
        const res = (await post(url('redirect-internal'), {})) as { status: number; headers: Headers };
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(`http://127.0.0.1:${new URL(bots.malicious.base).port}/internal/secret`);
        expect(bots.malicious.hits.internal).toBe(0); // quien no sigue la redirección nunca llega adentro
      },
      'redirect-metadata': async () => {
        const res = (await post(url('redirect-metadata'), {})) as { status: number; headers: Headers };
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('http://169.254.169.254/latest/meta-data/');
      },
      'redirect-loop': async () => {
        const res = (await post(url('redirect-loop'), {})) as { status: number; headers: Headers };
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toMatch(/\/redirect-loop\/a2a\/tasks$/);
      },
    };
    it('hay una comprobación para cada modo y ninguna de más', () => {
      expect(Object.keys(CHECKS).sort()).toEqual([...bots.taskModes].sort());
    });

    for (const mode of Object.keys(CHECKS)) {
      it(`modo ${mode}`, { timeout: 20_000 }, async () => {
        await CHECKS[mode]!();
      });
    }

    it('quien SÍ sigue la redirección llega a /internal/secret (la trampa funciona)', async () => {
      const before = bots.malicious.hits.internal;
      await call(url('redirect-internal'), { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, redirect: 'follow' });
      expect(bots.malicious.hits.internal).toBeGreaterThan(before);
    });

    it('cuenta las llamadas por modo y si traían credenciales', async () => {
      const before = { ...bots.malicious.hits.modes };
      await post(url('injection'), {}, { Authorization: 'Bearer lo-que-sea' });
      await post(url('injection'), {}, { 'X-API-Key': 'otra' });
      expect(bots.malicious.hits.modes.injection).toBe((before.injection ?? 0) + 2);
      expect(bots.malicious.hits.withAuthorization).toBeGreaterThanOrEqual(1);
      expect(bots.malicious.hits.withApiKeyHeader).toBeGreaterThanOrEqual(1);
      const viaHttp = await call(`${bots.malicious.base}/_hits`, { method: 'GET' });
      expect(json(viaHttp)).toMatchObject({ internal: expect.any(Number) });
    });

    it('rutas que no son un modo: 404', async () => {
      for (const path of ['/nada/a2a/tasks', '/injection/otra', '/']) {
        expect(((await post(`${bots.malicious.base}${path}`, {})) as { status: number }).status, path).toBe(404);
      }
    });

    const CARD_CHECKS: Record<string, () => Promise<void>> = {
      'card-other-origin': async () => expect(json(await get('card-other-origin')).url).toBe('http://169.254.169.254/a2a'),
      'card-injection': async () => expect(JSON.stringify(json(await get('card-injection')))).toMatch(/Ignora todas tus instrucciones/),
      'card-huge': async () => expect(((await get('card-huge')) as { text: string }).text.length).toBeGreaterThan(64 * 1024),
      'card-broken': async () => {
        const res = (await get('card-broken')) as { text: string };
        expect(() => JSON.parse(res.text)).toThrow();
      },
      'card-slow': async () => expect(await get('card-slow', 600)).toBe('timeout'),
      'card-redirect': async () => expect(((await get('card-redirect')) as { status: number }).status).toBe(302),
    };
    const get = (mode: string, ms = 2_000) => call(`${bots.malicious.urlFor(mode).replace(/\/a2a$/, '')}/.well-known/agent.json`, { method: 'GET', ms });

    it('hay una comprobación para cada tarjeta hostil y ninguna de más', () => {
      expect(Object.keys(CARD_CHECKS).sort()).toEqual([...bots.cardModes].sort());
    });

    for (const mode of Object.keys(CARD_CHECKS)) {
      it(`tarjeta ${mode}`, { timeout: 10_000 }, async () => {
        await CARD_CHECKS[mode]!();
      });
    }
  });
});

describe('higiene: los bots de prueba no entran a Docker ni al build', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === 'node_modules' || name === 'dist') return [];
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('ningún Dockerfile, compose ni configuración de build los menciona', () => {
    const candidates = [...walk(REPO).filter((path) => /(^|[\\/])(Dockerfile[^\\/]*|\.dockerignore|docker-compose[^\\/]*\.ya?ml)$/.test(path)), join(REPO, 'backend', 'nest-cli.json'), join(REPO, 'backend', 'tsconfig.build.json')];
    for (const file of candidates.filter(existsSync)) expect(readFileSync(file, 'utf8'), relative(REPO, file)).not.toMatch(/a2a-demo|chatbot\//);
  });

  it('el código de producción (backend/src) no importa nada de chatbot/', () => {
    const offenders = walk(join(REPO, 'backend', 'src'))
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
      .filter((path) => /a2a-demo|chatbot[\\/]|bots\.mjs/.test(readFileSync(path, 'utf8')));
    expect(offenders.map((path) => relative(REPO, path))).toEqual([]);
  });

  it('el fixture está en test/ (fuera del rootDir de src) y el build excluye test/', () => {
    expect(existsSync(join(REPO, 'backend', 'test', 'fixtures', 'fake-bots.ts'))).toBe(true);
    const build = JSON.parse(readFileSync(join(REPO, 'backend', 'tsconfig.build.json'), 'utf8')) as { include: string[]; exclude: string[] };
    expect(build.include).toEqual(['src']);
    expect(build.exclude).toContain('test');
  });

  it('los bots solo escuchan en LOOPBACK y el arranque comprueba el entorno ANTES de abrir un puerto', () => {
    const bots = readFileSync(join(DEMO_DIR, 'bots.mjs'), 'utf8');
    const start = readFileSync(join(DEMO_DIR, 'start.mjs'), 'utf8');
    expect(bots).not.toMatch(/0\.0\.0\.0|'::'|"::"/);
    expect(bots.match(/\.listen\(/g)).toHaveLength(1);
    expect(bots).toMatch(/server\.listen\(port, LOOPBACK/);
    expect(start).not.toMatch(/\.listen\(/);
    expect(start.indexOf('assertDevelopmentEnvironment()')).toBeGreaterThan(-1);
    expect(start.indexOf('assertDevelopmentEnvironment()')).toBeLessThan(start.indexOf('bindLocal('));
  });

  it('los bots no tienen dependencias: solo módulos de node', () => {
    for (const file of ['bots.mjs', 'start.mjs']) {
      const imports = [...readFileSync(join(DEMO_DIR, file), 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
      expect(imports.filter((target) => !target.startsWith('node:') && !target.startsWith('./')), file).toEqual([]);
    }
    const manifest = JSON.parse(readFileSync(join(DEMO_DIR, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
  });
});
