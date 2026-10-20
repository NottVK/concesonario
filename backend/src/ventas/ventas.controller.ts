import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PaginationDto } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SaleDetailDto, SaleListItemDto } from './dto/sale-view.dto.js';
import { Sale } from './entities/sale.entity.js';
import { VentasService } from './ventas.service.js';

@ApiTags('ventas')
@ApiBearerAuth()
// Por defecto solo admin: una ruta nueva nunca queda abierta al vendedor por olvido. El vendedor solo registra ventas.
@Roles(UserRole.ADMIN)
@Controller('ventas')
export class VentasController {
  constructor(private readonly sales: VentasService) {}

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Post()
  @ApiOperation({
    summary: 'Registrar una venta (vendedor, admin)',
    description:
      'En una sola transacción bloquea el vehículo, registra la venta, lo marca vendido y cancela sus citas abiertas. ' +
      'Quien la registra sale del token (nunca del cuerpo) y queda guardado en la venta. El precio final debe ser mayor que cero y no superar $ 5.000.000.000.',
  })
  @ApiCreatedResponse({ type: Sale })
  @ApiNotFoundResponse({ description: 'El vehículo o el cliente no existen' })
  @ApiBadRequestResponse({ description: 'Precio final inválido (cero, negativo, con más de 2 decimales o sobre el tope) o campos extra' })
  @ApiConflictResponse({ description: 'El vehículo ya fue vendido' })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser): Promise<Sale> {
    return this.sales.create(dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar ventas, las más recientes primero (admin)',
    description: 'Cada venta trae solo el nombre del cliente: el correo está en el detalle y el teléfono nunca se devuelve.',
  })
  @ApiPaginatedResponse(SaleListItemDto)
  findAll(@Query() query: PaginationDto): Promise<Paginated<SaleListItemDto>> {
    return this.sales.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una venta, con el correo del cliente (admin)' })
  @ApiOkResponse({ type: SaleDetailDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<SaleDetailDto> {
    return this.sales.findOne(id);
  }
}
