import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Customer } from '../../clientes/entities/customer.entity.js';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

export enum AppointmentStatus {
  PENDING = 'pendiente',
  CONFIRMED = 'confirmada',
  CANCELLED = 'cancelada',
}

/** Un vehículo no puede tener dos citas activas a la misma hora (RF4). */
@Entity('citas')
@Index('uq_citas_vehiculo_fecha_activa', ['vehicleId', 'scheduledAt'], {
  unique: true,
  where: "estado <> 'cancelada'",
})
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'cliente_id', type: 'int' })
  customerId: number;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Relation<Customer>;

  @Column({ name: 'vehiculo_id', type: 'int' })
  vehicleId: number;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Relation<Vehicle>;

  @Column({ name: 'fecha_hora', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'estado_cita_enum',
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;
}
