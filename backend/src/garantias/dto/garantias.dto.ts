import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Los mensajes de validación no repiten el valor recibido: así el documento no aparece en errores ni en logs. */
export class IdentifyDto {
  @ApiProperty({ example: '1000000001', description: 'Documento del propietario. Va por este formulario, nunca por la conversación libre' })
  @IsString({ message: 'document debe ser texto' })
  @MinLength(6, { message: 'document no es válido' })
  @MaxLength(20, { message: 'document no es válido' })
  document: string;

  @ApiProperty({ example: 'AMXVEH00000000001' })
  @IsString({ message: 'vin debe ser texto' })
  @MinLength(11, { message: 'vin no es válido' })
  @MaxLength(40, { message: 'vin no es válido' })
  vin: string;
}

export class DecisionDto {
  @ApiProperty({ enum: ['aceptar', 'rechazar'] })
  @IsIn(['aceptar', 'rechazar'], { message: 'action debe ser aceptar o rechazar' })
  action: 'aceptar' | 'rechazar';

  @ApiPropertyOptional({ description: 'Obligatorio al rechazar: el cliente lo recibe en el chat' })
  @ValidateIf((dto: DecisionDto) => dto.action === 'rechazar')
  @IsString({ message: 'reason es obligatorio al rechazar' })
  @MinLength(5, { message: 'reason es obligatorio al rechazar (mínimo 5 caracteres)' })
  @MaxLength(500, { message: 'reason no puede superar 500 caracteres' })
  reason?: string;

  @ApiPropertyOptional({ type: [String], description: 'Obligatorio al aceptar: lista de repuestos que el cliente recibe en el chat' })
  @ValidateIf((dto: DecisionDto) => dto.action === 'aceptar')
  @IsArray({ message: 'parts es obligatorio al aceptar' })
  @ArrayMinSize(1, { message: 'parts es obligatorio al aceptar' })
  @ArrayMaxSize(20, { message: 'parts admite hasta 20 elementos' })
  @IsString({ each: true, message: 'cada elemento de parts debe ser texto' })
  @MaxLength(80, { each: true, message: 'cada elemento de parts admite hasta 80 caracteres' })
  parts?: string[];
}

export class CaseSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() vin: string;
  @ApiProperty({ nullable: true, type: String }) fault: string | null;
  @ApiProperty() foreignChanges: boolean;
  @ApiProperty() unverified: boolean;
  @ApiProperty({ nullable: true, type: String }) appointmentStart: string | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ type: [String] }) parts: string[];
  @ApiProperty() createdAt: string;
}
