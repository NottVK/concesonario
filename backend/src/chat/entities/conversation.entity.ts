import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ConversationRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}

@Entity('conversaciones')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'sesion_id', type: 'varchar', length: 64 })
  sessionId: string;

  @Column({ name: 'rol', type: 'enum', enum: ConversationRole, enumName: 'rol_conversacion_enum' })
  role: ConversationRole;

  @Column({ name: 'mensaje', type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
