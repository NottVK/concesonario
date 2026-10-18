import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { FinancingSimulationDto, SimulateFinancingDto } from './dto/simulate-financing.dto.js';
import { FinanciacionService } from './financiacion.service.js';

@ApiTags('financiacion')
@Controller('financiacion')
export class FinanciacionController {
  constructor(private readonly financing: FinanciacionService) {}

  @Public()
  @Throttle(publicThrottle(30))
  @Post('simular')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Simular un crédito (público, 30 por minuto)',
    description:
      'Sistema francés con cuota fija. La tasa efectiva anual se convierte a mensual; la cuota se redondea hacia arriba al centavo.',
  })
  @ApiOkResponse({ type: FinancingSimulationDto })
  @ApiBadRequestResponse({ description: 'Plazo fuera de 12–84, cuota inicial ≥ valor o montos inválidos' })
  simulate(@Body() dto: SimulateFinancingDto): FinancingSimulationDto {
    return this.financing.simulate(dto);
  }
}
