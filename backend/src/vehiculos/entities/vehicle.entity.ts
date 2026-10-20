import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 1 })
  @Index()
  @Column({ name: 'marca_id', type: 'int' })
  brandId: number;

  @ApiProperty({ type: () => Brand, required: false, description: 'Viene en listados y detalle' })
  @ManyToOne(() => Brand, (brand) => brand.vehicles, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  brand: Relation<Brand>;

  @ApiProperty({ example: 'Corolla' })
  @Column({ name: 'modelo', type: 'varchar', length: 80 })
  model: string;

  @ApiProperty({ example: 2024 })
  @Index()
  @Column({ name: 'anio', type: 'int' })
  year: number;

  @ApiProperty({ example: 'XEI' })
  @Column({ name: 'version', type: 'varchar', length: 80 })
  version: string;

  /** Precio en COP; `numeric` llega como string para no perder precisión. */
  @ApiProperty({ example: '95000000.00', description: 'Precio en COP, texto con 2 decimales' })
  @Index()
  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2 })
  price: string;

  @ApiProperty({ example: 0, description: 'Kilometraje' })
  @Column({ name: 'km', type: 'int', default: 0 })
  mileage: number;

  @ApiProperty({ enum: FuelType })
  @Column({ name: 'combustible', type: 'enum', enum: FuelType, enumName: 'combustible_enum' })
  fuel: FuelType;

  @ApiProperty({ enum: Transmission })
  @Column({ name: 'transmision', type: 'enum', enum: Transmission, enumName: 'transmision_enum' })
  transmission: Transmission;

  @ApiProperty({ example: 'Blanco' })
  @Column({ name: 'color', type: 'varchar', length: 40 })
  color: string;

  @ApiProperty({ enum: VehicleStatus })
  @Index()
  @Column({
    name: 'estado',
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'estado_vehiculo_enum',
    default: VehicleStatus.NEW,
  })
  status: VehicleStatus;

  @ApiProperty({ type: String, nullable: true })
  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ type: [String], example: ['/autos/toyota-corolla.webp'] })
  @Column({ name: 'imagenes', type: 'text', array: true, default: () => "'{}'" })
  images: string[];

  /** Control de ediciones simultáneas: PUT debe traer la revisión leída; vender el vehículo también la sube. */
  @ApiProperty({ example: 1, description: 'Revisión para detectar ediciones simultáneas (no es la versión comercial)' })
  @Column({ name: 'revision', type: 'int', default: 1 })
  revision: number;

  /** Vector de 768 dimensiones (nomic-embed-text); se llena en la fase del chatbot. Oculto en la API. */
  @Column({ name: 'embedding', type: 'vector', length: 768, nullable: true, select: false })
  embedding: string | null;
}
