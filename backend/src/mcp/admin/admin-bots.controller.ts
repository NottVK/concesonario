import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { UserRole } from '../../usuarios/entities/user.entity.js';
import { BotKeysService } from '../keys/bot-keys.service.js';
import type { BotView } from '../keys/bot-keys.service.js';
import { BotViewDto, BotWithKeyDto, CreateBotDto, UpdateBotDto } from './bot.dto.js';

// Las respuestas con una key en claro no se guardan en ninguna caché (ni del navegador ni de un proxy).
const NO_STORE = 'no-store, no-cache, must-revalidate, private';

/** Bots amigos que consultan a AutoMax por MCP: crear, rotar y desactivar sus keys. Solo admin. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/bots')
export class AdminBotsController {
  constructor(private readonly keys: BotKeysService) {}

  @Get()
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Lista de bots externos, sin ningún secreto (admin)' })
  @ApiOkResponse({ type: [BotViewDto] })
  list(): Promise<BotView[]> {
    return this.keys.list();
  }

  @Post()
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Crear un bot y su key (admin)',
    description:
      'La key en claro (`apiKey`) se muestra UNA sola vez en esta respuesta (`Cache-Control: no-store`); en la base solo ' +
      'queda su prefijo y un HMAC. Si se pierde, se rota.',
  })
  @ApiCreatedResponse({ type: BotWithKeyDto })
  @ApiConflictResponse({ description: 'Ya existe un bot con ese nombre' })
  create(@Body() dto: CreateBotDto): Promise<BotWithKeyDto> {
    return this.keys.create(dto);
  }

  @Post(':id/rotar-clave')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Rotar la key de un bot (admin)',
    description: 'Genera una key nueva y la anterior deja de servir al instante. La nueva se muestra UNA sola vez (`Cache-Control: no-store`).',
  })
  @ApiOkResponse({ type: BotWithKeyDto })
  @ApiNotFoundResponse()
  rotate(@Param('id', ParseIdPipe) id: number): Promise<BotWithKeyDto> {
    return this.keys.rotate(id);
  }

  @Patch(':id')
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Activar o desactivar un bot y cambiar sus límites o su key saliente (admin)' })
  @ApiOkResponse({ type: BotViewDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateBotDto): Promise<BotView> {
    return this.keys.update(id, dto);
  }
}
