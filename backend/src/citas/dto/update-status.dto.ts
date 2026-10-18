import { IsIn } from 'class-validator';
import { AppointmentStatus } from '../entities/appointment.entity.js';

export class UpdateStatusDto {
  @IsIn([AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED], {
    message: 'status debe ser confirmada o cancelada',
  })
  status: AppointmentStatus.CONFIRMED | AppointmentStatus.CANCELLED;
}
