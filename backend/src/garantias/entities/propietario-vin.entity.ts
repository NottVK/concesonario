import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Propietario de un VIN. El documento NUNCA se guarda: solo su HMAC (ver `documentHash`). El `id` es el «id único
 * cliente-vehículo» que viaja a los demás servicios en lugar del documento.
 */
@Entity('propietarios_vin')
@Index(['documentHash', 'vin'], { unique: true })
@Check('CHK_propietarios_vin_vin', `"vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'`)
export class PropietarioVin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'documento_hash', type: 'char', length: 64 })
  documentHash: string;

  @Column({ name: 'vin', type: 'char', length: 17 })
  vin: string;

  /** Fecha de compra: desde aquí corre la garantía. */
  @Column({ name: 'fecha_compra', type: 'date' })
  purchaseDate: string;
}
