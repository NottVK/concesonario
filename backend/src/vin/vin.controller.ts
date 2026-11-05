import { Controller, Get, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { VinInfoDto } from './dto/vin-info.dto.js';
import { VinService } from './vin.service.js';

@ApiTags('vin')
@Controller('vin')
export class VinController {
  constructor(private readonly vins: VinService) {}

  @Public()
  @Throttle(publicThrottle(30))
  @Get(':vin')
  @ApiOperation({
    summary: 'Datos de fábrica de un vehículo por su VIN (público, 30 por minuto)',
    description:
      'Siempre devuelve qué significa cada parte del VIN (`structure`: país, fabricante, dígito verificador, año, planta y serie). ' +
      'Los datos salen del registro del concesionario si está; si no, de la base pública de la NHTSA (`external`) y, si tampoco, ' +
      'solo la marca y el año por la estructura. Nunca devuelve datos del propietario.',
  })
  @ApiParam({ name: 'vin', example: '9FBHJD204LM500005', description: '17 caracteres, sin I, O ni Q (mayúsculas o minúsculas)' })
  @ApiOkResponse({ type: VinInfoDto })
  @ApiBadRequestResponse({ description: 'El VIN no tiene el formato de 17 caracteres' })
  lookup(@Param('vin') vin: string): Promise<VinInfoDto> {
    return this.vins.lookup(vin);
  }
}
