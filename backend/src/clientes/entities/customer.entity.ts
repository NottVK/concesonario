import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('clientes')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'telefono', type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'correo', type: 'varchar', length: 120, unique: true })
  email: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
