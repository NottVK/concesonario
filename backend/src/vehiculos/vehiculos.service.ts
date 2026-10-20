import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import { paginate } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { escapeLike } from '../common/sql.js';
import { Appointment } from '../citas/entities/appointment.entity.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Sale } from '../ventas/entities/sale.entity.js';
import type { UpdateVehicleDto, VehicleDto } from './dto/vehicle.dto.js';
import type { VehicleFilters, VehicleSort } from './dto/vehicle-query.dto.js';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity.js';

const SORTS: Record<VehicleSort, [string, 'ASC' | 'DESC']> = {
  newest: ['v.id', 'DESC'],
  price_asc: ['v.price', 'ASC'],
  price_desc: ['v.price', 'DESC'],
  year_desc: ['v.year', 'DESC'],
  year_asc: ['v.year', 'ASC'],
};

const SOLD_MESSAGE = 'Un vehículo vendido no se puede modificar';
const STALE_MESSAGE =
  'Otra persona modificó este vehículo mientras lo editabas. Recarga para ver los cambios y vuelve a intentarlo.';

@Injectable()
export class VehiculosService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
  ) {}

  /** `includeSold` solo lo activa el listado admin; el catálogo público nunca muestra vendidos. */
  async findAll(query: VehicleFilters, includeSold = false): Promise<Paginated<Vehicle>> {
    if (query.yearMin && query.yearMax && query.yearMin > query.yearMax) {
      throw new BadRequestException('yearMin no puede ser mayor que yearMax');
    }
    const qb = this.vehicles.createQueryBuilder('v').innerJoinAndSelect('v.brand', 'b');
    if (!includeSold) qb.where('v.status <> :sold', { sold: VehicleStatus.SOLD });
    this.applyFilters(qb, query);

    const [column, direction] = SORTS[query.sort];
    qb.orderBy(column, direction);
    // Desempate estable para paginar; no se agrega si ya se ordena por id (TypeORM lo sobrescribiría).
    if (column !== 'v.id') qb.addOrderBy('v.id', 'ASC');
    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Vehicle> {
    const vehicle = await this.vehicles.findOne({ where: { id }, relations: { brand: true } });
    if (!vehicle) throw new NotFoundException(`No existe el vehículo ${id}`);
    return vehicle;
  }

  /** Devuelve los vehículos en el orden pedido; falla si alguno no existe. */
  async compare(ids: number[]): Promise<Vehicle[]> {
    const found = await this.vehicles.find({ where: { id: In(ids) }, relations: { brand: true } });
    const byId = new Map(found.map((vehicle) => [vehicle.id, vehicle]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`No existen los vehículos: ${missing.join(', ')}`);
    }
    return ids.map((id) => byId.get(id) as Vehicle);
  }

  async create(dto: VehicleDto): Promise<Vehicle> {
    await this.assertBrandExists(dto.brandId);
    const vehicle = this.vehicles.create(this.toFields(dto));
    const saved = await this.vehicles.save(vehicle);
    return this.findOne(saved.id);
  }

  /**
   * Reemplaza el vehículo solo si sigue en la revisión que leyó el cliente y no se ha vendido. La condición va
   * en el propio UPDATE (no solo en una lectura previa): si una venta o una edición se cuela en medio, no se
   * pisa en silencio. Se responde 409 con el motivo (vendido o desactualizado).
   */
  async update(id: number, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    this.assertEditable(vehicle, dto.revision);
    await this.assertBrandExists(dto.brandId);
    const result = await this.vehicles.update(
      { id, revision: dto.revision, status: Not(VehicleStatus.SOLD) },
      { ...this.toFields(dto), revision: () => 'revision + 1' },
    );
    if (!result.affected) this.assertEditable(await this.findOne(id), dto.revision, true);
    return this.findOne(id);
  }

  /** `afterConflict`: el UPDATE condicionado no tocó filas, así que algo cambió aunque la versión coincida. */
  private assertEditable(vehicle: Vehicle, revision: number, afterConflict = false): void {
    if (vehicle.status === VehicleStatus.SOLD) throw new ConflictException(SOLD_MESSAGE);
    if (vehicle.revision !== revision || afterConflict) throw new ConflictException(STALE_MESSAGE);
  }

  /** Un vehículo con ventas o citas (aunque estén canceladas) es parte del historial y no se borra. */
  async remove(id: number): Promise<void> {
    const vehicle = await this.findOne(id);
    const [sales, appointments] = await Promise.all([
      this.vehicles.manager.countBy(Sale, { vehicleId: id }),
      this.vehicles.manager.countBy(Appointment, { vehicleId: id }),
    ]);
    if (sales > 0 || appointments > 0) {
      const parts = [
        sales > 0 ? 'una venta registrada' : null,
        appointments > 0 ? `${appointments} cita(s) (incluidas las canceladas)` : null,
      ].filter(Boolean);
      throw new ConflictException(
        `No se puede borrar ${vehicle.model}: tiene ${parts.join(' y ')}. Los vehículos con historial no se borran.`,
      );
    }
    await this.vehicles.remove(vehicle);
  }

  private applyFilters(qb: SelectQueryBuilder<Vehicle>, q: VehicleFilters): void {
    if (q.brandId) qb.andWhere('v.brandId = :brandId', { brandId: q.brandId });
    if (q.brand) qb.andWhere('LOWER(b.name) = LOWER(:brand)', { brand: q.brand });
    if (q.model) {
      qb.andWhere("v.model ILIKE :model ESCAPE '\\'", { model: `%${escapeLike(q.model)}%` });
    }
    if (q.yearMin) qb.andWhere('v.year >= :yearMin', { yearMin: q.yearMin });
    if (q.yearMax) qb.andWhere('v.year <= :yearMax', { yearMax: q.yearMax });
    if (q.priceMin) qb.andWhere('v.price >= :priceMin', { priceMin: q.priceMin });
    if (q.priceMax) qb.andWhere('v.price <= :priceMax', { priceMax: q.priceMax });
    if (q.fuel) qb.andWhere('v.fuel = :fuel', { fuel: q.fuel });
    if (q.transmission) qb.andWhere('v.transmission = :transmission', { transmission: q.transmission });
    if (q.status) qb.andWhere('v.status = :status', { status: q.status });
  }

  private toFields(dto: VehicleDto): Partial<Vehicle> {
    return {
      brandId: dto.brandId,
      model: dto.model,
      year: dto.year,
      version: dto.version,
      price: dto.price,
      mileage: dto.mileage,
      fuel: dto.fuel,
      transmission: dto.transmission,
      color: dto.color,
      status: dto.status,
      description: dto.description ?? null,
      images: dto.images ?? [],
    };
  }

  private async assertBrandExists(brandId: number): Promise<void> {
    if (!(await this.brands.existsBy({ id: brandId }))) {
      throw new BadRequestException(`No existe la marca ${brandId}`);
    }
  }
}
