import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PaginationDto } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { Sale } from './entities/sale.entity.js';
import { VentasService } from './ventas.service.js';

@ApiTags('ventas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SELLER)
@Controller('ventas')
export class VentasController {
  constructor(private readonly sales: VentasService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar una venta (vendedor, admin)',
    description:
      'En una sola transacción bloquea el vehículo, registra la venta, lo marca vendido y cancela sus citas abiertas. El vendedor sale del token.',
  })
  @ApiCreatedResponse({ type: Sale })
  @ApiNotFoundResponse({ description: 'El vehículo o el cliente no existen' })
  @ApiConflictResponse({ description: 'El vehículo ya fue vendido' })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser): Promise<Sale> {
    return this.sales.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ventas, las más recientes primero' })
  @ApiPaginatedResponse(Sale)
  findAll(@Query() query: PaginationDto): Promise<Paginated<Sale>> {
    return this.sales.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una venta' })
  @ApiOkResponse({ type: Sale })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Sale> {
    return this.sales.findOne(id);
  }
}
