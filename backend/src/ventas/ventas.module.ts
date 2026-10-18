import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity.js';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sale])],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [TypeOrmModule],
})
export class VentasModule {}
