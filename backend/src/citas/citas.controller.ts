import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles } from '../common/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { ApiPaginatedResponse } from '../common/swagger.js';
import { publicThrottle } from '../common/throttle.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { CitasService } from './citas.service.js';
import { AppointmentQueryDto } from './dto/appointment-query.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { PublicAppointmentDto } from './dto/public-appointment.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { Appointment } from './entities/appointment.entity.js';

@ApiTags('citas')
@Controller('citas')
export class CitasController {
  constructor(private readonly appointments: CitasService) {}

  /** Agendar es abierto; consultar citas exige sesión de vendedor o admin. */
  @Public()
  @Throttle(publicThrottle(10))
  @Post()
  @ApiOperation({ summary: 'Agendar un test-drive (público, 10 por minuto)' })
  @ApiCreatedResponse({ type: PublicAppointmentDto })
  @ApiBadRequestResponse({ description: 'Fecha pasada, domingo, fuera de horario o datos inválidos' })
  @ApiConflictResponse({ description: 'El vehículo o el cliente ya tienen una cita que se cruza, o el vehículo está vendido' })
  create(@Body() dto: CreateAppointmentDto): Promise<PublicAppointmentDto> {
    return this.appointments.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Listar citas con cliente y vehículo (vendedor, admin)' })
  @ApiPaginatedResponse(Appointment)
  findAll(@Query() query: AppointmentQueryDto): Promise<Paginated<Appointment>> {
    return this.appointments.findAll(query);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cita (vendedor, admin)' })
  @ApiOkResponse({ type: Appointment })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Appointment> {
    return this.appointments.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiBearerAuth()
  @Patch(':id/estado')
  @ApiOperation({ summary: 'Confirmar o cancelar una cita (vendedor, admin)' })
  @ApiOkResponse({ type: Appointment })
  @ApiConflictResponse({ description: 'Transición de estado no permitida' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ): Promise<Appointment> {
    return this.appointments.updateStatus(id, dto);
  }
}
