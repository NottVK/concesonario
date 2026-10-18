import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AppointmentStatus } from '../entities/appointment.entity.js';

export class UpdateStatusDto {
  @ApiProperty({
    enum: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
    description: 'pendiente → confirmada | cancelada; confirmada → cancelada. Una cancelada no se reactiva',
  })
  @IsIn([AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED], {
    message: 'status debe ser confirmada o cancelada',
  })
  status: AppointmentStatus.CONFIRMED | AppointmentStatus.CANCELLED;
}
