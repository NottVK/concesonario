import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { sanitizeText } from '../../common/text.js';

export const SEARCH_MIN_CHARS = 3;
export const SEARCH_MAX_CHARS = 200;
export const SEARCH_MAX_LIMIT = 10;
export const SEARCH_DEFAULT_LIMIT = 5;

/** GET /vehiculos/buscar?q=&limit= */
export class SearchQueryDto {
  @ApiProperty({
    example: 'camioneta para familia',
    minLength: SEARCH_MIN_CHARS,
    maxLength: SEARCH_MAX_CHARS,
    description: 'Lo que busca la persona, en lenguaje natural',
  })
  // NFC, sin caracteres de control ni invisibles y con los espacios colapsados, ANTES de validar el largo.
  // Un valor que no es texto (p. ej. `q=a&q=b`) se deja pasar tal cual para que IsString lo rechace.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? sanitizeText(value, SEARCH_MAX_CHARS + 1) : value))
  @IsString({ message: 'q debe ser texto' })
  @MinLength(SEARCH_MIN_CHARS, { message: `q debe tener al menos ${SEARCH_MIN_CHARS} caracteres` })
  @MaxLength(SEARCH_MAX_CHARS, { message: `q no puede superar ${SEARCH_MAX_CHARS} caracteres` })
  q: string;

  @ApiPropertyOptional({ default: SEARCH_DEFAULT_LIMIT, minimum: 1, maximum: SEARCH_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(SEARCH_MAX_LIMIT, { message: `limit no puede superar ${SEARCH_MAX_LIMIT}` })
  limit: number = SEARCH_DEFAULT_LIMIT;
}
