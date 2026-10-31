import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

/** VIN y datos de ficha técnica de un vehículo. Tabla aparte: no modifica `vehiculos`. */
@Entity('fichas_vin')
@Check('CHK_fichas_vin_vin', `"vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'`)
@Check('CHK_fichas_vin_puertas', '"puertas" BETWEEN 2 AND 5')
export class FichaVin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'vin', type: 'char', length: 17, unique: true })
  vin: string;

  @Column({ name: 'vehiculo_id', type: 'int', unique: true })
  vehicleId: number;

  @OneToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Relation<Vehicle>;

  @Column({ name: 'carroceria', type: 'varchar', length: 30 })
  bodyType: string;

  @Column({ name: 'puertas', type: 'smallint' })
  doors: number;
}
