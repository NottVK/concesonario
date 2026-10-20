import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ExternalBot } from './external-bot.entity.js';

export enum ExchangeDirection {
  OUTBOUND = 'saliente',
  INBOUND = 'entrante',
}

export enum ExchangeChannel {
  A2A = 'a2a',
  MCP = 'mcp',
}

export enum ExchangeStatus {
  OK = 'ok',
  VALIDATION_ERROR = 'error_validacion',
  INTERNAL_ERROR = 'error_interno',
  /** Solo canal `a2a` (decisión 117). */
  REJECTED = 'rechazado',
  TIMEOUT = 'timeout',
  REMOTE_ERROR = 'error_remoto',
  SSRF_BLOCKED = 'bloqueado_ssrf',
  INVALID_RESPONSE = 'respuesta_invalida',
  CIRCUIT_OPEN = 'circuito_abierto',
  LIMITED = 'limite',
}

/**
 * Auditoría de lo que intercambian los bots. Canal `mcp`: solo campos estructurados (herramienta, resumen de
 * argumentos YA validados, estado, tamaños), nunca texto libre ni datos personales. Canal `a2a`: pregunta (≤ 200) y
 * respuesta (≤ 600) REDACTADAS y recortadas, con sus hashes y el `peticion_id`; un CHECK de la base lo impone.
 */
@Entity('intercambios_bots')
@Index(['botId', 'createdAt'])
@Index(['createdAt'])
export class BotExchange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bot_id', type: 'int' })
  botId: number;

  @ManyToOne(() => ExternalBot, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bot_id' })
  bot: Relation<ExternalBot>;

  @Column({ name: 'direccion', type: 'enum', enum: ExchangeDirection, enumName: 'direccion_intercambio_enum' })
  direction: ExchangeDirection;

  @Column({ name: 'canal', type: 'enum', enum: ExchangeChannel, enumName: 'canal_intercambio_enum', default: ExchangeChannel.A2A })
  channel: ExchangeChannel;

  /** Obligatoria en `a2a` (redactada, ≤ 200); prohibida en `mcp` (lo garantiza un CHECK de la base). */
  @Column({ name: 'pregunta', type: 'text', nullable: true })
  question: string | null;

  @Column({ name: 'respuesta', type: 'text', nullable: true })
  answer: string | null;

  @Column({ name: 'herramienta', type: 'varchar', length: 40, nullable: true })
  tool: string | null;

  @Column({ name: 'args_resumen', type: 'varchar', length: 200, nullable: true })
  argsSummary: string | null;

  @Column({ name: 'estado', type: 'enum', enum: ExchangeStatus, enumName: 'estado_intercambio_enum', nullable: true })
  status: ExchangeStatus | null;

  @Column({ name: 'duracion_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'bytes_entrada', type: 'int', nullable: true })
  bytesIn: number | null;

  @Column({ name: 'bytes_salida', type: 'int', nullable: true })
  bytesOut: number | null;

  /** Identifica un intercambio `a2a` en los registros; null en `mcp`. */
  @Column({ name: 'peticion_id', type: 'uuid', nullable: true })
  requestId: string | null;

  /** SHA-256 (hex) del texto redactado y normalizado, ANTES de recortarlo. */
  @Column({ name: 'pregunta_hash', type: 'char', length: 64, nullable: true })
  questionHash: string | null;

  @Column({ name: 'respuesta_hash', type: 'char', length: 64, nullable: true })
  answerHash: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
