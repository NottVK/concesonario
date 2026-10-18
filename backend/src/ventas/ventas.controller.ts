import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PaginationDto } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { Sale } from './entities/sale.entity.js';
import { VentasService } from './ventas.service.js';

@Roles(UserRole.ADMIN, UserRole.SELLER)
@Controller('ventas')
export class VentasController {
  constructor(private readonly sales: VentasService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser): Promise<Sale> {
    return this.sales.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: PaginationDto): Promise<Paginated<Sale>> {
    return this.sales.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Sale> {
    return this.sales.findOne(id);
  }
}
