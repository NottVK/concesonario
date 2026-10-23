import { MAX_DB_INT, tooBig } from '../../common/limits.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MONEY_REGEX } from '../../common/money.js';
import { PaginationDto } from '../../common/pagination.js';
import { FuelType, Transmission, VehicleStatus } from '../entities/vehicle.entity.js';

export const VEHICLE_SORTS = ['newest', 'price_asc', 'price_desc', 'year_desc', 'year_asc'] as const;
export type VehicleSort = (typeof VEHICLE_SORTS)[number];

/** Filtros comunes del catálogo y del listado admin. Todos son opcionales y se combinan con AND. */
export abstract class VehicleFiltersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Id de la marca', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('brandId'))
  brandId?: number;

  @ApiPropertyOptional({ description: 'Nombre exacto de la marca, sin distinguir mayúsculas', example: 'toyota' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  brand?: string;

  @ApiPropertyOptional({ description: 'Texto contenido en el modelo, sin distinguir mayúsculas', example: 'coro' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ description: 'Año mínimo', example: 2020 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100, tooBig('yearMin', 2100))
  yearMin?: number;

  @ApiPropertyOptional({ description: 'Año máximo', example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100, tooBig('yearMax', 2100))
  yearMax?: number;

  @ApiPropertyOptional({ description: 'Precio mínimo en COP', example: '50000000' })
  @IsOptional()
  @Matches(MONEY_REGEX, { message: 'priceMin debe ser un monto en COP' })
  priceMin?: string;

  @ApiPropertyOptional({ description: 'Precio máximo en COP', example: '120000000' })
  @IsOptional()
  @Matches(MONEY_REGEX, { message: 'priceMax debe ser un monto en COP' })
  priceMax?: string;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsIn(Object.values(FuelType), { message: `fuel debe ser: ${Object.values(FuelType).join(', ')}` })
  fuel?: FuelType;

  @ApiPropertyOptional({ enum: Transmission })
  @IsOptional()
  @IsIn(Object.values(Transmission), {
    message: `transmission debe ser: ${Object.values(Transmission).join(', ')}`,
  })
  transmission?: Transmission;

  @ApiPropertyOptional({ description: 'Texto contenido en el color, sin distinguir mayúsculas (rojo encuentra Rojo; verde encuentra Verde lima)', example: 'rojo' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  color?: string;

  @ApiPropertyOptional({ enum: VEHICLE_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(VEHICLE_SORTS, { message: `sort debe ser: ${VEHICLE_SORTS.join(', ')}` })
  sort: VehicleSort = 'newest';
}

/** GET /vehiculos: el catálogo público nunca lista vendidos. */
export class VehicleQueryDto extends VehicleFiltersDto {
  @ApiPropertyOptional({
    enum: [VehicleStatus.NEW, VehicleStatus.USED],
    description: 'El catálogo nunca lista vendidos, por eso solo se aceptan nuevo y usado',
  })
  @IsOptional()
  @IsIn([VehicleStatus.NEW, VehicleStatus.USED], { message: 'status debe ser nuevo o usado' })
  status?: VehicleStatus.NEW | VehicleStatus.USED;
}

/** GET /admin/vehiculos: el inventario completo; `status` admite también `vendido`. */
export class AdminVehicleQueryDto extends VehicleFiltersDto {
  @ApiPropertyOptional({ enum: Object.values(VehicleStatus) })
  @IsOptional()
  @IsIn(Object.values(VehicleStatus), {
    message: `status debe ser: ${Object.values(VehicleStatus).join(', ')}`,
  })
  status?: VehicleStatus;
}

/** Lo que entiende el servicio: los filtros comunes más un estado cualquiera. */
export type VehicleFilters = VehicleFiltersDto & { status?: VehicleStatus };
