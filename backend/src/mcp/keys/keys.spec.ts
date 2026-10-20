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

describe('SecretBox (AES-256-GCM)', () => {
  const box = new SecretBox(Buffer.alloc(32, 1));

  it('cifra y descifra; cada cifrado es distinto y no contiene el texto', () => {
    const a = box.encrypt('clave-saliente-123');
    const b = box.encrypt('clave-saliente-123');
    expect(a).not.toBe(b);
    expect(a.startsWith('enc:v1:')).toBe(true);
    expect(a).not.toContain('clave-saliente-123');
    expect(box.decrypt(a)).toBe('clave-saliente-123');
    expect(SecretBox.isEncrypted(a)).toBe(true);
    expect(SecretBox.isEncrypted('clave-saliente-123')).toBe(false);
  });

  it('un valor alterado, en claro o cifrado con otra clave falla con un error genérico', () => {
    const stored = box.encrypt('secreto');
    const parts = stored.split(':');
    const tampered = [...parts.slice(0, -1), `${parts.at(-1)!.slice(0, -2)}AA`].join(':');
    const other = new SecretBox(Buffer.alloc(32, 2));
    for (const bad of [tampered, 'en-claro', 'enc:v1:', 'enc:v1:a:b', other.encrypt('secreto')]) {
      expect(() => box.decrypt(bad)).toThrow('No se pudo descifrar la clave guardada');
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
