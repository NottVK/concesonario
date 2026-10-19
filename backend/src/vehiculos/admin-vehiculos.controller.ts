import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { AdminVehicleQueryDto } from './dto/vehicle-query.dto.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { VehiculosService } from './vehiculos.service.js';

/** Inventario completo para el panel admin, vendidos incluidos. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/vehiculos')
export class AdminVehiculosController {
  constructor(private readonly vehicles: VehiculosService) {}

  @Get()
  @ApiOperation({ summary: 'Inventario completo con filtros y paginación, incluidos los vendidos (admin)' })
  @ApiPaginatedResponse(Vehicle)
  findAll(@Query() query: AdminVehicleQueryDto): Promise<Paginated<Vehicle>> {
    return this.vehicles.findAll(query, true);
  }
}
