import { Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators.js';
import { BotChannel } from '../mcp/gateway/bot-channel.js';
import { BotAuthGuard, BotPreAuthGuard } from '../mcp/gateway/bot.guards.js';
import type { BotRequest } from '../mcp/gateway/bot.guards.js';
import { MCP_DEFAULTS } from '../mcp/mcp.config.js';
import { readBody } from '../mcp/mcp-http.js';
import { A2A_CONFIG, A2A_SKILLS } from './a2a.config.js';
import type { A2aConfig } from './a2a.config.js';
import { A2aTasksService } from './inbound/tasks.service.js';

/**
 * Tarjeta del bot (CLAUDE.md §7B). Pública y sin autenticación: solo dice qué sabe hacer. La `url` sale de la
 * configuración (`A2A_PUBLIC_BASE_URL`), NUNCA de la cabecera Host de quien la pide.
 */
@ApiTags('a2a')
@Controller('.well-known')
export class AgentCardController {
  constructor(@Inject(A2A_CONFIG) private readonly config: A2aConfig) {}

  @Public()
  @Get('agent.json')
  @ApiOperation({ summary: 'Tarjeta del bot AutoMax (pública): nombre, URL de las tareas y habilidades' })
  @ApiOkResponse({ description: 'Tarjeta A2A' })
  card(@Res({ passthrough: true }) res: Response): object {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return {
      name: 'AutoMax Bot',
      description: 'Concesionario: stock, precios y citas',
      url: `${this.config.publicBaseUrl}/a2a`,
      version: '1.0.0',
      skills: [...A2A_SKILLS],
      authentication: { schemes: ['bearer'], note: 'Authorization: Bearer amx_… (la key la entrega AutoMax al registrar el bot)' },
    };
  }
}

/**
 * Tareas entrantes de otros bots. Comparte con el MCP la puerta (IP, 401 idéntico y cuota diaria por bot); la
 * identidad sale de la key, y `from` es solo informativo. Sin modelo de lenguaje: ver `A2aTasksService`.
 */
@ApiTags('a2a')
@BotChannel('a2a')
@Controller('a2a')
export class A2aTasksController {
  constructor(private readonly tasks: A2aTasksService) {}

  @Public()
  @UseGuards(BotPreAuthGuard, BotAuthGuard)
  @Post('tasks')
  @ApiOperation({
    summary: 'Recibe una tarea de otro bot (key de bot en Authorization: Bearer)',
    description:
      'Cuerpo: `{ "from": "mi-bot", "message": "¿Tienen Mazda 3 2024?" }`, o con habilidad explícita ' +
      '`{ "skill": "stock" | "precios" | "citas" | "financiacion", "params": { … } }`. Responde solo con información pública ' +
      '(catálogo y simulador); nunca datos de clientes. `citas` es informativa: por este canal no se agenda. Cuerpo de hasta 16 KB, ' +
      'respuesta de hasta 4 KB. Una key falsa, ausente o de un bot desactivado reciben EXACTAMENTE el mismo 401.',
  })
  @ApiOkResponse({ description: 'Tarea resuelta (`completed`) o falta información (`needs_input`)' })
  @ApiUnauthorizedResponse({ description: 'Key ausente, falsa, mal formada o de un bot desactivado (respuesta idéntica)' })
  @ApiForbiddenResponse({ description: 'Origin o Host no permitidos' })
  @ApiPayloadTooLargeResponse({ description: 'Cuerpo de más de 16 KB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'El tipo de contenido no es application/json' })
  @ApiTooManyRequestsResponse({ description: 'Límite por IP, global o del bot (con Retry-After)' })
  async handle(@Req() req: BotRequest, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const body = await readBody(req, MCP_DEFAULTS.maxBodyBytes);
    if (body === null) {
      // Pasó el tope mientras llegaba (p. ej. chunked sin Content-Length): se responde y se corta la conexión.
      res.setHeader('Connection', 'close');
      res.once('finish', () => req.destroy());
      req.releaseQuota?.();
      res.status(413).json({ statusCode: 413, message: 'La petición es demasiado grande' });
      return;
    }
    let result;
    try {
      result = await this.tasks.handle(req.bot!, body);
    } finally {
      req.releaseQuota?.();
    }
    res.status(result.status).type('application/json').send(result.body);
  }
}
