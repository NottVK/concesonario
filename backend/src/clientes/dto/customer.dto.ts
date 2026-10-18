import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Datos de contacto de un cliente; se reutiliza al agendar una cita. */
export class CustomerDto {
  @ApiProperty({ example: 'Ana Pérez', minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'name debe tener al menos 2 caracteres' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'ana@correo.co', description: 'Se guarda en minúsculas' })
  @Transform(trim)
  @IsEmail({}, { message: 'email no es un correo válido' })
  @MaxLength(120)
  email: string;

  @ApiPropertyOptional({ example: '300 123 4567', description: 'Dígitos, espacios y + - ( )' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9+()\-\s]{7,30}$/, { message: 'phone solo admite dígitos, espacios, + - ( )' })
  phone?: string;
}

/** Respuesta de POST /clientes: solo el id, nunca datos de otros clientes. */
export class CreatedIdDto {
  @ApiProperty({ example: 1 })
  id: number;
}
