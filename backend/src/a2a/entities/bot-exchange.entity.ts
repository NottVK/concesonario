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

@Entity('intercambios_bots')
export class BotExchange {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'bot_id', type: 'int' })
  botId: number;

  @ManyToOne(() => ExternalBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bot_id' })
  bot: Relation<ExternalBot>;

  @Column({ name: 'direccion', type: 'enum', enum: ExchangeDirection, enumName: 'direccion_intercambio_enum' })
  direction: ExchangeDirection;

  @Column({ name: 'pregunta', type: 'text' })
  question: string;

  @Column({ name: 'respuesta', type: 'text', nullable: true })
  answer: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
