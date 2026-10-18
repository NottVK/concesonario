import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de POST y PUT /marcas (PUT reemplaza todos los campos). */
export class BrandDto {
  @ApiProperty({ example: 'Toyota', minLength: 2, maxLength: 60 })
  @IsString()
  @MinLength(2, { message: 'name debe tener al menos 2 caracteres' })
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'Japón', minLength: 2, maxLength: 60 })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  country: string;

  @ApiPropertyOptional({ example: '/autos/marcas/toyota.svg', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoUrl?: string;
}
