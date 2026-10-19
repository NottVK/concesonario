import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.js';

export class CustomerQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en nombre o correo (mínimo 3 caracteres, distingue acentos)', example: 'ana' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'q debe tener al menos 3 caracteres' })
  @MaxLength(120)
  q?: string;
}
