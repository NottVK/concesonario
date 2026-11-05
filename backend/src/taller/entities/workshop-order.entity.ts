import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Copia local de una orden de trabajo agendada en el taller (decisión 130). La orden real vive en el taller; aquí
 * queda lo necesario para seguirla y avisarle al cliente.
 */
@Entity('ordenes_taller')
export class WorkshopOrder {
  /** Código del taller (OT-0001). */
  @PrimaryColumn({ name: 'codigo', type: 'varchar', length: 20 })
  code: string;

  @Index('IDX_ordenes_taller_relacion')
  @Column({ name: 'id_relacion', type: 'varchar', length: 12 })
  relationId: string;

  @Column({ name: 'sede_codigo', type: 'varchar', length: 20 })
  siteCode: string;

  @Column({ name: 'sede_nombre', type: 'varchar', length: 120 })
  siteName: string;

  @Column({ name: 'fecha_cita', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'estado', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'por_garantia', type: 'boolean', default: false })
  warrantyClaim: boolean;

  /** `simulado` (taller simulado de desarrollo) o `taller` (el MCP real). */
  @Column({ name: 'origen', type: 'varchar', length: 12 })
  source: 'simulado' | 'taller';

  /** Nota (saneada) del último cambio de estado que avisó el taller con `notificar_estado_vehiculo` (decisión 134). */
  @Column({ name: 'ultima_nota', type: 'varchar', length: 300, nullable: true })
  lastNote: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  updatedAt: Date;
}
