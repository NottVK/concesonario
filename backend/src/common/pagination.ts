import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 50;

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Número de página, desde 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser al menos 1' })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    default: 12,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(MAX_PAGE_SIZE, { message: `limit no puede superar ${MAX_PAGE_SIZE}` })
  limit: number = 12;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}
