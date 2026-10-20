import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Like, QueryFailedError, Repository } from 'typeorm';
import { ExternalBot } from '../../a2a/entities/external-bot.entity.js';
import { MCP_SECRETS } from '../mcp.config.js';
import type { McpSecrets } from '../mcp.config.js';
import { originOf, SecretBox } from './secret-box.js';

/** `amx_<prefijo 8 hex>_<32 bytes aleatorios en base64url>`. El prefijo NO es secreto: solo localiza la fila. */
export const KEY_FORMAT = /^amx_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;
/** Las keys miden 56 caracteres; lo que sea mucho más largo ni se mira. */
const MAX_CANDIDATE_CHARS = 120;
/** Prefijo que ninguna key real puede tener (no es hexadecimal): se busca cuando la key viene mal formada. */
const NO_PREFIX = 'zzzzzzzz';
const DUMMY_HASH = '0'.repeat(64);
const PREFIX_RETRIES = 5;
const LAST_USE_REFRESH_MS = 60_000;

export interface BotView {
  id: number;
  name: string;
  url: string | null;
  active: boolean;
  keyPrefix: string | null;
  hasKey: boolean;
  hasOutboundKey: boolean;
  lastUsedAt: Date | null;
  keyRotatedAt: Date | null;
  limitPerMinute: number;
  limitPerDay: number;
  createdAt: Date;
}

export interface CreateBotInput {
  name: string;
  url?: string;
  limitPerMinute?: number;
  limitPerDay?: number;
  outboundApiKey?: string;
}

export interface UpdateBotInput {
  active?: boolean;
  url?: string | null;
  limitPerMinute?: number;
  limitPerDay?: number;
  outboundApiKey?: string | null;
}

export type VerifyResult =
  | { ok: true; bot: { id: number; name: string; limitPerMinute: number; limitPerDay: number } }
  | { ok: false; reason: 'invalid' | 'inactive'; botId?: number; prefix?: string };

const VIEW_COLUMNS = {
  id: true, name: true, url: true, active: true, keyPrefix: true, keyHash: true, outboundApiKey: true,
  lastUsedAt: true, keyRotatedAt: true, limitPerMinute: true, limitPerDay: true, createdAt: true,
} as const;

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as { code?: string; constraint?: string };
  return driver.code === '23505' && (constraint === undefined || driver.constraint === constraint);
}

/**
 * Keys de los bots que consultan a AutoMax por MCP. La key en claro se muestra UNA vez (al crear o rotar) y no se
 * puede recuperar: en la base solo hay su prefijo y un HMAC-SHA256 con pepper. La comparación es en tiempo constante
 * y por el mismo camino aunque la key sea falsa, esté mal formada o el bot no exista.
 */
@Injectable()
export class BotKeysService implements OnModuleInit {
  private readonly logger = new Logger(BotKeysService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectRepository(ExternalBot) private readonly bots: Repository<ExternalBot>,
    @Inject(MCP_SECRETS) private readonly secrets: McpSecrets,
  ) {
    this.box = new SecretBox(secrets.encryptionKey);
  }

  /** Al arrancar, pasa las keys salientes `enc:v1` (sin AAD) a `enc:v2`. Un fallo se registra y no impide arrancar. */
  async onModuleInit(): Promise<void> {
    try {
      const upgraded = await this.upgradeLegacyKeys();
      if (upgraded > 0) this.logger.log(`Keys salientes migradas a enc:v2: ${upgraded}`);
    } catch (error) {
      this.logger.error(`No se pudieron migrar las keys salientes a enc:v2: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }

  /** Re-cifra con AAD las keys `enc:v1` que tengan URL (sin URL no hay origen al que atarlas). Devuelve cuántas migró. */
  async upgradeLegacyKeys(): Promise<number> {
    const rows = await this.bots.find({ where: { outboundApiKey: Like('enc:v1:%') }, select: { id: true, url: true, outboundApiKey: true } });
    let upgraded = 0;
    for (const row of rows) {
      if (row.url && row.outboundApiKey && (await this.upgradeOne(row.id, row.url, row.outboundApiKey))) upgraded++;
    }
    return upgraded;
  }

  /** Re-cifra una key v1 con la condición de que siga siendo la misma (si alguien la cambió mientras tanto, no pisa). */
  private async upgradeOne(id: number, url: string, stored: string): Promise<boolean> {
    const aad = SecretBox.aadFor(id, url);
    const result = await this.bots.update({ id, outboundApiKey: stored }, { outboundApiKey: this.box.encrypt(this.box.decrypt(stored, aad), aad) });
    return (result.affected ?? 0) > 0;
  }

  /** Key nueva (con prefijo al azar). */
  static generate(): { key: string; prefix: string } {
    const prefix = randomBytes(4).toString('hex');
    return { key: `amx_${prefix}_${randomBytes(32).toString('base64url')}`, prefix };
  }

  private pepperFor(version: number): string | null {
    if (version === this.secrets.pepperVersion) return this.secrets.pepper;
    if (version === this.secrets.pepperVersion - 1) return this.secrets.pepperPrevious;
    return null;
  }

  /** HMAC-SHA256 de la key con el pepper de esa versión (hexadecimal). */
  hash(key: string, version = this.secrets.pepperVersion): string {
    const pepper = this.pepperFor(version) ?? this.secrets.pepper;
    return createHmac('sha256', pepper).update(key).digest('hex');
  }

  async list(): Promise<BotView[]> {
    const rows = await this.bots.find({ select: VIEW_COLUMNS, order: { id: 'ASC' } });
    return rows.map((row) => this.toView(row));
  }

  async create(input: CreateBotInput): Promise<{ bot: BotView; apiKey: string }> {
    if (input.outboundApiKey && !input.url) throw new BadRequestException('La key saliente exige la url del bot (queda atada a su origen)');
    for (let attempt = 0; attempt < PREFIX_RETRIES; attempt++) {
      const { key, prefix } = BotKeysService.generate();
      try {
        // Guardar y leer la vista van en UNA transacción: si algo falla después de guardar, no queda un bot con una key
        // que nadie vio (se deshace todo y el error llega al admin, que puede reintentar).
        const bot = await this.bots.manager.transaction(async (manager) => {
          const repo = manager.getRepository(ExternalBot);
          const saved = await repo.save(
            repo.create({
              name: input.name,
              url: input.url ?? null,
              keyPrefix: prefix,
              keyHash: this.hash(key),
              pepperVersion: this.secrets.pepperVersion,
              keyRotatedAt: new Date(),
              ...(input.limitPerMinute ? { limitPerMinute: input.limitPerMinute } : {}),
              ...(input.limitPerDay ? { limitPerDay: input.limitPerDay } : {}),
            }),
          );
          // El AAD lleva el id de la fila, que solo existe después de guardar: la key saliente se cifra en este segundo paso.
          if (input.outboundApiKey) {
            await repo.update({ id: saved.id }, { outboundApiKey: this.box.encrypt(input.outboundApiKey, SecretBox.aadFor(saved.id, input.url!)) });
          }
          return this.view(saved.id, repo);
        });
        return { bot, apiKey: key };
      } catch (error) {
        if (isUniqueViolation(error, 'UQ_bots_clave_prefijo')) continue;
        if (isUniqueViolation(error)) throw new ConflictException('Ya existe un bot con ese nombre');
        throw error;
      }
    }
    throw new ConflictException('No se pudo generar una key única; intenta de nuevo');
  }

  /** Rotar invalida la key anterior al instante: la nueva reemplaza prefijo y hash en la misma sentencia (y la lectura, en la misma transacción). */
  async rotate(id: number): Promise<{ bot: BotView; apiKey: string }> {
    await this.view(id);
    for (let attempt = 0; attempt < PREFIX_RETRIES; attempt++) {
      const { key, prefix } = BotKeysService.generate();
      try {
        const bot = await this.bots.manager.transaction(async (manager) => {
          const repo = manager.getRepository(ExternalBot);
          await repo.update(
            { id },
            { keyPrefix: prefix, keyHash: this.hash(key), pepperVersion: this.secrets.pepperVersion, keyRotatedAt: () => 'now()' },
          );
          return this.view(id, repo);
        });
        return { bot, apiKey: key };
      } catch (error) {
        if (!isUniqueViolation(error, 'UQ_bots_clave_prefijo')) throw error;
      }
    }
    throw new ConflictException('No se pudo generar una key única; intenta de nuevo');
  }

  async update(id: number, input: UpdateBotInput): Promise<BotView> {
    await this.view(id);
    const patch: Partial<ExternalBot> = {
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(input.url === undefined ? {} : { url: input.url }),
      ...(input.limitPerMinute === undefined ? {} : { limitPerMinute: input.limitPerMinute }),
      ...(input.limitPerDay === undefined ? {} : { limitPerDay: input.limitPerDay }),
      ...(await this.outboundKeyPatch(id, input)),
    };
    if (Object.keys(patch).length > 0) await this.bots.update({ id }, patch);
    return this.view(id);
  }

  /**
   * Qué pasa con la key saliente al editar: una nueva se cifra atada al id y al origen de la URL resultante; `null` la
   * borra; y si cambia el ORIGEN de la URL sin key nueva, se borra (no se envía una key a un destino que no se le dio).
   */
  private async outboundKeyPatch(id: number, input: UpdateBotInput): Promise<Partial<ExternalBot>> {
    const current = await this.bots.findOne({ where: { id }, select: { id: true, url: true, outboundApiKey: true } });
    const nextUrl = input.url === undefined ? (current?.url ?? null) : input.url;
    if (typeof input.outboundApiKey === 'string') {
      if (!nextUrl) throw new BadRequestException('La key saliente exige la url del bot (queda atada a su origen)');
      return { outboundApiKey: this.box.encrypt(input.outboundApiKey, SecretBox.aadFor(id, nextUrl)) };
    }
    if (input.outboundApiKey === null) return { outboundApiKey: null };
    const moved = input.url !== undefined && originOf(current?.url ?? '') !== originOf(nextUrl ?? '');
    return moved && current?.outboundApiKey ? { outboundApiKey: null } : {};
  }

  /** La key saliente en claro. Solo para uso interno del servidor; nunca sale por la API. Una `enc:v1` se migra al leerla. */
  async outboundKeyOf(id: number): Promise<string | null> {
    const row = await this.bots.findOne({ where: { id }, select: { id: true, url: true, outboundApiKey: true } });
    if (!row?.outboundApiKey) return null;
    const plain = this.box.decrypt(row.outboundApiKey, SecretBox.aadFor(id, row.url));
    if (SecretBox.versionOf(row.outboundApiKey) === 1 && row.url) await this.upgradeOne(id, row.url, row.outboundApiKey);
    return plain;
  }

  /**
   * Comprueba una key presentada. SIEMPRE hace lo mismo (una consulta por prefijo —o por uno inexistente—, un
   * HMAC y una comparación con timingSafeEqual contra el hash guardado o uno de relleno), sea cual sea el motivo
   * del fallo. El motivo solo lo ve quien llama (para auditar); hacia afuera todos los fallos son iguales.
   */
  async verify(candidate: unknown): Promise<VerifyResult> {
    const text = typeof candidate === 'string' ? candidate.slice(0, MAX_CANDIDATE_CHARS) : '';
    const match = text.length <= MAX_CANDIDATE_CHARS ? KEY_FORMAT.exec(text) : null;
    const row = await this.bots.findOne({
      where: { keyPrefix: match?.[1] ?? NO_PREFIX },
      select: { id: true, name: true, active: true, keyHash: true, pepperVersion: true, limitPerMinute: true, limitPerDay: true, lastUsedAt: true },
    });
    const version = row?.pepperVersion ?? this.secrets.pepperVersion;
    const digest = this.hash(text, version);
    const expected = row?.keyHash ?? DUMMY_HASH;
    const equal = timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(expected, 'hex'));
    const pepperKnown = this.pepperFor(version) !== null;
    if (!match || !row || !equal || !pepperKnown) return { ok: false, reason: 'invalid', ...(match ? { prefix: match[1] } : {}) };
    if (!row.active) return { ok: false, reason: 'inactive', botId: row.id, prefix: match[1] };
    await this.afterSuccess(row, text);
    return { ok: true, bot: { id: row.id, name: row.name, limitPerMinute: row.limitPerMinute, limitPerDay: row.limitPerDay } };
  }

  /** Migra el hash al pepper vigente (se tiene la key en claro justo ahora) y refresca «último uso» como mucho una vez por minuto. */
  private async afterSuccess(row: ExternalBot, key: string): Promise<void> {
    if (row.pepperVersion !== this.secrets.pepperVersion) {
      await this.bots.update({ id: row.id, keyHash: row.keyHash ?? undefined }, { keyHash: this.hash(key), pepperVersion: this.secrets.pepperVersion });
    }
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USE_REFRESH_MS) {
      await this.bots.update({ id: row.id }, { lastUsedAt: () => 'now()' });
    }
  }

  private async view(id: number, repo: Repository<ExternalBot> = this.bots): Promise<BotView> {
    const row = await repo.findOne({ where: { id }, select: VIEW_COLUMNS });
    if (!row) throw new NotFoundException(`No existe el bot ${id}`);
    return this.toView(row);
  }

  /** Vista pública campo por campo: nunca el hash, la key saliente ni la entidad completa. */
  private toView(row: ExternalBot): BotView {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      active: row.active,
      keyPrefix: row.keyPrefix,
      hasKey: row.keyHash !== null,
      hasOutboundKey: row.outboundApiKey !== null,
      lastUsedAt: row.lastUsedAt,
      keyRotatedAt: row.keyRotatedAt,
      limitPerMinute: row.limitPerMinute,
      limitPerDay: row.limitPerDay,
      createdAt: row.createdAt,
    };
  }
}
