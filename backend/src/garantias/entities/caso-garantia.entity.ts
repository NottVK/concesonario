import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum WarrantyStatus {
  /** Identificado en el chat; aún sin falla reportada. */
  IDENTIFIED = 'identificado',
  /** Garantía vencida por fecha o km; el cliente puede pedir revisión de una persona. */
  EXPIRED = 'vencida',
  /** Pasó el primer filtro (o no se pudo verificar): lo decide el mecánico. */
  PENDING_MECHANIC = 'pendiente_mecanico',
  ACCEPTED = 'aceptada',
  REJECTED = 'rechazada',
}

@Entity('casos_garantia')
@Check('CHK_casos_garantia_estado', `"estado" IN ('identificado','vencida','pendiente_mecanico','aceptada','rechazada')`)
export class CasoGarantia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** id cliente-vehículo (propietarios_vin.id): lo único que viaja a otros servicios. */
  @Index()
  @Column({ name: 'propietario_id', type: 'int' })
  ownerId: number;

  /** Sesión del chat que se identificó (sin FK: el caso sobrevive a la purga de la sesión). */
  @Index()
  @Column({ name: 'sesion_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'estado', type: 'varchar', length: 24, default: WarrantyStatus.IDENTIFIED })
  status: WarrantyStatus;

  /** Falla descrita por el cliente (redactada, sin documentos). */
  @Column({ name: 'falla', type: 'varchar', length: 500, nullable: true })
  fault: string | null;

  /** Motivo mostrado al cliente (vencida, rechazada). */
  @Column({ name: 'motivo', type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  /** Hay piezas o cambios ajenos: no rechaza, lo revisa el mecánico. */
  @Column({ name: 'cambios_ajenos', type: 'boolean', default: false })
  foreignChanges: boolean;

  /** Algún servicio no respondió o respondió mal: «no verificado», lo revisa el mecánico. */
  @Column({ name: 'no_verificado', type: 'boolean', default: false })
  unverified: boolean;

  @Column({ name: 'cita_id', type: 'varchar', length: 80, nullable: true })
  appointmentId: string | null;

  @Column({ name: 'cita_inicio', type: 'timestamptz', nullable: true })
  appointmentAt: Date | null;

  @Column({ name: 'cobro_ref', type: 'varchar', length: 80, nullable: true })
  chargeRef: string | null;

  @Column({ name: 'repuestos', type: 'text', array: true, default: () => "'{}'" })
  parts: string[];

  @Column({ name: 'decidido_por', type: 'int', nullable: true })
  decidedBy: number | null;

  @Column({ name: 'decidido_en', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  updatedAt: Date;
}
