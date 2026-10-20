import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MCP_DEFAULTS } from '../mcp.config.js';

const [MIN_PER_MINUTE, MAX_PER_MINUTE] = MCP_DEFAULTS.botPerMinuteRange;
const [MIN_PER_DAY, MAX_PER_DAY] = MCP_DEFAULTS.botPerDayRange;
const URL_OPTIONS = { protocols: ['https', 'http'], require_protocol: true, require_tld: false };

const OUTBOUND_AUTH = ['bearer', 'x_api_key'] as const;
const MAX_OUTBOUND_PER_MINUTE = 60;

/** Una key saliente son caracteres ASCII imprimibles sin espacios (se envía en una cabecera). */
const OUTBOUND_KEY = /^[\x21-\x7E]{8,200}$/;

export class CreateBotDto {
  @ApiProperty({ example: 'Concesionario Amigo', minLength: 2, maxLength: 80 })
  @IsString()
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,79}$/u, { message: 'name: de 2 a 80 caracteres (letras, números, espacio, punto, guion)' })
  name: string;

  @ApiPropertyOptional({ example: 'https://bot-amigo.example/a2a', description: 'URL base A2A del bot (solo si AutoMax también va a llamarlo). Se valida contra la política SSRF: https, nombre público, sin credenciales ni parámetros' })
  @ValidateIf((_, value) => value !== undefined)
  @IsUrl(URL_OPTIONS, { message: 'url debe ser una dirección http(s) completa' })
  @MaxLength(255)
  url?: string;

  @ApiPropertyOptional({ example: MCP_DEFAULTS.botPerMinute, minimum: MIN_PER_MINUTE, maximum: MAX_PER_MINUTE })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PER_MINUTE)
  @Max(MAX_PER_MINUTE)
  limitPerMinute?: number;

  @ApiPropertyOptional({ example: MCP_DEFAULTS.botPerDay, minimum: MIN_PER_DAY, maximum: MAX_PER_DAY })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PER_DAY)
  @Max(MAX_PER_DAY)
  limitPerDay?: number;

  @ApiPropertyOptional({ description: 'Key que AutoMax enviará a ese bot. Se guarda CIFRADA y nunca vuelve a mostrarse' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(OUTBOUND_KEY, { message: 'outboundApiKey: de 8 a 200 caracteres ASCII imprimibles, sin espacios' })
  outboundApiKey?: string;

  @ApiPropertyOptional({ enum: OUTBOUND_AUTH, description: 'Cómo envía AutoMax su key a ese bot: `Authorization: Bearer` o la cabecera `X-API-Key` (por defecto bearer)' })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(OUTBOUND_AUTH, { message: 'outboundAuth debe ser bearer o x_api_key' })
  outboundAuth?: 'bearer' | 'x_api_key';

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_OUTBOUND_PER_MINUTE, description: 'Máximo de consultas por minuto de AutoMax a ese bot (por defecto 10)' })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OUTBOUND_PER_MINUTE)
  outboundLimitPerMinute?: number;
}

export class UpdateBotDto {
  @ApiPropertyOptional({ description: 'false desactiva al bot: sus llamadas dan el mismo 401 que una key falsa' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(URL_OPTIONS, { message: 'url debe ser una dirección http(s) completa' })
  @MaxLength(255)
  url?: string | null;

  @ApiPropertyOptional({ minimum: MIN_PER_MINUTE, maximum: MAX_PER_MINUTE })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PER_MINUTE)
  @Max(MAX_PER_MINUTE)
  limitPerMinute?: number;

  @ApiPropertyOptional({ minimum: MIN_PER_DAY, maximum: MAX_PER_DAY })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PER_DAY)
  @Max(MAX_PER_DAY)
  limitPerDay?: number;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Cambia la key saliente (cifrada) o la quita con null' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(OUTBOUND_KEY, { message: 'outboundApiKey: de 8 a 200 caracteres ASCII imprimibles, sin espacios' })
  outboundApiKey?: string | null;

  @ApiPropertyOptional({ enum: OUTBOUND_AUTH, description: 'Cómo envía AutoMax su key a ese bot: `Authorization: Bearer` o la cabecera `X-API-Key` (por defecto bearer)' })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(OUTBOUND_AUTH, { message: 'outboundAuth debe ser bearer o x_api_key' })
  outboundAuth?: 'bearer' | 'x_api_key';

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_OUTBOUND_PER_MINUTE, description: 'Máximo de consultas por minuto de AutoMax a ese bot (por defecto 10)' })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OUTBOUND_PER_MINUTE)
  outboundLimitPerMinute?: number;
}

/** Lo que se ve de un bot: nunca el hash, el pepper ni la key saliente. */
export class BotViewDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) url: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Prefijo público de la key (no es secreto)' }) keyPrefix: string | null;
  @ApiProperty({ description: 'Si tiene key para consultar a AutoMax por MCP' }) hasKey: boolean;
  @ApiProperty({ description: 'Si hay una key saliente guardada (cifrada)' }) hasOutboundKey: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastUsedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) keyRotatedAt: Date | null;
  @ApiProperty() limitPerMinute: number;
  @ApiProperty() limitPerDay: number;
  @ApiProperty({ enum: OUTBOUND_AUTH, description: 'Cómo se autentica la llamada saliente de AutoMax a ese bot' }) outboundAuth: string;
  @ApiProperty({ description: 'Máximo de consultas por minuto de AutoMax a ese bot' }) outboundLimitPerMinute: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

/** Respuesta de crear y de rotar: la ÚNICA vez que se ve la key en claro. */
export class BotWithKeyDto {
  @ApiProperty({ type: BotViewDto }) bot: BotViewDto;
  @ApiProperty({ example: 'amx_1a2b3c4d_…', description: 'Se muestra UNA sola vez y no se puede recuperar: si se pierde, se rota' })
  apiKey: string;
}
