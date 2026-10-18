import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CitasController } from './citas.controller.js';
import { CitasService } from './citas.service.js';
import { Appointment } from './entities/appointment.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment])],
  controllers: [CitasController],
  providers: [CitasService],
  exports: [TypeOrmModule],
})
export class CitasModule {}
