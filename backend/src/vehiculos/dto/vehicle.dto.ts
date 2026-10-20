import { IsVehicleImage, MAX_IMAGE_LENGTH } from '../../common/image-path.js';
import { MAX_DB_INT, MAX_MILEAGE_KM, tooBig } from '../../common/limits.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { POSITIVE_MONEY_REGEX } from '../../common/money.js';
import { FuelType, Transmission, VehicleStatus } from '../entities/vehicle.entity.js';
import type { VehicleStatus as VehicleStatusType } from '../entities/vehicle.entity.js';

/** El estado `vendido` solo lo asigna una venta, nunca se fija a mano. */
const MANUAL_STATUSES: VehicleStatusType[] = [VehicleStatus.NEW, VehicleStatus.USED];

/** Cuerpo de POST y PUT /vehiculos (PUT reemplaza todos los campos). */
export class VehicleDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('brandId'))
  brandId: number;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @MaxLength(80)
  model: string;

  @ApiProperty({ example: 2024, minimum: 1990, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(1990, { message: 'year debe estar entre 1990 y 2100' })
  @Max(2100, { message: 'year debe estar entre 1990 y 2100' })
  year: number;

  @ApiProperty({ example: 'XEI' })
  @IsString()
  @MaxLength(80)
  version: string;

  /** Precio en COP como texto (hasta 2 decimales), mayor que cero. */
  @ApiProperty({ example: '95000000', description: 'Precio en COP como texto, hasta 2 decimales, mayor que cero' })
  @Matches(POSITIVE_MONEY_REGEX, { message: 'price debe ser un monto en COP mayor que cero' })
  price: string;

  @ApiProperty({ example: 0, minimum: 0, maximum: MAX_MILEAGE_KM })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MILEAGE_KM, tooBig('mileage', MAX_MILEAGE_KM))
  mileage: number;

  @ApiProperty({ enum: FuelType })
  @IsIn(Object.values(FuelType), { message: `fuel debe ser: ${Object.values(FuelType).join(', ')}` })
  fuel: FuelType;

  @ApiProperty({ enum: Transmission })
  @IsIn(Object.values(Transmission), {
    message: `transmission debe ser: ${Object.values(Transmission).join(', ')}`,
  })
  transmission: Transmission;

  @ApiProperty({ example: 'Blanco' })
  @IsString()
  @MaxLength(40)
  color: string;

  @ApiProperty({ enum: MANUAL_STATUSES, description: '`vendido` solo lo asigna una venta' })
  @IsIn(MANUAL_STATUSES, { message: 'status debe ser nuevo o usado' })
  status: VehicleStatusType;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    example: ['/autos/toyota-corolla.webp'],
    description: 'Solo rutas propias `/autos/...` o URL `https://`; cualquier otro esquema se rechaza',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(MAX_IMAGE_LENGTH, { each: true })
  @IsVehicleImage({ each: true })
  images?: string[];
}

/** Cuerpo de PUT /vehiculos/:id: todos los campos más la revisión que leyó el cliente. */
export class UpdateVehicleDto extends VehicleDto {
  @ApiProperty({ example: 1, description: 'Revisión leída del vehículo; si cambió mientras se editaba, la API responde 409' })
  @Type(() => Number)
  @IsInt({ message: 'revision debe ser un entero' })
  @Min(1, { message: 'revision debe ser al menos 1' })
  @Max(MAX_DB_INT, tooBig('revision'))
  revision: number;
}
