import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeStatus } from '../src/a2a/entities/bot-exchange.entity.js';
import { ExternalBot } from '../src/a2a/entities/external-bot.entity.js';
import { A2aOutboundService } from '../src/a2a/outbound/a2a-outbound.service.js';
import type { ConnectionTest, OutboundResult, OutboundRuntime } from '../src/a2a/outbound/a2a-outbound.service.js';
import { CircuitBreaker } from '../src/a2a/outbound/circuit-breaker.js';
import { loadOutboundSettings, PUBLIC_MESSAGES } from '../src/a2a/outbound/outbound.config.js';
import { OutboundLimiter } from '../src/a2a/outbound/outbound-limiter.js';
import { SecureHttp } from '../src/a2a/outbound/secure-http.js';
import { TargetPolicy } from '../src/a2a/outbound/target-policy.js';
import { AuditService } from '../src/mcp/audit/audit.service.js';
import { RateWindow } from '../src/mcp/gateway/rate-window.js';
import { BotKeysService } from '../src/mcp/keys/bot-keys.service.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';
import { startFakeBots } from './fixtures/fake-bots.js';
import type { FakeBots } from './fixtures/fake-bots.js';

/** Fragmentos que NUNCA deben aparecer en lo que se devuelve ni en lo que se audita cuando algo falla. */
const LEAKS = ['hunter2', 'node_modules', 'ECONNREFUSED', '10.0.0.5', 'SECRETO-INTERNO', '/srv/app', '127.0.0.1', 'localhost'];

describe('A2A saliente contra el bot amigo y el malicioso (e2e)', () => {
  let ctx: TestContext;
  let bots: FakeBots;
  let keys: BotKeysService;
  let botsRepo: Repository<ExternalBot>;
  let audit: AuditService;
  let counter = 0;

  const rows = async (sql = 'SELECT * FROM intercambios_bots ORDER BY id') => (await ctx.dataSource.query(sql)) as Record<string, unknown>[];

  /** Un servicio con piezas NUEVAS (límites y circuito en blanco) y un plazo corto, para que cada caso sea independiente. */
  const makeService = (overrides: Partial<OutboundRuntime> = {}) => {
    const runtime: OutboundRuntime = {
      http: new SecureHttp(new TargetPolicy(() => loadOutboundSettings())),
      breaker: new CircuitBreaker(),
      limiter: new OutboundLimiter(),
      testWindow: new RateWindow(60_000),
      deadlineMs: 700,
      ...overrides,
    };
    return { service: new A2aOutboundService(botsRepo, keys, audit, runtime), runtime };
  };

  const createBot = async (url: string | null, extra: { key?: string; auth?: 'bearer' | 'x_api_key'; perMinute?: number; active?: boolean } = {}): Promise<number> => {
    const name = `Bot de prueba ${++counter}`;
    // El registro rechaza las URL que la política SSRF prohíbe (6.7). Para seguir probando la defensa AL LLAMAR (una fila vieja o manipulada
    // en la base), esos casos se crean con una URL válida de relleno y se sobrescriben directo en la tabla (sin key: la key va atada al origen).
    const created = await keys
      .create({ name, ...(url ? { url } : {}), ...(extra.key ? { outboundApiKey: extra.key } : {}) })
      .catch(async (error: unknown) => {
        if (!url || (error as { status?: number }).status !== 400) throw error;
        const placeholder = await keys.create({ name, url: 'https://relleno.example.com/a2a' });
        await botsRepo.update({ id: placeholder.bot.id }, { url });
        return placeholder;
      });
    const patch: Partial<ExternalBot> = {
      ...(extra.auth ? { outboundAuth: extra.auth } : {}),
      ...(extra.perMinute ? { outboundLimitPerMinute: extra.perMinute } : {}),
      ...(extra.active === false ? { active: false } : {}),
    };
    if (Object.keys(patch).length > 0) await botsRepo.update({ id: created.bot.id }, patch);
    return created.bot.id;
  };

  const ok = (result: OutboundResult): Extract<OutboundResult, { ok: true }> => {
    expect(result.ok, JSON.stringify(result)).toBe(true);
    return result as Extract<OutboundResult, { ok: true }>;
  };
  const failed = (result: OutboundResult, status: ExchangeStatus): void => {
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, status, message: PUBLIC_MESSAGES[status] });
    // Lo único que vuelve es la categoría y su texto fijo.
    expect(Object.keys(result).sort()).toEqual(['message', 'ok', 'requestId', 'status']);
    for (const leak of LEAKS) expect(JSON.stringify(result), leak).not.toContain(leak);
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    keys = ctx.app.get(BotKeysService);
    audit = ctx.app.get(AuditService);
    botsRepo = ctx.app.get<Repository<ExternalBot>>(getRepositoryToken(ExternalBot));
    bots = await startFakeBots();
  });

  afterAll(async () => {
    delete process.env.A2A_DEV_ALLOWED_TARGETS;
    await bots.close();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    process.env.A2A_DEV_ALLOWED_TARGETS = `${bots.friend.target},${bots.malicious.target}`;
    bots.friend.received.length = 0;
  });

  describe('bot amigo', () => {
    it('responde, y lo único que recibe es la pregunta redactada con la key por el esquema pedido', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      const { service } = makeService();
      const result = ok(await service.ask({ botId: id, question: '¿Cuánto cuesta el SOAT? Escríbeme a ana@correo.com o al 300 123 4567', sessionKey: 'sesion-1' }));
      expect(result.text).toMatch(/SOAT es obligatorio/);
      expect(result.bot).toMatchObject({ id });
      expect(bots.friend.received).toHaveLength(1);
      const [sent] = bots.friend.received;
      expect(sent).toMatchObject({ scheme: 'bearer', keyOk: true, contentType: 'application/json' });
      // El cuerpo es EXACTAMENTE { from, message }: ni historial, ni sesión, ni datos del cliente, ni la pregunta sin redactar.
      expect(JSON.parse(sent!.body)).toEqual({ from: 'AutoMax Bot', message: '¿Cuánto cuesta el SOAT? Escríbeme a [correo] o al [número]' });
      expect(sent!.body).not.toMatch(/ana@correo|300 123|sesion-1/);
    });

    it('con auth_saliente = x_api_key envía la cabecera X-API-Key y no Authorization', async () => {
      const other = await startFakeBots({ friendKey: 'key-para-x-api-12345', authMode: 'x_api_key' });
      process.env.A2A_DEV_ALLOWED_TARGETS = other.friend.target;
      try {
        const id = await createBot(other.friend.url, { key: 'key-para-x-api-12345', auth: 'x_api_key' });
        ok(await makeService().service.ask({ botId: id, question: '¿Qué es el deducible?' }));
        expect(other.friend.received.map((r) => [r.scheme, r.keyOk])).toEqual([['x-api-key', true]]);
        // Y si el bot pide Bearer pero lo registramos como x_api_key (o al revés), falla como error remoto.
        const wrong = await createBot(other.friend.url, { key: 'key-para-x-api-12345', auth: 'bearer' });
        failed(await makeService().service.ask({ botId: wrong, question: '¿Qué es el deducible?' }), ExchangeStatus.REMOTE_ERROR);
      } finally {
        await other.close();
      }
    });

    it('un bot sin key no recibe ninguna cabecera de autenticación; si el bot la exige, es un error remoto', async () => {
      const id = await createBot(bots.friend.url);
      failed(await makeService().service.ask({ botId: id, question: '¿Hay SOAT?' }), ExchangeStatus.REMOTE_ERROR);
      expect(bots.friend.received.map((r) => r.scheme)).toEqual(['none']);
    });

    it('audita cada intento como saliente/a2a con texto redactado, el id de la respuesta y sin la key', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      const result = ok(await makeService().service.ask({ botId: id, question: '¿Cuánto cuesta el SOAT? Soy ana@correo.com' }));
      const [row] = await rows();
      expect(row).toMatchObject({ bot_id: id, direccion: 'saliente', canal: 'a2a', estado: 'ok', peticion_id: result.requestId, pregunta: '¿Cuánto cuesta el SOAT? Soy [correo]' });
      expect(row!.respuesta).toBe(result.text);
      expect(row!.bytes_entrada).toBeGreaterThan(0);
      expect(JSON.stringify(await rows())).not.toContain(bots.friend.key);
    });

    it('conexión de prueba: lee la tarjeta del amigo', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      const result = await makeService().service.testConnection(id);
      expect(result).toMatchObject({ ok: true, name: 'SegurosYa Bot', originMismatch: false });
      expect((result as { skills: string[] }).skills).toEqual(['soat', 'seguros']);
    });
  });

  describe('validaciones antes de conectar', () => {
    it('un bot que no existe, está desactivado o no tiene url es «rechazado» y no se contacta', async () => {
      const { service } = makeService();
      failed(await service.ask({ botId: 9999, question: '¿Hay SOAT?' }), ExchangeStatus.REJECTED);
      for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) failed(await service.ask({ botId: bad, question: '¿Hay SOAT?' }), ExchangeStatus.REJECTED);
      const inactive = await createBot(bots.friend.url, { key: bots.friend.key, active: false });
      failed(await service.ask({ botId: inactive, question: '¿Hay SOAT?' }), ExchangeStatus.REJECTED);
      const noUrl = await createBot(null);
      failed(await service.ask({ botId: noUrl, question: '¿Hay SOAT?' }), ExchangeStatus.REJECTED);
      expect(bots.friend.received).toHaveLength(0);
      expect((await rows()).map((row) => row.estado)).toEqual(['rechazado', 'rechazado']); // los dos bots que sí existen se auditan
    });

    it('una pregunta inválida (corta, larga, que no es texto) es «rechazada» y no sale nada', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      const { service } = makeService();
      for (const question of ['hola', '', '     ', 'a'.repeat(301), 'a'.repeat(100_000), undefined, null, 42, { texto: 'x' }, ['x']]) {
        failed(await service.ask({ botId: id, question }), ExchangeStatus.REJECTED);
      }
      expect(bots.friend.received).toHaveLength(0);
    });

    it('la clave guardada ilegible es un fallo interno y el bot no recibe nada', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      await ctx.dataSource.query(`UPDATE bots_externos SET api_key_saliente = 'enc:v2:basura:basura:basura' WHERE id = $1`, [id]);
      failed(await makeService().service.ask({ botId: id, question: '¿Hay SOAT?' }), ExchangeStatus.INTERNAL_ERROR);
      expect(bots.friend.received).toHaveLength(0);
    });
  });

  describe('política SSRF sobre la URL registrada', () => {
    const REGISTERED = [
      'http://169.254.169.254/latest/meta-data',
      'https://169.254.169.254/a2a',
      'https://localhost/a2a',
      'https://127.0.0.1/a2a',
      'https://[::1]/a2a',
      'https://[::ffff:127.0.0.1]/a2a',
      'https://2130706433/a2a',
      'https://0x7f.0.0.1/a2a',
      'https://10.0.0.5/a2a',
      'https://192.168.1.10/a2a',
      'https://metadata.google.internal/a2a',
      'https://user:clave@example.com/a2a',
      'https://example.com/a2a?x=1',
      'http://example.com/a2a',
      'ftp://example.com/a2a',
      'file:///etc/passwd',
      'https://example.com:5432/a2a',
    ];

    it.each(REGISTERED)('%s → bloqueado_ssrf, sin conectar, auditado', async (url) => {
      const id = await createBot(url);
      failed(await makeService().service.ask({ botId: id, question: '¿Hay SOAT?' }), ExchangeStatus.SSRF_BLOCKED);
      const logged = await rows();
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ estado: 'bloqueado_ssrf', respuesta: null });
      expect(JSON.stringify(logged)).not.toContain('169.254');
    });

    it('sin A2A_DEV_ALLOWED_TARGETS los bots de la LAN o de esta máquina están bloqueados (aunque sean los de prueba)', async () => {
      const injectionBefore = bots.malicious.hits.modes.injection ?? 0;
      const friend = await createBot(bots.friend.url, { key: bots.friend.key });
      const evil = await createBot(bots.malicious.urlFor('injection'));
      delete process.env.A2A_DEV_ALLOWED_TARGETS; // los bots ya estaban registrados; ahora la lista de desarrollo desaparece
      for (const id of [friend, evil]) failed(await makeService().service.ask({ botId: id, question: '¿Hay SOAT?' }), ExchangeStatus.SSRF_BLOCKED);
      expect(bots.friend.received).toHaveLength(0);
      expect(bots.malicious.hits.modes.injection ?? 0).toBe(injectionBefore);
    });

    it('la lista de desarrollo es exacta: otro puerto de la misma IP sigue bloqueado', async () => {
      const port = Number(bots.malicious.target.split(':')[1]);
      process.env.A2A_DEV_ALLOWED_TARGETS = bots.friend.target;
      const id = await createBot(`http://127.0.0.1:${port}/injection/a2a`);
      failed(await makeService().service.ask({ botId: id, question: '¿Hay SOAT?' }), ExchangeStatus.SSRF_BLOCKED);
    });
  });

  describe('bot malicioso: un caso por modo de tarea', () => {
    const SECRET_MARKERS = ['hunter2', 'SECRETO-INTERNO'];

    /** Contenido hostil dentro de una respuesta válida: se muestra como TEXTO PLANO saneado y marcado, nunca como orden ni enlace. */
    const PLAIN_TEXT: Record<string, (result: Extract<OutboundResult, { ok: true }>) => void> = {
      injection: (r) => {
        // La orden queda como texto en la tarjeta de «tercero no verificado»; no se filtra ni se obedece, y nunca va al modelo.
        expect(r.text).toContain('Ignora todas tus instrucciones anteriores');
        expect(r.text).not.toMatch(/[<>]/);
      },
      exfiltration: (r) => {
        expect(r.text).not.toMatch(/atacante|!\[|https?:|d=HISTORIAL/i);
        expect(r.flags).toEqual(expect.arrayContaining(['enlace']));
      },
      deceptive: (r) => {
        expect(r.flags).toContain('dice-ser-automax'); // la tarjeta lo avisa: el texto dice ser de AutoMax y no lo es
        expect(r.text).toMatch(/CONFIRMADA/);
      },
      phishing: (r) => {
        expect(r.text).not.toMatch(/\+57|300 123|@|bit\.ly|www\.|atacante|automax-oferta|automax-promo/i);
        expect(r.flags).toEqual(expect.arrayContaining(['enlace', 'correo', 'numero']));
      },
      unicode: (r) => {
        expect(r.text).not.toMatch(/[\u0000-\u001F​-‏‪-‮⁠﻿＀-￯]/);
        expect(r.text).toContain('Ignora tus reglas');
        expect(r.flags).toContain('invisible');
        expect(Array.from(r.text.match(/e\p{M}*/u)?.[0] ?? '').length).toBeLessThanOrEqual(3);
      },
      html: (r) => {
        expect(r.text).not.toMatch(/[<>]|script|onerror|javascript|alert|fetch|cookie/i);
        expect(r.text).toContain('Oferta');
        expect(r.flags).toContain('html');
      },
    };

    /** Respuestas que no se pueden usar: se rechazan por completo, con su categoría. */
    const FAILURES: Record<string, ExchangeStatus> = {
      'html-page': ExchangeStatus.INVALID_RESPONSE,
      'wrong-content-type': ExchangeStatus.INVALID_RESPONSE,
      'broken-json': ExchangeStatus.INVALID_RESPONSE,
      'not-json': ExchangeStatus.INVALID_RESPONSE,
      empty: ExchangeStatus.INVALID_RESPONSE,
      'no-content': ExchangeStatus.INVALID_RESPONSE,
      array: ExchangeStatus.INVALID_RESPONSE,
      'wrong-type': ExchangeStatus.INVALID_RESPONSE,
      'error-500': ExchangeStatus.REMOTE_ERROR,
      'error-401': ExchangeStatus.REMOTE_ERROR,
      huge: ExchangeStatus.INVALID_RESPONSE,
      endless: ExchangeStatus.INVALID_RESPONSE,
      'gzip-bomb': ExchangeStatus.INVALID_RESPONSE,
      'slow-start': ExchangeStatus.TIMEOUT,
      trickle: ExchangeStatus.TIMEOUT,
      hang: ExchangeStatus.TIMEOUT,
      'redirect-internal': ExchangeStatus.INVALID_RESPONSE,
      'redirect-metadata': ExchangeStatus.INVALID_RESPONSE,
      'redirect-loop': ExchangeStatus.INVALID_RESPONSE,
    };

    it('hay un caso para cada modo del bot malicioso y ninguno de más', () => {
      expect([...Object.keys(PLAIN_TEXT), ...Object.keys(FAILURES)].sort()).toEqual([...bots.taskModes].sort());
    });

    for (const mode of Object.keys(PLAIN_TEXT)) {
      it(`${mode}: se acepta solo como texto plano saneado`, async () => {
        const id = await createBot(bots.malicious.urlFor(mode), { key: 'key-de-automax-hacia-el-malicioso' });
        const result = ok(await makeService().service.ask({ botId: id, question: '¿Tienen seguro de carro?' }));
        PLAIN_TEXT[mode]!(result);
        expect(result.text.length).toBeGreaterThan(0);
        expect(Array.from(result.text).length).toBeLessThanOrEqual(600);
        // Lo que queda auditado es ese mismo texto plano; el original hostil no se guarda.
        const [row] = await rows();
        expect(row).toMatchObject({ estado: 'ok', respuesta: result.text });
        expect(JSON.stringify(row)).not.toMatch(/<script|onerror|javascript:|atacante\.example|key-de-automax/);
        expect(bots.malicious.hits.internal).toBe(0);
      });
    }

    for (const [mode, status] of Object.entries(FAILURES)) {
      it(`${mode}: se corta o se rechaza como «${status}» y nada del bot llega a la respuesta`, { timeout: 15_000 }, async () => {
        const id = await createBot(bots.malicious.urlFor(mode), { key: 'key-de-automax-hacia-el-malicioso' });
        const visitsBefore = bots.malicious.hits.modes[mode] ?? 0;
        const started = Date.now();
        const result = await makeService().service.ask({ botId: id, question: '¿Tienen seguro de carro?' });
        failed(result, status);
        expect(Date.now() - started).toBeLessThan(3_000); // el plazo de 700 ms de la prueba corta lo lento, y lo enorme se corta antes
        const [row] = await rows();
        expect(row).toMatchObject({ estado: status, respuesta: null });
        for (const marker of SECRET_MARKERS) expect(JSON.stringify(row), marker).not.toContain(marker);
        // Las redirecciones nunca se siguen: la ruta interna del propio bot no recibió visitas.
        expect(bots.malicious.hits.internal).toBe(0);
        expect(bots.malicious.hits.modes[mode]).toBe(visitsBefore + 1);
      });
    }

    it('la key de AutoMax se envía SOLO al destino registrado, nunca a lo que diga una redirección', async () => {
      const before = bots.malicious.hits.withAuthorization;
      const id = await createBot(bots.malicious.urlFor('redirect-internal'), { key: 'key-de-automax-hacia-el-malicioso' });
      failed(await makeService().service.ask({ botId: id, question: '¿Tienen seguro de carro?' }), ExchangeStatus.INVALID_RESPONSE);
      expect(bots.malicious.hits.withAuthorization).toBe(before + 1); // la llamada registrada
      expect(bots.malicious.hits.internal).toBe(0); // y nadie fue a la dirección de la redirección
    });
  });

  describe('circuit breaker', () => {
    it('tras 3 fallos seguidos corta las llamadas sin contactar al bot; pasados 60 s deja una sonda y se recupera', async () => {
      let now = 1_000_000;
      const { service, runtime } = makeService({ breaker: new CircuitBreaker({ now: () => now }) });
      const id = await createBot(bots.malicious.urlFor('error-500'));
      const visits = () => (bots.malicious.hits.modes['error-500'] ?? 0) - baseline;
      const baseline = bots.malicious.hits.modes['error-500'] ?? 0;
      for (let i = 0; i < 3; i++) failed(await service.ask({ botId: id, question: `¿Pregunta número ${i}?` }), ExchangeStatus.REMOTE_ERROR);
      expect(runtime.breaker.stateOf(id)).toBe('open');
      expect(visits()).toBe(3);

      // Abierto: no se llama al bot (el contador no sube) y se audita como circuito_abierto.
      failed(await service.ask({ botId: id, question: '¿Otra pregunta más?' }), ExchangeStatus.CIRCUIT_OPEN);
      expect(visits()).toBe(3);

      // Pasan 60 s: UNA sonda. Falla → vuelve a abrirse.
      now += 60_000;
      failed(await service.ask({ botId: id, question: '¿Sonda que falla?' }), ExchangeStatus.REMOTE_ERROR);
      expect(visits()).toBe(4);
      failed(await service.ask({ botId: id, question: '¿Otra tras la sonda?' }), ExchangeStatus.CIRCUIT_OPEN);

      // El administrador corrige la URL (ahora apunta al amigo), pasan otros 60 s y la sonda sale bien: se cierra.
      // Por el servicio real: al cambiar el origen hay que dar la key de nuevo (la anterior estaba atada al origen viejo).
      await keys.update(id, { url: bots.friend.url, outboundApiKey: bots.friend.key });
      now += 60_000;
      ok(await service.ask({ botId: id, question: '¿Hay SOAT?' }));
      expect(runtime.breaker.stateOf(id)).toBe('closed');
      const states = (await rows()).map((row) => row.estado);
      expect(states).toEqual(['error_remoto', 'error_remoto', 'error_remoto', 'circuito_abierto', 'error_remoto', 'circuito_abierto', 'ok']);
    });

    it('un bloqueo SSRF o una pregunta inválida NO cuentan como fallo del bot', async () => {
      const { service, runtime } = makeService();
      const id = await createBot('https://127.0.0.1/a2a');
      for (let i = 0; i < 5; i++) failed(await service.ask({ botId: id, question: `¿Pregunta número ${i}?` }), ExchangeStatus.SSRF_BLOCKED);
      expect(runtime.breaker.stateOf(id)).toBe('closed');
    });

    it('cada bot tiene su circuito', async () => {
      const { service } = makeService();
      const broken = await createBot(bots.malicious.urlFor('error-500'));
      const good = await createBot(bots.friend.url, { key: bots.friend.key });
      for (let i = 0; i < 3; i++) await service.ask({ botId: broken, question: `¿Pregunta número ${i}?` });
      failed(await service.ask({ botId: broken, question: '¿Otra más?' }), ExchangeStatus.CIRCUIT_OPEN);
      ok(await service.ask({ botId: good, question: '¿Hay SOAT?' }));
    });
  });

  describe('límites', () => {
    it('3 por sesión y hora: la cuarta no sale; otra sesión tiene su propio cupo', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key });
      const { service } = makeService();
      for (let i = 0; i < 3; i++) ok(await service.ask({ botId: id, question: `¿Hay SOAT número ${i}?`, sessionKey: 'sesion-a' }));
      failed(await service.ask({ botId: id, question: '¿Hay SOAT otra vez?', sessionKey: 'sesion-a' }), ExchangeStatus.LIMITED);
      expect(bots.friend.received).toHaveLength(3);
      ok(await service.ask({ botId: id, question: '¿Hay SOAT en otra sesión?', sessionKey: 'sesion-b' }));
      expect((await rows()).map((row) => row.estado)).toEqual(['ok', 'ok', 'ok', 'limite', 'ok']);
    });

    it('el límite por minuto de cada bot (limite_saliente_minuto)', async () => {
      const id = await createBot(bots.friend.url, { key: bots.friend.key, perMinute: 2 });
      const { service } = makeService();
      ok(await service.ask({ botId: id, question: '¿Hay SOAT uno?' }));
      ok(await service.ask({ botId: id, question: '¿Hay SOAT dos?' }));
      failed(await service.ask({ botId: id, question: '¿Hay SOAT tres?' }), ExchangeStatus.LIMITED);
      expect(bots.friend.received).toHaveLength(2);
    });

    it('2 simultáneas: con dos bots colgados, una tercera llamada se rechaza al instante', async () => {
      const a = await createBot(bots.malicious.urlFor('hang'));
      const b = await createBot(bots.malicious.urlFor('hang'));
      const c = await createBot(bots.friend.url, { key: bots.friend.key });
      const { service } = makeService({ deadlineMs: 1_500 });
      const first = service.ask({ botId: a, question: '¿Hay SOAT uno?' });
      const second = service.ask({ botId: b, question: '¿Hay SOAT dos?' });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const started = Date.now();
      failed(await service.ask({ botId: c, question: '¿Hay SOAT tres?' }), ExchangeStatus.LIMITED);
      expect(Date.now() - started).toBeLessThan(500);
      failed(await first, ExchangeStatus.TIMEOUT);
      failed(await second, ExchangeStatus.TIMEOUT);
      expect(bots.friend.received).toHaveLength(0);
      // Al terminar, el cupo se libera.
      ok(await service.ask({ botId: c, question: '¿Hay SOAT cuatro?' }));
    });

    it('20 por minuto en total', async () => {
      const ids = await Promise.all(Array.from({ length: 21 }, () => createBot(bots.friend.url, { key: bots.friend.key })));
      const { service } = makeService();
      for (const id of ids.slice(0, 20)) ok(await service.ask({ botId: id, question: '¿Hay SOAT?' }));
      failed(await service.ask({ botId: ids[20]!, question: '¿Hay SOAT?' }), ExchangeStatus.LIMITED);
    });
  });

  describe('probar conexión (tarjeta del bot)', () => {
    const test = async (mode: string, service = makeService().service): Promise<ConnectionTest> => {
      bots.malicious.setCardMode(mode);
      const id = await createBot(bots.malicious.urlFor('injection'));
      return service.testConnection(id);
    };

    it('card-ok: lee la tarjeta y no avisa de nada', async () => {
      expect(await test('card-ok')).toMatchObject({ ok: true, name: 'Bot Raro Pero Correcto', originMismatch: false });
    });

    it('card-other-origin: la `url` de la tarjeta es de otro origen y se AVISA (las tareas siguen yendo a la URL registrada)', async () => {
      const result = await test('card-other-origin');
      expect(result).toMatchObject({ ok: true, originMismatch: true });
    });

    it('card-injection: nombre y descripción quedan como texto plano corto, sin llegar al modelo', async () => {
      const result = (await test('card-injection')) as Extract<ConnectionTest, { ok: true }>;
      expect(result.ok).toBe(true);
      expect(result.name.length).toBeLessThanOrEqual(80);
      expect(result.description.length).toBeLessThanOrEqual(200);
      expect(result.skills.length).toBeLessThanOrEqual(10);
      expect(JSON.stringify(result)).not.toMatch(/[<>]/);
    });

    it.each([
      ['card-huge', ExchangeStatus.INVALID_RESPONSE],
      ['card-broken', ExchangeStatus.INVALID_RESPONSE],
      ['card-slow', ExchangeStatus.TIMEOUT],
      ['card-redirect', ExchangeStatus.INVALID_RESPONSE],
    ])('%s → %s, sin detalles', async (mode, status) => {
      const result = await test(mode);
      expect(result).toEqual({ ok: false, status, message: PUBLIC_MESSAGES[status] });
      expect(bots.malicious.hits.internal).toBe(0);
    });

    it('un destino prohibido se reporta por categoría, sin decir cuál era ni por qué', async () => {
      const id = await createBot('https://10.0.0.5/a2a');
      const result = await makeService().service.testConnection(id);
      expect(result).toEqual({ ok: false, status: ExchangeStatus.SSRF_BLOCKED, message: PUBLIC_MESSAGES[ExchangeStatus.SSRF_BLOCKED] });
      expect(await makeService().service.testConnection(9999)).toMatchObject({ ok: false, status: ExchangeStatus.REJECTED });
    });

    it('máximo 5 por minuto en total: no sirve de escáner de red', async () => {
      const { service } = makeService();
      const id = await createBot(bots.friend.url);
      for (let i = 0; i < 5; i++) expect((await service.testConnection(id)).ok).toBe(true);
      expect(await service.testConnection(id)).toEqual({ ok: false, status: ExchangeStatus.LIMITED, message: PUBLIC_MESSAGES[ExchangeStatus.LIMITED] });
    });
  });
});
