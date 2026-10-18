import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POSITIVE_MONEY_REGEX } from '../../common/money.js';
import { FuelType, Transmission, VehicleStatus } from '../entities/vehicle.entity.js';
import type { VehicleStatus as VehicleStatusType } from '../entities/vehicle.entity.js';

/** El estado `vendido` solo lo asigna una venta, nunca se fija a mano. */
const MANUAL_STATUSES: VehicleStatusType[] = [VehicleStatus.NEW, VehicleStatus.USED];

/** Cuerpo de POST y PUT /vehiculos (PUT reemplaza todos los campos). */
export class VehicleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  brandId: number;

  @IsString()
  @MaxLength(80)
  model: string;

  @Type(() => Number)
  @IsInt()
  @Min(1990, { message: 'year debe estar entre 1990 y 2100' })
  @Max(2100, { message: 'year debe estar entre 1990 y 2100' })
  year: number;

  @IsString()
  @MaxLength(80)
  version: string;

  /** Precio en COP como texto (hasta 2 decimales), mayor que cero. */
  @Matches(POSITIVE_MONEY_REGEX, { message: 'price debe ser un monto en COP mayor que cero' })
  price: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage: number;

  @IsIn(Object.values(FuelType), { message: `fuel debe ser: ${Object.values(FuelType).join(', ')}` })
  fuel: FuelType;

  @IsIn(Object.values(Transmission), {
    message: `transmission debe ser: ${Object.values(Transmission).join(', ')}`,
  })
  transmission: Transmission;

  @IsString()
  @MaxLength(40)
  color: string;

  @IsIn(MANUAL_STATUSES, { message: 'status debe ser nuevo o usado' })
  status: VehicleStatusType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  images?: string[];
}
