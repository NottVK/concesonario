import { Controller, Get, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { FichasVinService } from './fichas-vin.service.js';
import type { FichaVinView } from './fichas-vin.service.js';

@ApiTags('fichas-vin')
@Controller('fichas-vin')
export class FichasVinController {
  constructor(private readonly fichas: FichasVinService) {}

  @Public()
  @Throttle(publicThrottle(20))
  @Get(':vin')
  @ApiOperation({ summary: 'Ficha pública de un vehículo por su VIN (marca, modelo, año, versión, carrocería, puertas, combustible, transmisión)' })
  @ApiOkResponse({ description: 'Solo los campos públicos de la ficha' })
  @ApiBadRequestResponse({ description: 'El VIN no tiene 17 caracteres válidos' })
  @ApiNotFoundResponse({ description: 'No hay ficha pública para ese VIN (mismo mensaje exista o no)' })
  find(@Param('vin') vin: string): Promise<FichaVinView> {
    return this.fichas.find(vin);
  }
}
