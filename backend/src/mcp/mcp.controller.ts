import { Controller, NotImplementedException, Post, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { McpAuthGuard, McpPreAuthGuard } from './gateway/mcp.guards.js';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  @Public()
  @UseGuards(McpPreAuthGuard, McpAuthGuard)
  @Post()
  @ApiOperation({
    summary: 'Servidor MCP para bots externos (key de bot en Authorization: Bearer)',
    description:
      'JSON-RPC de MCP por Streamable HTTP, sin estado. Solo lectura del catálogo público. Autenticación con la key del bot ' +
      '(`Authorization: Bearer amx_…`). Una key falsa, mal formada, ausente o de un bot desactivado reciben EXACTAMENTE el mismo 401. ' +
      'Cuerpo de hasta 16 KB; respuesta de hasta 4 KB. Límite propio por bot (30 por minuto y 2.000 por día por defecto) y límites ' +
      'por IP antes de autenticar; el bloqueo por IP depende de `trust proxy` (ver DECISIONES.md).',
  })
  @ApiUnauthorizedResponse({ description: 'Key ausente, falsa, mal formada o de un bot desactivado (respuesta idéntica)' })
  @ApiForbiddenResponse({ description: 'Origin o Host no permitidos' })
  @ApiPayloadTooLargeResponse({ description: 'Cuerpo de más de 16 KB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'El tipo de contenido no es application/json' })
  @ApiTooManyRequestsResponse({ description: 'Límite por IP, global o del bot (con Retry-After)' })
  handle(): never {
    // El servidor MCP (transporte, tools y respuesta) llega en el paso 3; por ahora solo está la puerta de entrada.
    throw new NotImplementedException('El servidor MCP está en construcción');
  }
}
