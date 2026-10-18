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
  @PrimaryGeneratedColumn()
  id: number;

  /** Un vehículo solo se vende una vez. */
  @Index({ unique: true })
  @Column({ name: 'vehiculo_id', type: 'int' })
  vehicleId: number;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Relation<Vehicle>;

  @Column({ name: 'cliente_id', type: 'int' })
  customerId: number;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Relation<Customer>;

  @Column({ name: 'vendedor_id', type: 'int' })
  sellerId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendedor_id' })
  seller: Relation<User>;

  @Column({ name: 'precio_final', type: 'numeric', precision: 12, scale: 2 })
  finalPrice: string;

  @Column({ name: 'pago', type: 'enum', enum: PaymentMethod, enumName: 'metodo_pago_enum' })
  payment: PaymentMethod;

  @CreateDateColumn({ name: 'fecha', type: 'timestamptz' })
  soldAt: Date;
}
