import { Body, Controller, Get, Headers, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiBearerAuth, ApiConflictResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CaseSummaryDto, DecisionDto, IdentifyDto } from './dto/garantias.dto.js';
import { WarrantyStatus } from './entities/caso-garantia.entity.js';
import { GarantiasService, IDENTIFY_FAILED_MESSAGE } from './garantias.service.js';

@ApiTags('garantias')
@Controller()
export class GarantiasController {
  constructor(private readonly garantias: GarantiasService) {}

  @Public()
  @Throttle(publicThrottle(10))
  @Post('chat/garantias/identificar')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Chat-Session', required: true, description: 'Token de sesión del chat' })
  @ApiOperation({
    summary: 'Identificar al propietario (documento + VIN) para el flujo de garantía (público, con límite por IP)',
    description:
      'Formulario del chat: el documento NUNCA va por la conversación. Si no coincide (documento, VIN o ambos) la respuesta es idéntica. ' +
      'Desde aquí el caso queda atado a la sesión y todo usa solo el id cliente-vehículo.',
  })
  @ApiOkResponse({ description: 'Identificado: `{ ok: true }`' })
  @ApiNotFoundResponse({ description: 'No se pudo verificar (mensaje genérico idéntico para cualquier causa)' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos desde esta IP' })
  async identify(@Body() dto: IdentifyDto, @Headers('x-chat-session') token: string | undefined, @Ip() ip: string): Promise<{ ok: true; message: string }> {
    const id = await this.garantias.identify({ sessionToken: token, document: dto.documento, vin: dto.vin, ip });
    if (id === null) throw new NotFoundException(IDENTIFY_FAILED_MESSAGE);
    return { ok: true, message: 'Listo, te identificamos. Cuéntame en el chat qué falla presenta tu vehículo.' };
  }

  @Roles(UserRole.MECHANIC, UserRole.ADMIN)
  @ApiBearerAuth()
  @Get('garantias')
  @ApiOperation({ summary: 'Casos de garantía por estado (rol mecánico o admin); por defecto los pendientes de decisión' })
  @ApiQuery({ name: 'estado', required: false, enum: Object.values(WarrantyStatus) })
  @ApiOkResponse({ type: [CaseSummaryDto] })
  async list(@Query('estado') estado?: string): Promise<CaseSummaryDto[]> {
    const status = Object.values(WarrantyStatus).find((value) => value === estado) ?? WarrantyStatus.PENDING_MECHANIC;
    const rows = await this.garantias.list(status);
    return rows.map((row) => ({
      id: row.id,
      estado: row.status,
      vin: row.vin,
      falla: row.fault,
      cambiosAjenos: row.foreignChanges,
      noVerificado: row.unverified,
      citaInicio: row.appointmentAt?.toISOString() ?? null,
      motivo: row.reason,
      repuestos: row.parts,
      creadoEn: row.createdAt.toISOString(),
    }));
  }

  @Roles(UserRole.MECHANIC, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('garantias/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'El mecánico acepta o rechaza la garantía (con motivo al rechazar; con repuestos al aceptar)',
    description:
      'Aceptar: el costo lo asume el concesionario y se registra el cobro en Pagos con una Idempotency-Key fija por caso; repetir la ' +
      'llamada no duplica el cobro. El cliente recibe el resultado (repuestos o motivo) en el chat.',
  })
  @ApiOkResponse({ description: 'Estado del caso tras la decisión' })
  @ApiNotFoundResponse({ description: 'No existe el caso' })
  @ApiConflictResponse({ description: 'El caso no está pendiente de decisión' })
  @ApiBadGatewayResponse({ description: 'Pagos no respondió; el caso sigue pendiente' })
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser): ReturnType<GarantiasService['decide']> {
    return this.garantias.decide(id, user.id, dto.accion, dto.motivo, dto.repuestos);
  }
}
