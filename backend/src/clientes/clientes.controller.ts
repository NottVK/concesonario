import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { publicThrottle } from '../common/throttle.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { ClientesService } from './clientes.service.js';
import { CustomerDto } from './dto/customer.dto.js';
import { CustomerQueryDto } from './dto/customer-query.dto.js';
import { Customer } from './entities/customer.entity.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly customers: ClientesService) {}

  /** Registro abierto (lo usan el formulario y el chatbot); los datos solo los lee el personal. */
  @Public()
  @Throttle(publicThrottle(10))
  @Post()
  create(@Body() dto: CustomerDto): Promise<Pick<Customer, 'id'>> {
    return this.customers.create(dto).then(({ id }) => ({ id }));
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Get()
  findAll(@Query() query: CustomerQueryDto): Promise<Paginated<Customer>> {
    return this.customers.findAll(query);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Customer> {
    return this.customers.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CustomerDto): Promise<Customer> {
    return this.customers.update(id, dto);
  }
}
