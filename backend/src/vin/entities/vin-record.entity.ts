import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Registro de VIN del concesionario (decisión 129): los datos de fábrica de un vehículo identificado por su VIN.
 * NO guarda nada del propietario (ni cédula, ni nombre, ni teléfono): el endpoint y el bot que lo leen son públicos.
 */
@Entity('vehiculos_vin')
export class VinRecord {
  @PrimaryColumn({ name: 'vin', type: 'char', length: 17 })
  vin: string;

  @Column({ name: 'marca', type: 'varchar', length: 60 })
  brand: string;

  @Column({ name: 'modelo', type: 'varchar', length: 80 })
  model: string;

  @Column({ name: 'anio', type: 'smallint' })
  year: number;

  @Column({ name: 'version', type: 'varchar', length: 80 })
  version: string;

  @Column({ name: 'carroceria', type: 'varchar', length: 40 })
  bodyType: string;

  @Column({ name: 'puertas', type: 'smallint' })
  doors: number;

  @Column({ name: 'motor', type: 'varchar', length: 60 })
  engine: string;

  @Column({ name: 'combustible', type: 'varchar', length: 30 })
  fuel: string;

  @Column({ name: 'transmision', type: 'varchar', length: 40 })
  transmission: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
