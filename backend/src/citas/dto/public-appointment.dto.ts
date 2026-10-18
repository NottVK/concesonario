import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '../entities/appointment.entity.js';

/** Lo único que ve quien agenda: nada del cliente, para no filtrar datos de terceros. */
export class PublicAppointmentDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  vehicleId: number;

  @ApiProperty({ type: String, format: 'date-time' })
  scheduledAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endsAt: Date;

  @ApiProperty({ enum: AppointmentStatus })
  status: AppointmentStatus;
}
