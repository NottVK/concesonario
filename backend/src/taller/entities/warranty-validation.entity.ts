import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Una línea del resultado: la que se le envía al taller con `registrar_resultado_garantia`. */
export interface WarrantyLineResult {
  tarea_id: string | number;
  valida: boolean;
  motivo: string;
}

/**
 * Lo que AutoMax respondió a `validar_garantia` de una orden del taller (decisión 134) y si ya se le envió. Una fila
 * por orden: si el taller vuelve a pedir la validación, se recalcula y se reenvía con el mismo id_mensaje.
 */
@Entity('validaciones_garantia')
export class WarrantyValidation {
  @PrimaryColumn({ name: 'codigo', type: 'varchar', length: 20 })
  code: string;

  @Column({ name: 'id_relacion', type: 'varchar', length: 12 })
  relationId: string;

  @Column({ name: 'resultados', type: 'jsonb' })
  results: WarrantyLineResult[];

  @Column({ name: 'id_mensaje', type: 'varchar', length: 80 })
  messageId: string;

  @Column({ name: 'estado_envio', type: 'varchar', length: 12, default: 'pendiente' })
  sendStatus: 'pendiente' | 'enviado' | 'fallido';

  @Column({ name: 'intentos', type: 'smallint', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  updatedAt: Date;
}
