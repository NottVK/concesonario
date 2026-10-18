import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { MONEY_REGEX } from '../../common/money.js';

export const MIN_MONTHS = 12;
export const MAX_MONTHS = 84;
export const MAX_ANNUAL_RATE = 1;

// Las claves del JSON son el contrato público de la API (en español, según el PRD).
export class SimulateFinancingDto {
  /** Valor del vehículo en COP, como texto para no perder precisión. */
  @Matches(MONEY_REGEX, { message: 'valor debe ser un monto en COP (máx. 2 decimales)' })
  valor: string;

  @Matches(MONEY_REGEX, { message: 'cuotaInicial debe ser un monto en COP (máx. 2 decimales)' })
  cuotaInicial: string;

  @Type(() => Number)
  @IsInt({ message: 'plazoMeses debe ser un entero' })
  @Min(MIN_MONTHS, { message: `plazoMeses mínimo ${MIN_MONTHS}` })
  @Max(MAX_MONTHS, { message: `plazoMeses máximo ${MAX_MONTHS}` })
  plazoMeses: number;

  /** Tasa efectiva anual como fracción (0.18 = 18 %). Si falta, se usa la del concesionario. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tasaEA debe ser un número' })
  @Min(0, { message: 'tasaEA no puede ser negativa' })
  @Max(MAX_ANNUAL_RATE, { message: 'tasaEA no puede superar 1 (100 %)' })
  tasaEA?: number;
}
