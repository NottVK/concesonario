import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { MONEY_REGEX } from '../../common/money.js';

export const MIN_MONTHS = 12;
export const MAX_MONTHS = 84;
export const MAX_ANNUAL_RATE = 1;

export class SimulateFinancingDto {
  /** Valor del vehículo en COP, como texto para no perder precisión. */
  @ApiProperty({ example: '100000000', description: 'Valor del vehículo en COP, como texto con hasta 2 decimales' })
  @Matches(MONEY_REGEX, { message: 'amount debe ser un monto en COP (máx. 2 decimales)' })
  amount: string;

  @ApiProperty({ example: '20000000', description: 'Cuota inicial en COP; debe ser menor que amount' })
  @Matches(MONEY_REGEX, { message: 'downPayment debe ser un monto en COP (máx. 2 decimales)' })
  downPayment: string;

  @ApiProperty({ example: 60, minimum: MIN_MONTHS, maximum: MAX_MONTHS })
  @Type(() => Number)
  @IsInt({ message: 'months debe ser un entero' })
  @Min(MIN_MONTHS, { message: `months mínimo ${MIN_MONTHS}` })
  @Max(MAX_MONTHS, { message: `months máximo ${MAX_MONTHS}` })
  months: number;

  /** Tasa efectiva anual como fracción (0.18 = 18 %). Si falta, se usa la del concesionario. */
  @ApiPropertyOptional({
    example: 0.18,
    minimum: 0,
    maximum: MAX_ANNUAL_RATE,
    description: 'Tasa efectiva anual como fracción (0.18 = 18 %). Si falta se usa FINANCING_DEFAULT_RATE_EA',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'annualRate debe ser un número' })
  @Min(0, { message: 'annualRate no puede ser negativa' })
  @Max(MAX_ANNUAL_RATE, { message: 'annualRate no puede superar 1 (100 %)' })
  annualRate?: number;
}

export class FinancingSimulationDto {
  @ApiProperty({ example: '100000000.00' }) amount: string;
  @ApiProperty({ example: '20000000.00' }) downPayment: string;
  @ApiProperty({ example: '80000000.00', description: 'amount - downPayment' }) financed: string;
  @ApiProperty({ example: 60 }) months: number;
  @ApiProperty({ example: 0.18, description: 'Tasa efectiva anual usada' }) annualRate: number;
  @ApiProperty({ example: 0.01388843, description: 'Tasa efectiva mensual equivalente' }) monthlyRate: number;
  @ApiProperty({ example: '1973872.13', description: 'Cuota fija, redondeada hacia arriba al centavo' })
  monthlyPayment: string;
  @ApiProperty({ example: '118432327.80', description: 'monthlyPayment × months' }) totalPayment: string;
  @ApiProperty({ example: '38432327.80', description: 'totalPayment - financed' }) totalInterest: string;
}
