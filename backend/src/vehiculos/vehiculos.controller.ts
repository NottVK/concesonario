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
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CompareQueryDto } from './dto/compare-query.dto.js';
import { VehicleDto } from './dto/vehicle.dto.js';
import { VehicleQueryDto } from './dto/vehicle-query.dto.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { VehiculosService } from './vehiculos.service.js';

@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly vehicles: VehiculosService) {}

  @Public()
  @Get()
  findAll(@Query() query: VehicleQueryDto): Promise<Paginated<Vehicle>> {
    return this.vehicles.findAll(query);
  }

  // Debe ir antes de ':id' para que "comparar" no se interprete como un id.
  @Public()
  @Get('comparar')
  compare(@Query() query: CompareQueryDto): Promise<Vehicle[]> {
    return this.vehicles.compare(query.ids);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Vehicle> {
    return this.vehicles.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: VehicleDto): Promise<Vehicle> {
    return this.vehicles.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: VehicleDto): Promise<Vehicle> {
    return this.vehicles.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.vehicles.remove(id);
  }
}
