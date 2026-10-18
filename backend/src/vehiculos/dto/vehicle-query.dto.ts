import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { MONEY_REGEX } from '../../common/money.js';
import { PaginationDto } from '../../common/pagination.js';
import { FuelType, Transmission, VehicleStatus } from '../entities/vehicle.entity.js';

export const VEHICLE_SORTS = [
  'recientes',
  'precio_asc',
  'precio_desc',
  'anio_desc',
  'anio_asc',
] as const;
export type VehicleSort = (typeof VEHICLE_SORTS)[number];

// Los nombres de los filtros son el contrato público del catálogo (en español, según el PRD).
export class VehicleQueryDto extends PaginationDto {
  /** Nombre de la marca, sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  anioMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  anioMax?: number;

  @IsOptional()
  @Matches(MONEY_REGEX, { message: 'precioMin debe ser un monto en COP' })
  precioMin?: string;

  @IsOptional()
  @Matches(MONEY_REGEX, { message: 'precioMax debe ser un monto en COP' })
  precioMax?: string;

  @IsOptional()
  @IsIn(Object.values(FuelType), {
    message: `combustible debe ser: ${Object.values(FuelType).join(', ')}`,
  })
  combustible?: FuelType;

  @IsOptional()
  @IsIn(Object.values(Transmission), {
    message: `transmision debe ser: ${Object.values(Transmission).join(', ')}`,
  })
  transmision?: Transmission;

  /** El catálogo nunca lista vendidos, por eso solo se aceptan nuevo y usado. */
  @IsOptional()
  @IsIn([VehicleStatus.NEW, VehicleStatus.USED], { message: 'estado debe ser nuevo o usado' })
  estado?: VehicleStatus.NEW | VehicleStatus.USED;

  @IsOptional()
  @IsIn(VEHICLE_SORTS, { message: `orden debe ser: ${VEHICLE_SORTS.join(', ')}` })
  orden: VehicleSort = 'recientes';
}
