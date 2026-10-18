import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Datos de contacto de un cliente; se reutiliza al agendar una cita. */
export class CustomerDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'name debe tener al menos 2 caracteres' })
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsEmail({}, { message: 'email no es un correo válido' })
  @MaxLength(120)
  email: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9+()\-\s]{7,30}$/, { message: 'phone solo admite dígitos, espacios, + - ( )' })
  phone?: string;
}
