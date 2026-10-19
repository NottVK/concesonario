import { MAX_DB_INT, tooBig } from '../../common/limits.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../common/pagination.js';
import { AppointmentStatus } from '../entities/appointment.entity.js';

/** Filtros de GET /citas. Se ordenan por fecha ascendente. */
export class AppointmentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'status debe ser pendiente, confirmada o cancelada' })
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('vehicleId'))
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Citas desde este instante (ISO 8601)', example: '2026-11-01T00:00:00-05:00' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Citas hasta este instante (ISO 8601)', example: '2026-11-30T23:59:59-05:00' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
