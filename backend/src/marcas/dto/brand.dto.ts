import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de POST y PUT /marcas (PUT reemplaza todos los campos). */
export class BrandDto {
  @IsString()
  @MinLength(2, { message: 'name debe tener al menos 2 caracteres' })
  @MaxLength(60)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  country: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoUrl?: string;
}
