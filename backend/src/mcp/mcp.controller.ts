import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
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
import type { Request, Response } from 'express';
import { Public } from '../common/decorators.js';
import { McpAuthGuard, McpPreAuthGuard } from './gateway/mcp.guards.js';
import type { McpRequest } from './gateway/mcp.guards.js';
import { MCP_DEFAULTS } from './mcp.config.js';
import { McpService } from './server/mcp.service.js';

/** Lee el cuerpo contando los bytes REALES recibidos (no solo Content-Length): null si pasa el tope. */
async function readBody(req: Request, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const piece = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += piece.length;
    if (size > maxBytes) return null;
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Public()
  @UseGuards(McpPreAuthGuard, McpAuthGuard)
  @Post()
  @ApiOperation({
    summary: 'Servidor MCP para bots externos (key de bot en Authorization: Bearer)',
    description:
      'JSON-RPC de MCP (sin estado, respuestas JSON). Herramientas de SOLO LECTURA sobre el catálogo público: `consultar_stock`, ' +
      '`consultar_precio` y `listar_marcas` (no hay ninguna herramienta que escriba o agende). Autenticación con la key del bot (`Authorization: Bearer amx_…`): ' +
      'una key falsa, mal formada, ausente o de un bot desactivado reciben EXACTAMENTE el mismo 401. Cuerpo de hasta 16 KB; respuesta de ' +
      'hasta 4 KB. Límite propio por bot (30 por minuto y 2.000 por día por defecto) y límites por IP antes de autenticar; el bloqueo por ' +
      'IP depende de `trust proxy` (ver DECISIONES.md).',
  })
  @ApiOkResponse({ description: 'Respuesta JSON-RPC (202 sin cuerpo para notificaciones; 400 con error JSON-RPC si el mensaje no es válido)' })
  @ApiUnauthorizedResponse({ description: 'Key ausente, falsa, mal formada o de un bot desactivado (respuesta idéntica)' })
  @ApiForbiddenResponse({ description: 'Origin o Host no permitidos' })
  @ApiPayloadTooLargeResponse({ description: 'Cuerpo de más de 16 KB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'El tipo de contenido no es application/json' })
  @ApiTooManyRequestsResponse({ description: 'Límite por IP, global o del bot (con Retry-After)' })
  async handle(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
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
      result = await this.mcp.handle(req.mcpBot!, body);
    } finally {
      // Ya auditada (o fallida): la llamada deja de estar «en curso» para el tope diario.
      req.releaseQuota?.();
    }
    if (result.body === null) {
      res.status(result.status).end();
      return;
    }
    res.status(result.status).type('application/json').send(result.body);
  }
}
