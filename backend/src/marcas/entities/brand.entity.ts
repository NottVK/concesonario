import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

@Entity('marcas')
export class Brand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 60, unique: true })
  name: string;

  @Column({ name: 'pais', type: 'varchar', length: 60 })
  country: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 255, nullable: true })
  logoUrl: string | null;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.brand)
  vehicles: Relation<Vehicle>[];
}
