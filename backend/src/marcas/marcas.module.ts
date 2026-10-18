import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './entities/brand.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Brand])],
  exports: [TypeOrmModule],
})
export class MarcasModule {}
