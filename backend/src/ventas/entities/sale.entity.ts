import { ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Customer } from '../../clientes/entities/customer.entity.js';
import { User } from '../../usuarios/entities/user.entity.js';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

export enum PaymentMethod {
  CASH = 'contado',
  CREDIT = 'credito',
  LEASING = 'leasing',
}

@Entity('ventas')
@Check('CHK_ventas_precio_final', '"precio_final" > 0')
export class Sale {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  /** Un vehículo solo se vende una vez. */
  @ApiProperty({ example: 1 })
  @Index({ unique: true })
  @Column({ name: 'vehiculo_id', type: 'int' })
  vehicleId: number;

  @ApiProperty({ type: () => Vehicle, required: false })
  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Relation<Vehicle>;

  @ApiProperty({ example: 1 })
  @Column({ name: 'cliente_id', type: 'int' })
  customerId: number;

  @ApiProperty({ type: () => Customer, required: false })
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Relation<Customer>;

  @ApiProperty({ example: 2 })
  @Column({ name: 'vendedor_id', type: 'int' })
  sellerId: number;

  @ApiProperty({ type: () => User, required: false })
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendedor_id' })
  seller: Relation<User>;

  @ApiProperty({ example: '115000000.50', description: 'Precio final en COP, texto con 2 decimales' })
  @Column({ name: 'precio_final', type: 'numeric', precision: 12, scale: 2 })
  finalPrice: string;

  @ApiProperty({ enum: PaymentMethod })
  @Column({ name: 'pago', type: 'enum', enum: PaymentMethod, enumName: 'metodo_pago_enum' })
  payment: PaymentMethod;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'fecha', type: 'timestamptz' })
  soldAt: Date;
}
