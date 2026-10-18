import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Brand } from '../../marcas/entities/brand.entity.js';

export enum FuelType {
  GASOLINE = 'gasolina',
  DIESEL = 'diesel',
  HYBRID = 'hibrido',
  ELECTRIC = 'electrico',
}

export enum Transmission {
  MANUAL = 'manual',
  AUTOMATIC = 'automatica',
}

export enum VehicleStatus {
  NEW = 'nuevo',
  USED = 'usado',
  SOLD = 'vendido',
}

@Entity('vehiculos')
@Check('CHK_vehiculos_precio', '"precio" > 0')
@Check('CHK_vehiculos_km', '"km" >= 0')
@Check('CHK_vehiculos_anio', '"anio" BETWEEN 1990 AND 2100')
@Index(['brandId', 'model', 'year', 'version'], { unique: true })
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'marca_id', type: 'int' })
  brandId: number;

  @ManyToOne(() => Brand, (brand) => brand.vehicles, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  brand: Relation<Brand>;

  @Column({ name: 'modelo', type: 'varchar', length: 80 })
  model: string;

  @Index()
  @Column({ name: 'anio', type: 'int' })
  year: number;

  @Column({ name: 'version', type: 'varchar', length: 80 })
  version: string;

  /** Precio en COP; `numeric` llega como string para no perder precisión. */
  @Index()
  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2 })
  price: string;

  @Column({ name: 'km', type: 'int', default: 0 })
  mileage: number;

  @Column({ name: 'combustible', type: 'enum', enum: FuelType, enumName: 'combustible_enum' })
  fuel: FuelType;

  @Column({ name: 'transmision', type: 'enum', enum: Transmission, enumName: 'transmision_enum' })
  transmission: Transmission;

  @Column({ name: 'color', type: 'varchar', length: 40 })
  color: string;

  @Index()
  @Column({
    name: 'estado',
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'estado_vehiculo_enum',
    default: VehicleStatus.NEW,
  })
  status: VehicleStatus;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'imagenes', type: 'text', array: true, default: () => "'{}'" })
  images: string[];

  /** Vector de 768 dimensiones (nomic-embed-text); se llena en la fase del chatbot. */
  @Column({ name: 'embedding', type: 'vector', length: 768, nullable: true, select: false })
  embedding: string | null;
}
