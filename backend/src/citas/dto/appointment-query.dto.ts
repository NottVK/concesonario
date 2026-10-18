import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../common/pagination.js';
import { AppointmentStatus } from '../entities/appointment.entity.js';

// Los nombres de los filtros son el contrato público (en español, como en el catálogo).
export class AppointmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'estado debe ser pendiente, confirmada o cancelada' })
  estado?: AppointmentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehiculoId?: number;

  /** Citas desde este instante (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  desde?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  hasta?: string;
}
