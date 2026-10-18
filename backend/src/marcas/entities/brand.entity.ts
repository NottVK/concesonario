import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

@Entity('marcas')
export class Brand {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Toyota' })
  @Column({ name: 'nombre', type: 'varchar', length: 60, unique: true })
  name: string;

  @ApiProperty({ example: 'Japón' })
  @Column({ name: 'pais', type: 'varchar', length: 60 })
  country: string;

  @ApiProperty({ type: String, nullable: true, example: '/autos/marcas/toyota.svg' })
  @Column({ name: 'logo_url', type: 'varchar', length: 255, nullable: true })
  logoUrl: string | null;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.brand)
  vehicles: Relation<Vehicle>[];
}
