import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CompareQueryDto } from './dto/compare-query.dto.js';
import { VehicleDto } from './dto/vehicle.dto.js';
import { VehicleQueryDto } from './dto/vehicle-query.dto.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { VehiculosService } from './vehiculos.service.js';

@ApiTags('vehiculos')
@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly vehicles: VehiculosService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Catálogo con filtros, orden y paginación (excluye los vendidos)' })
  @ApiPaginatedResponse(Vehicle)
  findAll(@Query() query: VehicleQueryDto): Promise<Paginated<Vehicle>> {
    return this.vehicles.findAll(query);
  }

  // Debe ir antes de ':id' para que "comparar" no se interprete como un id.
  @Public()
  @Get('comparar')
  @ApiOperation({ summary: 'Compara de 2 a 3 vehículos, en el orden pedido' })
  @ApiOkResponse({ type: [Vehicle] })
  @ApiNotFoundResponse({ description: 'Alguno de los ids no existe' })
  compare(@Query() query: CompareQueryDto): Promise<Vehicle[]> {
    return this.vehicles.compare(query.ids);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un vehículo' })
  @ApiOkResponse({ type: Vehicle })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Vehicle> {
    return this.vehicles.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Crear vehículo (admin)' })
  @ApiCreatedResponse({ type: Vehicle })
  @ApiConflictResponse({ description: 'Ya existe esa marca, modelo, año y versión' })
  create(@Body() dto: VehicleDto): Promise<Vehicle> {
    return this.vehicles.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar un vehículo (admin); uno vendido no se modifica' })
  @ApiOkResponse({ type: Vehicle })
  @ApiConflictResponse({ description: 'El vehículo ya está vendido o el dato se repite' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: VehicleDto): Promise<Vehicle> {
    return this.vehicles.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borrar vehículo (admin)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Tiene citas o ventas asociadas' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.vehicles.remove(id);
  }
}
