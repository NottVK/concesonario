import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { SalesByMonthDto, SalesByMonthQueryDto, StockByBrandDto, SummaryDto } from './dto/metrics.dto.js';
import { MetricasService } from './metricas.service.js';

/** Todo el controlador es solo para admin: el rol se declara a nivel de clase para que ninguna ruta nueva quede abierta. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/metricas')
export class MetricasController {
  constructor(private readonly metrics: MetricasService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Tarjetas del panel: inventario, citas pendientes y ventas del mes (admin)' })
  @ApiOkResponse({ type: SummaryDto })
  summary(): Promise<SummaryDto> {
    return this.metrics.summary();
  }

  @Get('ventas-por-mes')
  @ApiOperation({ summary: 'Ventas por mes calendario de Bogotá, con ceros en los meses vacíos (admin)' })
  @ApiOkResponse({ type: [SalesByMonthDto] })
  @ApiBadRequestResponse({ description: 'months fuera de 1–24' })
  salesByMonth(@Query() query: SalesByMonthQueryDto): Promise<SalesByMonthDto[]> {
    return this.metrics.salesByMonth(query.months);
  }

  @Get('stock-por-marca')
  @ApiOperation({ summary: 'Inventario disponible por marca, incluidas las que tienen 0 (admin)' })
  @ApiOkResponse({ type: [StockByBrandDto] })
  stockByBrand(): Promise<StockByBrandDto[]> {
    return this.metrics.stockByBrand();
  }
}
