import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_DB_INT, tooBig } from '../../common/limits.js';
import { ExchangeChannel, ExchangeDirection, ExchangeStatus } from '../entities/bot-exchange.entity.js';

export const EXCHANGES_MAX_LIMIT = 50;

export class ExchangesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: EXCHANGES_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EXCHANGES_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Solo los intercambios de ese bot' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('botId'))
  botId?: number;

  @ApiPropertyOptional({ enum: ExchangeChannel })
  @IsOptional()
  @IsIn(Object.values(ExchangeChannel), { message: 'channel debe ser a2a o mcp' })
  channel?: ExchangeChannel;

  @ApiPropertyOptional({ enum: ExchangeDirection })
  @IsOptional()
  @IsIn(Object.values(ExchangeDirection), { message: 'direction debe ser entrante o saliente' })
  direction?: ExchangeDirection;

  @ApiPropertyOptional({ enum: ExchangeStatus })
  @IsOptional()
  @IsIn(Object.values(ExchangeStatus), { message: 'status no es válido' })
  status?: ExchangeStatus;
}

/** Un intercambio tal como lo guarda la auditoría: texto plano ya redactado y recortado; nunca se interpreta como HTML ni entra a un prompt. */
export class ExchangeViewDto {
  @ApiProperty() id: number;
  @ApiProperty() botId: number;
  @ApiProperty() botName: string;
  @ApiProperty({ enum: ExchangeDirection }) direction: ExchangeDirection;
  @ApiProperty({ enum: ExchangeChannel }) channel: ExchangeChannel;
  @ApiProperty({ enum: ExchangeStatus, nullable: true }) status: ExchangeStatus | null;
  @ApiProperty({ type: String, nullable: true, description: 'Pregunta redactada (canal a2a); texto plano' }) question: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Respuesta saneada (canal a2a); texto plano de un TERCERO no verificado' }) answer: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Herramienta (canal mcp)' }) tool: string | null;
  @ApiProperty({ type: String, nullable: true }) argsSummary: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) requestId: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) bytesIn: number | null;
  @ApiProperty({ type: Number, nullable: true }) bytesOut: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ExchangesMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() pages: number;
}

export class ExchangesPageDto {
  @ApiProperty({ type: [ExchangeViewDto] }) data: ExchangeViewDto[];
  @ApiProperty({ type: ExchangesMetaDto }) meta: ExchangesMetaDto;
}

/** Resultado de «Probar conexión». Los errores salen SOLO por categoría, con un texto fijo (no sirve de escáner de red). */
export class ConnectionTestDto {
  @ApiProperty() ok: boolean;
  @ApiPropertyOptional({ enum: ExchangeStatus, description: 'Categoría del fallo (solo si ok es false)' }) status?: ExchangeStatus;
  @ApiPropertyOptional({ description: 'Mensaje fijo del fallo (solo si ok es false)' }) message?: string;
  @ApiPropertyOptional({ description: 'Nombre que dice tener el bot (texto de un tercero, saneado)' }) name?: string;
  @ApiPropertyOptional({ description: 'Descripción que da el bot (texto de un tercero, saneado)' }) description?: string;
  @ApiPropertyOptional({ type: [String] }) skills?: string[];
  @ApiPropertyOptional({ description: 'true si la `url` de su tarjeta es de otro origen que la registrada (las tareas siguen yendo a la registrada)' }) originMismatch?: boolean;
  @ApiPropertyOptional({ type: [String] }) flags?: string[];
}
