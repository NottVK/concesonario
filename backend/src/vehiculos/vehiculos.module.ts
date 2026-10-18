import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle])],
  exports: [TypeOrmModule],
})
export class VehiculosModule {}
