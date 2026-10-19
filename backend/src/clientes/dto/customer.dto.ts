import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_DB_INT, tooBig } from '../../common/limits.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** 7 dígitos como mínimo (se cuentan sin separadores), 30 caracteres como máximo. */
const PHONE_PATTERN = /^(?=(?:\D*\d){7})[0-9+()\-\s]{7,30}$/;

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
  @Matches(PHONE_PATTERN, { message: 'phone debe tener al menos 7 dígitos y solo admite dígitos, espacios, + - ( )' })
  phone?: string;
}

/** Edición de un cliente: además de los datos, la versión que se leyó (control de ediciones simultáneas). */
export class UpdateCustomerDto extends CustomerDto {
  @ApiProperty({ example: 1, minimum: 1, description: 'Versión del cliente que se leyó; si ya cambió, responde 409' })
  @IsInt({ message: 'version debe ser un entero' })
  @Min(1, { message: 'version debe ser al menos 1' })
  @Max(MAX_DB_INT, tooBig('version'))
  version: number;
}

/** Respuesta de POST /clientes: solo el id, nunca datos de otros clientes. */
export class CreatedIdDto {
  @ApiProperty({ example: 1 })
  id: number;
}
