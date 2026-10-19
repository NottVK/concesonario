import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../citas/entities/appointment.entity.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Vehicle } from '../vehiculos/entities/vehicle.entity.js';
import { Sale } from '../ventas/entities/sale.entity.js';
import { MetricasController } from './metricas.controller.js';
import { MetricasService } from './metricas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Brand, Sale, Appointment])],
  controllers: [MetricasController],
  providers: [MetricasService],
})
export class MetricasModule {}
