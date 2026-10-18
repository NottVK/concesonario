import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from '../vehiculos/entities/vehicle.entity.js';
import { Brand } from './entities/brand.entity.js';
import { MarcasController } from './marcas.controller.js';
import { MarcasService } from './marcas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Brand, Vehicle])],
  controllers: [MarcasController],
  providers: [MarcasService],
  exports: [TypeOrmModule],
})
export class MarcasModule {}
