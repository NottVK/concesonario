import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { CitasService } from './citas.service.js';
import { AvailabilityDto, AvailabilityQueryDto } from './dto/availability.dto.js';

/** Vive en el módulo de citas (de ahí salen los datos) pero cuelga de /vehiculos/:id. */
@ApiTags('citas')
@Controller('vehiculos')
export class DisponibilidadController {
  constructor(private readonly appointments: CitasService) {}

  @Public()
  @Throttle(publicThrottle(30))
  @Get(':id/disponibilidad')
  @ApiOperation({
    summary: 'Franjas ocupadas de un vehículo para test-drive (público, 30 por minuto)',
    description:
      'Devuelve solo las franjas ya reservadas, sin datos de clientes ni del estado de la cita. ' +
      'El horario de atención (lunes a sábado, 8:00–18:00 hora de Bogotá) no se repite aquí.',
  })
  @ApiOkResponse({ type: AvailabilityDto })
  @ApiBadRequestResponse({ description: 'Fechas inválidas, to ≤ from o rango de más de 62 días' })
  @ApiNotFoundResponse({ description: 'El vehículo no existe' })
  @ApiConflictResponse({ description: 'El vehículo ya fue vendido' })
  availability(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityDto> {
    return this.appointments.availability(id, query);
  }
}
