import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.js';

export class CustomerQueryDto extends PaginationDto {
  /** Texto a buscar en nombre o correo. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
