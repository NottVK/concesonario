import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ConversationRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  /** Reservado por la migración inicial; el chat nunca guarda resultados de tools. */
  TOOL = 'tool',
}

/** Solo mensajes `user` y `assistant`, ya redactados (sin correos, teléfonos ni documentos). */
@Entity('conversaciones')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'sesion_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'rol', type: 'enum', enum: ConversationRole, enumName: 'rol_conversacion_enum' })
  role: ConversationRole;

  @Column({ name: 'mensaje', type: 'text' })
  message: string;

  /** Versión del prompt de sistema con el que se respondió (solo mensajes del asistente). */
  @Column({ name: 'version_prompt', type: 'varchar', length: 20, nullable: true })
  promptVersion: string | null;

  @Column({ name: 'modelo', type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
