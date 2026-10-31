import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedBot } from '../../mcp/gateway/bot-gateway.service.js';
import type { A2aContractSkill } from '../a2a.config.js';

/** Respuesta con la forma del contrato (sección 4): `status`, `code`, `message`, `answer`, `data`. */
export interface ContractReply {
  http: 200 | 400 | 403 | 404 | 409 | 503;
  status: 'completed' | 'rejected' | 'needs_clarification' | 'error';
  code: string | null;
  message: string;
  answer?: string;
  data?: object;
}

export interface ContractRequest {
  bot: AuthenticatedBot;
  params: Record<string, unknown>;
  /** Cabecera `Idempotency-Key` ya validada, o `undefined` si no vino. */
  idempotencyKey: string | undefined;
}

export type ContractHandler = (request: ContractRequest) => Promise<ContractReply>;

/**
 * Quién resuelve cada habilidad del contrato. El módulo de garantías registra sus manejadores al arrancar: así el
 * canal A2A no importa garantías (evita una dependencia circular) y una habilidad sin manejador responde «error».
 */
@Injectable()
export class ContractSkillRegistry {
  private readonly handlers = new Map<A2aContractSkill, ContractHandler>();

  register(skill: A2aContractSkill, handler: ContractHandler): void {
    this.handlers.set(skill, handler);
  }

  get(skill: A2aContractSkill): ContractHandler | undefined {
    return this.handlers.get(skill);
  }
}

/** De 1 a 79 caracteres visibles, sin espacios (contrato, sección 4). */
export const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,79}$/;

const MAX_ENTRIES = 1_000;
const TTL_MS = 24 * 3_600_000;

type Lookup = { kind: 'miss' } | { kind: 'hit'; reply: ContractReply } | { kind: 'conflict' };

/**
 * Idempotencia de las habilidades que escriben. En memoria y acotada: repetir la misma petición con la misma clave
 * devuelve el resultado original; la misma clave con otro contenido es un conflicto. Si el proceso reinicia, la
 * garantía contra duplicados la da la propia regla (un caso ya decidido no se decide dos veces).
 */
export class IdempotencyStore {
  private readonly entries = new Map<string, { hash: string; reply: ContractReply; at: number }>();

  static hashOf(skill: string, params: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify([skill, Object.entries(params).sort(([a], [b]) => a.localeCompare(b))])).digest('hex');
  }

  lookup(botId: number, key: string, hash: string): Lookup {
    const entry = this.entries.get(`${botId}:${key}`);
    if (!entry || Date.now() - entry.at > TTL_MS) return { kind: 'miss' };
    return entry.hash === hash ? { kind: 'hit', reply: entry.reply } : { kind: 'conflict' };
  }

  save(botId: number, key: string, hash: string, reply: ContractReply): void {
    if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(`${botId}:${key}`, { hash, reply, at: Date.now() });
  }
}
