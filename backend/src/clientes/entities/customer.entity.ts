import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('clientes')
export class Customer {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Ana Pérez' })
  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: '300 123 4567' })
  @Column({ name: 'telefono', type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'ana@correo.co', description: 'Siempre en minúsculas' })
  @Column({ name: 'correo', type: 'varchar', length: 120, unique: true })
  email: string;

  /** Sube en uno con cada edición; PUT /clientes/:id debe enviar la que leyó (409 si ya cambió). */
  @ApiProperty({ example: 1, minimum: 1 })
  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
