import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { AdminVehiculosController } from './admin-vehiculos.controller.js';
import { VehiculosController } from './vehiculos.controller.js';
import { VehiculosService } from './vehiculos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Brand])],
  controllers: [VehiculosController, AdminVehiculosController],
  providers: [VehiculosService],
  exports: [TypeOrmModule],
})
export class VehiculosModule {}
