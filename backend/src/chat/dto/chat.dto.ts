import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CustomerDto } from '../../clientes/dto/customer.dto.js';
import { MAX_DB_INT, tooBig } from '../../common/limits.js';
import { CHAT_MESSAGE_MAX_CHARS } from '../chat.config.js';

export class ChatMessageDto {
  @ApiProperty({ example: '¿Cuánto cuesta el Mazda 3?', maxLength: CHAT_MESSAGE_MAX_CHARS })
  @IsString({ message: 'message debe ser texto' })
  @MinLength(1, { message: 'message no puede estar vacío' })
  @MaxLength(CHAT_MESSAGE_MAX_CHARS, { message: `message no puede superar ${CHAT_MESSAGE_MAX_CHARS} caracteres` })
  message: string;

  @ApiPropertyOptional({ example: 12, description: 'Vehículo que la persona está viendo en la ficha (se comprueba contra el catálogo)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('vehicleId'))
  vehicleId?: number;
}

export class VehicleCardDto {
  @ApiProperty() id: number;
  @ApiProperty() title: string;
  @ApiProperty() year: number;
  @ApiProperty({ example: '95000000.00' }) price: string;
  @ApiProperty({ example: '$95.000.000' }) priceText: string;
  @ApiProperty() fuel: string;
  @ApiProperty() transmission: string;
  @ApiProperty() mileage: number;
  @ApiProperty() status: string;
  @ApiProperty({ type: String, nullable: true }) image: string | null;
}

export class ProposalViewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'Resumen armado por el servidor (vehículo, día y hora de Bogotá)' }) summary: string;
  @ApiProperty() vehicleLabel: string;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt: string;
}

export class ChatDebugDto {
  @ApiProperty({ type: [String], description: 'Nombres de las tools que llamó el modelo en este turno' }) tools: string[];
  @ApiProperty({ enum: ['none', 'template', 'refusal'], description: 'none = respuesta del modelo; template = armada con datos de las tools; refusal = negativa fija' }) fallback: string;
  @ApiProperty({ description: 'Resultados de las tools de este turno (los que vio el modelo)', type: 'array', items: { type: 'object' } }) results: { tool: string; data: Record<string, unknown> }[];
}

export class ChatReplyDto {
  @ApiProperty({ description: 'Texto plano: el widget nunca lo interpreta como HTML' }) reply: string;
  @ApiProperty({ type: [VehicleCardDto], description: 'Fichas estructuradas de los vehículos mencionados' }) cards: VehicleCardDto[];
  @ApiProperty({ type: ProposalViewDto, nullable: true, description: 'Propuesta de cita pendiente de confirmar' }) proposal: ProposalViewDto | null;
  @ApiPropertyOptional({ description: 'Solo en la primera respuesta de una sesión nueva; el navegador la guarda y la manda en X-Chat-Session' })
  sessionToken?: string;
  @ApiPropertyOptional({ type: ChatDebugDto, description: 'Solo con CHAT_EVAL_MODE=true (evaluación) y nunca en producción' })
  debug?: ChatDebugDto;
}

export class ChatStatusDto {
  @ApiProperty() available: boolean;
  @ApiProperty({ enum: ['ollama', 'groq', 'mock'] }) provider: string;
  @ApiProperty({ description: 'true si el texto de la persona sale hacia un servicio externo' }) external: boolean;
}

export class ConfirmAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'proposalId no es válido' })
  proposalId: string;

  @ApiProperty({ type: () => CustomerDto, description: 'Datos de contacto; solo los ve el formulario, nunca el modelo ni el historial' })
  @IsDefined({ message: 'customer es obligatorio' })
  @IsObject({ message: 'customer debe ser un objeto con name, email y phone opcional' })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;
}

export class ConfirmedAppointmentDto {
  @ApiProperty() appointmentId: number;
  @ApiProperty() message: string;
}
