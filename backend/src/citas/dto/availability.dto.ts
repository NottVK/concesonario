import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { ISO_WITH_OFFSET } from './create-appointment.dto.js';

export const DEFAULT_AVAILABILITY_DAYS = 35;
export const MAX_AVAILABILITY_DAYS = 62;

/** GET /vehiculos/:id/disponibilidad?from=&to= — ambos opcionales. */
export class AvailabilityQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-02T00:00:00-05:00',
    description: 'Inicio del rango, ISO 8601 con zona horaria. Por defecto, ahora',
  })
  @IsOptional()
  @Matches(ISO_WITH_OFFSET, { message: 'from debe ser ISO 8601 con zona horaria, p. ej. 2026-11-02T00:00:00-05:00' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-07T00:00:00-05:00',
    description: `Fin del rango (exclusivo), ISO 8601 con zona horaria. Por defecto, ${DEFAULT_AVAILABILITY_DAYS} días después de from; el rango máximo es de ${MAX_AVAILABILITY_DAYS} días`,
  })
  @IsOptional()
  @Matches(ISO_WITH_OFFSET, { message: 'to debe ser ISO 8601 con zona horaria, p. ej. 2026-12-07T00:00:00-05:00' })
  to?: string;
}

/** Una franja ocupada. Deliberadamente sin estado ni datos del cliente. */
export class BusySlotDto {
  @ApiProperty({ type: String, format: 'date-time' })
  startsAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endsAt: Date;
}

export class AvailabilityDto {
  @ApiProperty({ example: 1 })
  vehicleId: number;

  @ApiProperty({ type: String, format: 'date-time' })
  from: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  to: Date;

  @ApiProperty({ example: 60, description: 'Duración de cada visita, en minutos' })
  durationMin: number;

  @ApiProperty({
    type: [BusySlotDto],
    description:
      'Franjas ya reservadas de ese vehículo dentro del rango (citas pendientes o confirmadas). ' +
      'Todo lo demás dentro del horario de atención está libre; el POST /citas sigue siendo quien decide.',
  })
  busy: BusySlotDto[];
}
