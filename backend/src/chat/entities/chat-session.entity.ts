import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Sesión anónima del chat. Solo se guarda el sha256 del token: el token real vive en el navegador. */
@Entity('chat_sesiones')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ name: 'ultima_actividad', type: 'timestamptz', default: () => 'now()' })
  lastActivityAt: Date;

  /** Cuándo empezó el último turno; sirve para exigir una pausa mínima entre mensajes. */
  @Column({ name: 'ultimo_turno_en', type: 'timestamptz', nullable: true })
  lastTurnAt: Date | null;

  @Column({ name: 'turnos', type: 'int', default: 0 })
  turns: number;

  /** Ids de vehículos que el bot ya mostró en esta sesión: solo esos puede usar una tool. */
  @Column({ name: 'vehiculos_vistos', type: 'int', array: true, default: () => "'{}'" })
  seenVehicleIds: number[];
}
