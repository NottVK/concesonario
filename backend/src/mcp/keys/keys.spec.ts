import { createCipheriv, randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import type { ExternalBot } from '../../a2a/entities/external-bot.entity.js';
import { loadMcpSecrets, MCP_DEFAULTS } from '../mcp.config.js';
import type { McpSecrets } from '../mcp.config.js';
import { BotKeysService, KEY_FORMAT } from './bot-keys.service.js';
import { SecretBox } from './secret-box.js';

const PEPPER = 'p'.repeat(40);
const HEX_KEY = 'ab'.repeat(32);

describe('loadMcpSecrets: el servidor no arranca sin el pepper ni la clave AES', () => {
  const valid = { MCP_KEY_PEPPER: PEPPER, BOT_KEY_ENCRYPTION_KEY: HEX_KEY };

  it('acepta valores válidos (clave en hexadecimal o en base64)', () => {
    const secrets = loadMcpSecrets(valid);
    expect(secrets.pepper).toBe(PEPPER);
    expect(secrets.pepperVersion).toBe(1);
    expect(secrets.encryptionKey).toHaveLength(32);
    const base64 = Buffer.alloc(32, 7).toString('base64');
    expect(loadMcpSecrets({ ...valid, BOT_KEY_ENCRYPTION_KEY: base64 }).encryptionKey.equals(Buffer.alloc(32, 7))).toBe(true);
    expect(loadMcpSecrets({ ...valid, BOT_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64url') }).encryptionKey).toHaveLength(32);
  });

  it('falla si falta MCP_KEY_PEPPER o BOT_KEY_ENCRYPTION_KEY, y el mensaje nombra la variable', () => {
    expect(() => loadMcpSecrets({ BOT_KEY_ENCRYPTION_KEY: HEX_KEY })).toThrow(/MCP_KEY_PEPPER/);
    expect(() => loadMcpSecrets({ MCP_KEY_PEPPER: PEPPER })).toThrow(/BOT_KEY_ENCRYPTION_KEY/);
    expect(() => loadMcpSecrets({})).toThrow(/MCP_KEY_PEPPER/);
    expect(() => loadMcpSecrets({ MCP_KEY_PEPPER: '   ', BOT_KEY_ENCRYPTION_KEY: HEX_KEY })).toThrow(/MCP_KEY_PEPPER/);
  });

  it('rechaza valores débiles o de ejemplo, sin imprimirlos', () => {
    const attempts: [Record<string, string>, RegExp][] = [
      [{ ...valid, MCP_KEY_PEPPER: 'corto' }, /al menos 32/],
      [{ ...valid, MCP_KEY_PEPPER: 'cambia_esto_por_un_secreto_aleatorio_de_32_o_mas_caracteres' }, /valor de ejemplo/],
      [{ ...valid, BOT_KEY_ENCRYPTION_KEY: 'cambia_esto_por_64_caracteres_hexadecimales' }, /valor de ejemplo/],
      [{ ...valid, BOT_KEY_ENCRYPTION_KEY: 'ab'.repeat(16) }, /32 bytes/],
      [{ ...valid, BOT_KEY_ENCRYPTION_KEY: 'zz'.repeat(32) }, /32 bytes/],
      [{ ...valid, MCP_KEY_PEPPER_VERSION: '0' }, /MCP_KEY_PEPPER_VERSION/],
      [{ ...valid, MCP_KEY_PEPPER_VERSION: 'x' }, /MCP_KEY_PEPPER_VERSION/],
      [{ ...valid, MCP_KEY_PEPPER_PREVIOUS: PEPPER }, /no puede ser igual/],
      [{ ...valid, MCP_KEY_PEPPER_PREVIOUS: 'corto' }, /al menos 32/],
    ];
    for (const [env, pattern] of attempts) {
      let message = '';
      try {
        loadMcpSecrets(env);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(Object.keys(env))).toMatch(pattern);
      for (const value of Object.values(env)) if (value.length > 12) expect(message).not.toContain(value);
    }
  });

  it('los valores por defecto son los aprobados', () => {
    expect(MCP_DEFAULTS).toMatchObject({
      botPerMinute: 30, botPerDay: 2000, ipPerMinute: 60, ipConcurrent: 5, lockoutFailures: 10, globalPerMinute: 600,
      maxBodyBytes: 16_384, maxResponseBytes: 4_096, maxResults: 10, defaultResults: 5, maxTextChars: 60,
      headersTimeoutMs: 10_000, requestTimeoutMs: 15_000, keepAliveTimeoutMs: 5_000, argsSummaryMaxChars: 200, auditRetentionDays: 90,
    });
    expect(MCP_DEFAULTS.lockoutWindowMs).toBe(5 * 60_000);
    expect(MCP_DEFAULTS.lockoutDurationMs).toBe(15 * 60_000);
  });
});

describe('SecretBox (AES-256-GCM con AAD)', () => {
  const keyBytes = Buffer.alloc(32, 1);
  const box = new SecretBox(keyBytes);
  const aad = SecretBox.aadFor(7, 'https://bot.ejemplo.com/a2a');

  /** Un valor `enc:v1` como lo escribía la Fase 5 (sin AAD). */
  const legacyV1 = (plain: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBytes, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
  };

  it('cifra y descifra; cada cifrado es distinto y no contiene el texto', () => {
    const a = box.encrypt('clave-saliente-123', aad);
    const b = box.encrypt('clave-saliente-123', aad);
    expect(a).not.toBe(b);
    expect(a.startsWith('enc:v2:')).toBe(true);
    expect(a).not.toContain('clave-saliente-123');
    expect(box.decrypt(a, aad)).toBe('clave-saliente-123');
    expect(SecretBox.isEncrypted(a)).toBe(true);
    expect(SecretBox.isEncrypted('clave-saliente-123')).toBe(false);
  });

  it('el AAD ata el valor a la fila y al origen: otro id, otro origen, otro esquema u otro puerto no descifran', () => {
    const stored = box.encrypt('secreto', aad);
    const others = [
      SecretBox.aadFor(8, 'https://bot.ejemplo.com/a2a'),
      SecretBox.aadFor(7, 'https://otro.ejemplo.com/a2a'),
      SecretBox.aadFor(7, 'http://bot.ejemplo.com/a2a'),
      SecretBox.aadFor(7, 'https://bot.ejemplo.com:8443/a2a'),
      SecretBox.aadFor(7, null),
      '',
    ];
    for (const other of others) expect(() => box.decrypt(stored, other)).toThrow('No se pudo descifrar la clave guardada');
    // La ruta no cuenta, solo el origen; y las mayúsculas del host se normalizan.
    expect(box.decrypt(stored, SecretBox.aadFor(7, 'https://BOT.ejemplo.com/otra/ruta?x=1'))).toBe('secreto');
  });

  it('exige AAD al cifrar', () => {
    expect(() => box.encrypt('secreto', '')).toThrow(/AAD/);
  });

  it('lee el formato enc:v1 heredado (sin AAD) y reporta su versión', () => {
    const old = legacyV1('clave-vieja-123');
    expect(SecretBox.versionOf(old)).toBe(1);
    expect(SecretBox.versionOf(box.encrypt('x', aad))).toBe(2);
    expect(SecretBox.versionOf('en-claro')).toBeNull();
    expect(box.decrypt(old, aad)).toBe('clave-vieja-123');
  });

  it('un valor alterado, en claro o cifrado con otra clave falla con un error genérico', () => {
    const stored = box.encrypt('secreto', aad);
    const parts = stored.split(':');
    const tampered = [...parts.slice(0, -1), `${parts.at(-1)!.slice(0, -2)}AA`].join(':');
    const other = new SecretBox(Buffer.alloc(32, 2));
    const [iv, tag, data] = stored.slice('enc:v2:'.length).split(':');
    const malformed = [
      `enc:v2:${iv}:${tag}`, // faltan segmentos
      `enc:v2:${iv}:${tag}:${data}:extra`, // sobran
      `enc:v2:${iv}=:${tag}:${data}`, // base64url no canónico
      `enc:v2:${Buffer.alloc(8).toString('base64url')}:${tag}:${data}`, // IV de 8 bytes
      `enc:v2:${iv}:${Buffer.alloc(8).toString('base64url')}:${data}`, // etiqueta de 8 bytes
      `enc:v2:${iv}:${tag}:`, // texto cifrado vacío
      `enc:v2:${iv}:${tag}:!!!`,
      `enc:v1:${iv}:${tag}:${data}`, // un v2 disfrazado de v1 (se descifra sin AAD y falla)
    ];
    for (const bad of [tampered, 'en-claro', 'enc:v2:', 'enc:v2:a:b', 'enc:v3:a:b:c', other.encrypt('secreto', aad), ...malformed]) {
      expect(() => box.decrypt(bad, aad)).toThrow('No se pudo descifrar la clave guardada');
    }
    expect(() => new SecretBox(Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe('keys de los bots', () => {
  const secrets: McpSecrets = { pepper: PEPPER, pepperVersion: 2, pepperPrevious: 'q'.repeat(40), encryptionKey: Buffer.alloc(32, 3) };
  const service = new BotKeysService({} as Repository<ExternalBot>, secrets);

  it('generate: formato amx_<8 hex>_<43>, con 256 bits aleatorios distintos cada vez', () => {
    const a = BotKeysService.generate();
    const b = BotKeysService.generate();
    expect(a.key).toMatch(KEY_FORMAT);
    expect(KEY_FORMAT.exec(a.key)![1]).toBe(a.prefix);
    expect(a.key).not.toBe(b.key);
    expect(a.key).toHaveLength(56);
  });

  it('hash: HMAC-SHA256 en hexadecimal que depende del pepper y de su versión', () => {
    const { key } = BotKeysService.generate();
    const current = service.hash(key);
    expect(current).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hash(key)).toBe(current);
    expect(service.hash(key, 1)).not.toBe(current); // pepper anterior
    expect(service.hash(`${key}x`)).not.toBe(current);
    expect(current).not.toContain(key);
  });

  it('el formato rechaza keys mal formadas', () => {
    for (const bad of ['', 'amx_', 'amx_zzzzzzzz_' + 'A'.repeat(43), `amx_12345678_${'A'.repeat(42)}`, `amx_12345678_${'A'.repeat(44)}`, ` amx_12345678_${'A'.repeat(43)}`, `AMX_12345678_${'A'.repeat(43)}`]) {
      expect(KEY_FORMAT.test(bad), bad).toBe(false);
    }
  });
});
