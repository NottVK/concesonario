import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_SALES_MONTHS = 12;
export const MAX_SALES_MONTHS = 24;

export class SummaryDto {
  @ApiProperty({ example: '2026-10', description: 'Mes calendario de las ventas, en hora de Bogotá' })
  month: string;

  @ApiProperty({ example: 52, description: 'Vehículos disponibles (nuevos y usados, sin vendidos)' })
  vehiclesInStock: number;

  @ApiProperty({ example: '9850000000.00', description: 'Suma de precios del inventario disponible, en COP' })
  stockValue: string;

  @ApiProperty({ example: 4, description: 'Citas en estado pendiente' })
  pendingAppointments: number;

  @ApiProperty({ example: 3, description: 'Ventas registradas en el mes' })
  salesThisMonth: number;

  @ApiProperty({ example: '540000000.00', description: 'Suma del precio final de las ventas del mes, en COP' })
  revenueThisMonth: string;
}

export class SalesByMonthQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_SALES_MONTHS, minimum: 1, maximum: MAX_SALES_MONTHS })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'months debe ser un entero' })
  @Min(1, { message: 'months debe ser al menos 1' })
  @Max(MAX_SALES_MONTHS, { message: `months no puede superar ${MAX_SALES_MONTHS}` })
  months: number = DEFAULT_SALES_MONTHS;
}

export class SalesByMonthDto {
  @ApiProperty({ example: '2026-09' })
  month: string;

  @ApiProperty({ example: 5 })
  count: number;

  @ApiProperty({ example: '845000000.00', description: 'Suma del precio final, en COP' })
  total: string;
}

export class StockByBrandDto {
  @ApiProperty({ example: 3 })
  brandId: number;

  @ApiProperty({ example: 'Mazda' })
  brand: string;

  @ApiProperty({ example: 6, description: 'Vehículos disponibles de la marca (0 si no tiene)' })
  count: number;

  @ApiProperty({ example: '1100000000.00', description: 'Suma de precios de esos vehículos, en COP' })
  value: string;
}
