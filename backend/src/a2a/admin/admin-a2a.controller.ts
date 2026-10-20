import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { Roles } from '../../common/decorators.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { UserRole } from '../../usuarios/entities/user.entity.js';
import { BotExchange } from '../entities/bot-exchange.entity.js';
import { A2aOutboundService } from '../outbound/a2a-outbound.service.js';
import { ConnectionTestDto, EXCHANGES_MAX_LIMIT, ExchangesPageDto, ExchangesQueryDto } from './admin-a2a.dto.js';
import type { ExchangeViewDto } from './admin-a2a.dto.js';

const NO_STORE = 'no-store, no-cache, must-revalidate, private';

/** Panel de la conexión con otros bots: probar la conexión y ver lo que se ha intercambiado. Solo admin. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminA2aController {
  constructor(
    private readonly outbound: A2aOutboundService,
    @InjectRepository(BotExchange) private readonly exchanges: Repository<BotExchange>,
  ) {}

  @Post('bots/:id/probar-conexion')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({
    summary: 'Probar la conexión con un bot (admin)',
    description:
      'Lee la tarjeta `/.well-known/agent.json` del origen registrado por el mismo cliente seguro de las consultas (política SSRF, sin redirecciones, ' +
      'tope de 4 KB y 8 s). Máximo 5 por minuto en total. Responde 200 aunque la prueba falle: `ok: false` con la categoría y un mensaje fijo, sin ' +
      'direcciones ni códigos de red. El nombre y la descripción que dice el bot son texto de un tercero, saneado.',
  })
  @ApiOkResponse({ type: ConnectionTestDto })
  @ApiNotFoundResponse()
  @ApiTooManyRequestsResponse({ description: 'Más de 5 pruebas en un minuto (también como `ok: false`, `status: limite`)' })
  testConnection(@Param('id', ParseIdPipe) id: number): Promise<ConnectionTestDto> {
    return this.outbound.testConnection(id);
  }

  @Get('intercambios')
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({
    summary: 'Intercambios con otros bots (admin)',
    description:
      'Auditoría de lo que entra y sale por MCP y A2A, más recientes primero. Las preguntas y respuestas ya vienen redactadas y recortadas (canal a2a: 30 días; ' +
      'mcp: 90). Todo es TEXTO PLANO: la interfaz debe pintarlo como texto y nunca llega a un prompt.',
  })
  @ApiOkResponse({ type: ExchangesPageDto })
  async listExchanges(@Query() query: ExchangesQueryDto): Promise<ExchangesPageDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, EXCHANGES_MAX_LIMIT);
    const qb = this.exchanges.createQueryBuilder('x').innerJoinAndSelect('x.bot', 'bot').orderBy('x.id', 'DESC').skip((page - 1) * limit).take(limit);
    if (query.botId !== undefined) qb.andWhere('x.botId = :botId', { botId: query.botId });
    if (query.channel) qb.andWhere('x.channel = :channel', { channel: query.channel });
    if (query.direction) qb.andWhere('x.direction = :direction', { direction: query.direction });
    if (query.status) qb.andWhere('x.status = :status', { status: query.status });
    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map((row): ExchangeViewDto => ({
      id: row.id,
      botId: row.botId,
      botName: row.bot.name,
      direction: row.direction,
      channel: row.channel,
      status: row.status,
      question: row.question,
      answer: row.answer,
      tool: row.tool,
      argsSummary: row.argsSummary,
      requestId: row.requestId,
      durationMs: row.durationMs,
      bytesIn: row.bytesIn,
      bytesOut: row.bytesOut,
      createdAt: row.createdAt,
    }));
    return { data, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  }
}
