import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Propuesta de cita armada por el servidor (nunca por el modelo). De un solo uso: se consume con un UPDATE
 * atómico al confirmar. No lleva datos personales; esos entran solo en el formulario de confirmación.
 */
@Entity('chat_propuestas_cita')
export class AppointmentProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'sesion_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'vehiculo_id', type: 'int' })
  vehicleId: number;

  @Column({ name: 'etiqueta', type: 'varchar', length: 160 })
  vehicleLabel: string;

  @Column({ name: 'inicia_en', type: 'timestamptz' })
  startsAt: Date;

  /** Resumen mostrado al usuario, escrito por el servidor. */
  @Column({ name: 'resumen', type: 'text' })
  summary: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'vence_en', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'usada_en', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'cita_id', type: 'int', nullable: true })
  appointmentId: number | null;
}
