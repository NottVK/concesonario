import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../usuarios/entities/user.entity.js';

export class LoginDto {
  @ApiProperty({ example: 'vendedor@automax.co' })
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 72, format: 'password' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres' })
  password: string;
}

export class PublicUserDto {
  @ApiProperty({ example: 2 }) id: number;
  @ApiProperty({ example: 'Vendedor Demo' }) name: string;
  @ApiProperty({ example: 'vendedor@automax.co' }) email: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
}

export class LoginResultDto {
  @ApiProperty({ description: 'JWT para el encabezado Authorization: Bearer <token>' })
  accessToken: string;

  @ApiProperty({ type: PublicUserDto })
  user: PublicUserDto;
}
