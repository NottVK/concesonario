import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { publicThrottle } from '../common/throttle.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { ClientesService } from './clientes.service.js';
import { CreatedIdDto, CustomerDto, UpdateCustomerDto } from './dto/customer.dto.js';
import { CustomerQueryDto } from './dto/customer-query.dto.js';
import { Customer } from './entities/customer.entity.js';

@ApiTags('clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly customers: ClientesService) {}

  /** Registro abierto (lo usan el formulario y el chatbot); los datos solo los lee el personal. */
  @Public()
  @Throttle(publicThrottle(10))
  @Post()
  @ApiOperation({ summary: 'Registrar un cliente (público, 10 por minuto); solo devuelve el id' })
  @ApiCreatedResponse({ type: CreatedIdDto })
  @ApiConflictResponse({ description: 'Ya existe un cliente con ese correo' })
  create(@Body() dto: CustomerDto): Promise<CreatedIdDto> {
    return this.customers.create(dto).then(({ id }) => ({ id }));
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Listar y buscar clientes (vendedor, admin)' })
  @ApiPaginatedResponse(Customer)
  findAll(@Query() query: CustomerQueryDto): Promise<Paginated<Customer>> {
    return this.customers.findAll(query);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un cliente (vendedor, admin)' })
  @ApiOkResponse({ type: Customer })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<Customer> {
    return this.customers.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar los datos de un cliente (vendedor, admin); exige la versión leída' })
  @ApiOkResponse({ type: Customer })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Otra persona lo editó (versión vieja) o el correo ya está en uso' })
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateCustomerDto): Promise<Customer> {
    return this.customers.update(id, dto);
  }
}
