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
import { DEFAULT_AVAILABILITY_DAYS, MAX_AVAILABILITY_DAYS } from './dto/availability.dto.js';
import type { AvailabilityDto, AvailabilityQueryDto } from './dto/availability.dto.js';
import type { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import type { PublicAppointmentDto } from './dto/public-appointment.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';
import { Appointment, AppointmentStatus } from './entities/appointment.entity.js';

const DAY_MS = 86_400_000;

@Injectable()
export class CitasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  async create(dto: CreateAppointmentDto, now = new Date()): Promise<PublicAppointmentDto> {
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

  /**
   * Franjas ocupadas de un vehículo en un rango. Es público, así que solo expone inicio y fin:
   * nada del cliente ni del estado. Las citas canceladas no ocupan franja.
   */
  async availability(
    vehicleId: number,
    query: AvailabilityQueryDto,
    now = new Date(),
  ): Promise<AvailabilityDto> {
    const from = query.from ? new Date(query.from) : now;
    const to = query.to ? new Date(query.to) : new Date(from.getTime() + DEFAULT_AVAILABILITY_DAYS * DAY_MS);
    this.assertValidRange(from, to);
    await this.assertVehicleAvailable(this.dataSource.manager, vehicleId);

    const rows = await this.appointments
      .createQueryBuilder('a')
      .select(['a.id', 'a.scheduledAt', 'a.durationMin'])
      .where('a.vehicleId = :vehicleId', { vehicleId })
      .andWhere('a.status <> :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .andWhere('a.scheduledAt < :to', { to })
      .andWhere("a.scheduledAt + a.durationMin * interval '1 minute' > :from", { from })
      .orderBy('a.scheduledAt', 'ASC')
      .addOrderBy('a.id', 'ASC')
      .getMany();

    return {
      vehicleId,
      from,
      to,
      durationMin: APPOINTMENT_DURATION_MIN,
      busy: rows.map((row) => ({
        startsAt: row.scheduledAt,
        endsAt: new Date(row.scheduledAt.getTime() + row.durationMin * 60_000),
      })),
    };
  }

  private assertValidRange(from: Date, to: Date): void {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Las fechas from y to deben ser válidas');
    }
    if (to.getTime() <= from.getTime()) throw new BadRequestException('to debe ser posterior a from');
    if (to.getTime() - from.getTime() > MAX_AVAILABILITY_DAYS * DAY_MS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_AVAILABILITY_DAYS} días`);
    }
  }

  async findAll(query: AppointmentQueryDto): Promise<Paginated<Appointment>> {
    const qb = this.appointments
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.customer', 'c')
      .innerJoinAndSelect('a.vehicle', 'v')
      .innerJoinAndSelect('v.brand', 'b')
      .orderBy('a.scheduledAt', 'ASC')
      .addOrderBy('a.id', 'ASC');
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.vehicleId) qb.andWhere('a.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (query.from) qb.andWhere('a.scheduledAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.scheduledAt <= :to', { to: new Date(query.to) });

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
    // Condicionado al estado leído: si otra petición lo cambió en medio, no se pisa en silencio.
    const result = await this.appointments.update(
      { id, status: appointment.status },
      { status: dto.status },
    );
    if (!result.affected) {
      throw new ConflictException('La cita cambió de estado mientras la procesábamos; reintenta');
    }
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

  private toPublic(appointment: Appointment): PublicAppointmentDto {
    return {
      id: appointment.id,
      vehicleId: appointment.vehicleId,
      scheduledAt: appointment.scheduledAt,
      endsAt: new Date(appointment.scheduledAt.getTime() + appointment.durationMin * 60_000),
      status: appointment.status,
    };
  }
}
