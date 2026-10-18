import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.js';

export class CustomerQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en nombre o correo (distingue acentos)', example: 'ana' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
