import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CitasController } from './citas.controller.js';
import { CitasService } from './citas.service.js';
import { DisponibilidadController } from './disponibilidad.controller.js';
import { Appointment } from './entities/appointment.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment])],
  controllers: [CitasController, DisponibilidadController],
  providers: [CitasService],
  exports: [TypeOrmModule],
})
export class CitasModule {}
