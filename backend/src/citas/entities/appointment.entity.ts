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
import { Customer } from '../../clientes/entities/customer.entity.js';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';

export enum AppointmentStatus {
  PENDING = 'pendiente',
  CONFIRMED = 'confirmada',
  CANCELLED = 'cancelada',
}

/**
 * Cita de test-drive. Los solapes (RF4) los impide la BD con dos restricciones de
 * exclusión creadas en la migración AppointmentOverlap: `ex_citas_vehiculo_solape` y
 * `ex_citas_cliente_solape` (TypeORM no las modela, por eso no aparecen aquí).
 */
@Entity('citas')
@Check('CHK_citas_duracion', '"duracion_min" BETWEEN 15 AND 240')
export class Appointment {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 1 })
  @Index()
  @Column({ name: 'cliente_id', type: 'int' })
  customerId: number;

  @ApiProperty({ type: () => Customer, required: false })
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Relation<Customer>;

  @ApiProperty({ example: 1 })
  @Column({ name: 'vehiculo_id', type: 'int' })
  vehicleId: number;

  @ApiProperty({ type: () => Vehicle, required: false })
  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Relation<Vehicle>;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'fecha_hora', type: 'timestamptz' })
  scheduledAt: Date;

  /** Duración en minutos; hoy siempre 60. */
  @ApiProperty({ example: 60 })
  @Column({ name: 'duracion_min', type: 'int', default: 60 })
  durationMin: number;

  @ApiProperty({ enum: AppointmentStatus })
  @Column({
    name: 'estado',
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'estado_cita_enum',
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;
}
