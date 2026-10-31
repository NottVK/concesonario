import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Los mensajes de validación no repiten el valor recibido: así el documento no aparece en errores ni en logs. */
export class IdentifyDto {
  @ApiProperty({ example: '1000000001', description: 'Documento del propietario. Va por este formulario, nunca por la conversación libre' })
  @IsString({ message: 'documento debe ser texto' })
  @MinLength(6, { message: 'documento no es válido' })
  @MaxLength(20, { message: 'documento no es válido' })
  documento: string;

  @ApiProperty({ example: 'AMXVEH00000000001' })
  @IsString({ message: 'vin debe ser texto' })
  @MinLength(11, { message: 'vin no es válido' })
  @MaxLength(40, { message: 'vin no es válido' })
  vin: string;
}

export class DecisionDto {
  @ApiProperty({ enum: ['aceptar', 'rechazar'] })
  @IsIn(['aceptar', 'rechazar'], { message: 'accion debe ser aceptar o rechazar' })
  accion: 'aceptar' | 'rechazar';

  @ApiPropertyOptional({ description: 'Obligatorio al rechazar: el cliente lo recibe en el chat' })
  @ValidateIf((dto: DecisionDto) => dto.accion === 'rechazar')
  @IsString({ message: 'motivo es obligatorio al rechazar' })
  @MinLength(5, { message: 'motivo es obligatorio al rechazar (mínimo 5 caracteres)' })
  @MaxLength(500, { message: 'motivo no puede superar 500 caracteres' })
  motivo?: string;

  @ApiPropertyOptional({ type: [String], description: 'Obligatorio al aceptar: lista de repuestos que el cliente recibe en el chat' })
  @ValidateIf((dto: DecisionDto) => dto.accion === 'aceptar')
  @IsArray({ message: 'repuestos es obligatorio al aceptar' })
  @ArrayMinSize(1, { message: 'repuestos es obligatorio al aceptar' })
  @ArrayMaxSize(20, { message: 'repuestos admite hasta 20 elementos' })
  @IsString({ each: true, message: 'cada repuesto debe ser texto' })
  @MaxLength(80, { each: true, message: 'cada repuesto admite hasta 80 caracteres' })
  repuestos?: string[];
}

export class CaseSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() estado: string;
  @ApiProperty() vin: string;
  @ApiProperty({ nullable: true, type: String }) falla: string | null;
  @ApiProperty() cambiosAjenos: boolean;
  @ApiProperty() noVerificado: boolean;
  @ApiProperty({ nullable: true, type: String }) citaInicio: string | null;
  @ApiProperty({ nullable: true, type: String }) motivo: string | null;
  @ApiProperty({ type: [String] }) repuestos: string[];
  @ApiProperty() creadoEn: string;
}
