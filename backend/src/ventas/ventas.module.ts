import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sale])],
  exports: [TypeOrmModule],
})
export class VentasModule {}
