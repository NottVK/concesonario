import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type WarrantyPlan = 'todo' | 'tren_motriz';

/**
 * Relación cliente–vehículo del concesionario (decisión 130): el `id_relacion` (REL-1001) que el taller recibe en vez
 * de la cédula y el VIN sueltos. La cédula, el nombre y el teléfono van cifrados juntos (AES-256-GCM, atados a la fila);
 * para buscar por cédula se guarda solo su HMAC.
 */
@Entity('relaciones')
@Index('UQ_relaciones_cedula_vin', ['cedulaHmac', 'vin'], { unique: true })
export class Relationship {
  @PrimaryColumn({ name: 'id_relacion', type: 'varchar', length: 12 })
  id: string;

  @Column({ name: 'vin', type: 'char', length: 17 })
  vin: string;

  @Column({ name: 'cedula_hmac', type: 'char', length: 64 })
  cedulaHmac: string;

  /** `enc:v2:…` con { cedula, nombre, telefono }; solo se descifra para responderle al taller. */
  @Column({ name: 'contacto_cifrado', type: 'text' })
  encryptedContact: string;

  @Column({ name: 'placa', type: 'varchar', length: 10 })
  plate: string;

  @Column({ name: 'kilometraje', type: 'int' })
  mileage: number;

  /** AAAA-MM-DD (el driver de PostgreSQL entrega `date` como texto). */
  @Column({ name: 'fecha_venta', type: 'date' })
  saleDate: string;

  @Column({ name: 'plan_garantia', type: 'varchar', length: 20 })
  plan: WarrantyPlan;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
