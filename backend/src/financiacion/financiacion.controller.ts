import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { SimulateFinancingDto } from './dto/simulate-financing.dto.js';
import { FinanciacionService } from './financiacion.service.js';
import type { FinancingSimulation } from './financiacion.service.js';

@Controller('financiacion')
export class FinanciacionController {
  constructor(private readonly financing: FinanciacionService) {}

  @Public()
  @Throttle(publicThrottle(30))
  @Post('simular')
  @HttpCode(200)
  simulate(@Body() dto: SimulateFinancingDto): FinancingSimulation {
    return this.financing.simulate(dto);
  }
}
