import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { AdminVehiculosController } from './admin-vehiculos.controller.js';
import { VehiculosController } from './vehiculos.controller.js';
import { VehiculosService } from './vehiculos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Brand]), EmbeddingsModule],
  controllers: [VehiculosController, AdminVehiculosController],
  providers: [VehiculosService],
  exports: [TypeOrmModule, VehiculosService],
})
export class VehiculosModule {}
