import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { publicThrottle } from '../common/throttle.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CitasService } from './citas.service.js';
import type { PublicAppointment } from './citas.service.js';
import { AppointmentQueryDto } from './dto/appointment-query.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { Appointment } from './entities/appointment.entity.js';

@Controller('citas')
export class CitasController {
  constructor(private readonly appointments: CitasService) {}

  /** Agendar es abierto; consultar citas exige sesión de vendedor o admin. */
  @Public()
  @Throttle(publicThrottle(10))
  @Post()
  create(@Body() dto: CreateAppointmentDto): Promise<PublicAppointment> {
    return this.appointments.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Get()
  findAll(@Query() query: AppointmentQueryDto): Promise<Paginated<Appointment>> {
    return this.appointments.findAll(query);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Appointment> {
    return this.appointments.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Patch(':id/estado')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ): Promise<Appointment> {
    return this.appointments.updateStatus(id, dto);
  }
}
