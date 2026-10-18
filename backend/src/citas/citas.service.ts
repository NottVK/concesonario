import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Customer } from '../clientes/entities/customer.entity.js';
import { paginate } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { Vehicle, VehicleStatus } from '../vehiculos/entities/vehicle.entity.js';
import { APPOINTMENT_DURATION_MIN, canTransition, validateSlot } from './appointment-rules.js';
import type { AppointmentQueryDto } from './dto/appointment-query.dto.js';
import type { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';
import { Appointment, AppointmentStatus } from './entities/appointment.entity.js';

/** Lo único que ve quien agenda: nada del cliente, para no filtrar datos de terceros. */
export interface PublicAppointment {
  id: number;
  vehicleId: number;
  scheduledAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
}

@Injectable()
export class CitasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  async create(dto: CreateAppointmentDto, now = new Date()): Promise<PublicAppointment> {
    const start = new Date(dto.scheduledAt);
    const problem = validateSlot(start, APPOINTMENT_DURATION_MIN, now);
    if (problem) throw new BadRequestException(problem);

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.assertVehicleAvailable(manager, dto.vehicleId);
      const customer = await this.findOrCreateCustomer(manager, dto.customer);
      await this.assertNoOverlap(manager, dto.vehicleId, customer.id, start);
      return manager.save(
        manager.create(Appointment, {
          vehicleId: dto.vehicleId,
          customerId: customer.id,
          scheduledAt: start,
          durationMin: APPOINTMENT_DURATION_MIN,
        }),
      );
    });
    return this.toPublic(saved);
  }

  async findAll(query: AppointmentQueryDto): Promise<Paginated<Appointment>> {
    const qb = this.appointments
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.customer', 'c')
      .innerJoinAndSelect('a.vehicle', 'v')
      .innerJoinAndSelect('v.brand', 'b')
      .orderBy('a.scheduledAt', 'ASC')
      .addOrderBy('a.id', 'ASC');
    if (query.estado) qb.andWhere('a.status = :estado', { estado: query.estado });
    if (query.vehiculoId) qb.andWhere('a.vehicleId = :vid', { vid: query.vehiculoId });
    if (query.desde) qb.andWhere('a.scheduledAt >= :desde', { desde: new Date(query.desde) });
    if (query.hasta) qb.andWhere('a.scheduledAt <= :hasta', { hasta: new Date(query.hasta) });

    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Appointment> {
    const appointment = await this.appointments.findOne({
      where: { id },
      relations: { customer: true, vehicle: { brand: true } },
    });
    if (!appointment) throw new NotFoundException(`No existe la cita ${id}`);
    return appointment;
  }

  async updateStatus(id: number, dto: UpdateStatusDto): Promise<Appointment> {
    const appointment = await this.findOne(id);
    if (!canTransition(appointment.status, dto.status)) {
      throw new ConflictException(
        `No se puede pasar una cita de ${appointment.status} a ${dto.status}`,
      );
    }
    await this.appointments.update(id, { status: dto.status });
    return this.findOne(id);
  }

  private async assertVehicleAvailable(manager: EntityManager, vehicleId: number): Promise<void> {
    const vehicle = await manager.findOneBy(Vehicle, { id: vehicleId });
    if (!vehicle) throw new NotFoundException(`No existe el vehículo ${vehicleId}`);
    if (vehicle.status === VehicleStatus.SOLD) {
      throw new ConflictException('Ese vehículo ya fue vendido');
    }
  }

  /** Crea el cliente si el correo es nuevo; si ya existe lo reutiliza sin modificar sus datos. */
  private async findOrCreateCustomer(
    manager: EntityManager,
    data: CreateAppointmentDto['customer'],
  ): Promise<Customer> {
    const email = data.email.toLowerCase();
    await manager
      .createQueryBuilder()
      .insert()
      .into(Customer)
      .values({ name: data.name, email, phone: data.phone ?? null })
      .orIgnore()
      .execute();
    return manager.findOneByOrFail(Customer, { email });
  }

  /** Revisión previa solo para dar un mensaje claro; la garantía real son las exclusiones de la BD. */
  private async assertNoOverlap(
    manager: EntityManager,
    vehicleId: number,
    customerId: number,
    start: Date,
  ): Promise<void> {
    const end = new Date(start.getTime() + APPOINTMENT_DURATION_MIN * 60_000);
    const overlapping = (column: 'vehicleId' | 'customerId', value: number): Promise<boolean> =>
      manager
        .createQueryBuilder(Appointment, 'a')
        .where('a.status <> :cancelled', { cancelled: AppointmentStatus.CANCELLED })
        .andWhere(`a.${column} = :value`, { value })
        .andWhere('a.scheduledAt < :end', { end })
        .andWhere("a.scheduledAt + a.durationMin * interval '1 minute' > :start", { start })
        .getExists();

    if (await overlapping('vehicleId', vehicleId)) {
      throw new ConflictException('Ese vehículo ya tiene una cita en ese horario');
    }
    if (await overlapping('customerId', customerId)) {
      throw new ConflictException('Ya tienes otra cita que se cruza con ese horario');
    }
  }

  private toPublic(appointment: Appointment): PublicAppointment {
    return {
      id: appointment.id,
      vehicleId: appointment.vehicleId,
      scheduledAt: appointment.scheduledAt,
      endsAt: new Date(appointment.scheduledAt.getTime() + appointment.durationMin * 60_000),
      status: appointment.status,
    };
  }
}
