import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import { paginate } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { escapeLike } from '../common/sql.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import type { VehicleDto } from './dto/vehicle.dto.js';
import type { VehicleQueryDto, VehicleSort } from './dto/vehicle-query.dto.js';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity.js';

const SORTS: Record<VehicleSort, [string, 'ASC' | 'DESC']> = {
  recientes: ['v.id', 'DESC'],
  precio_asc: ['v.price', 'ASC'],
  precio_desc: ['v.price', 'DESC'],
  anio_desc: ['v.year', 'DESC'],
  anio_asc: ['v.year', 'ASC'],
};

@Injectable()
export class VehiculosService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
  ) {}

  async findAll(query: VehicleQueryDto): Promise<Paginated<Vehicle>> {
    if (query.anioMin && query.anioMax && query.anioMin > query.anioMax) {
      throw new BadRequestException('anioMin no puede ser mayor que anioMax');
    }
    const qb = this.vehicles
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.brand', 'b')
      .where('v.status <> :sold', { sold: VehicleStatus.SOLD });
    this.applyFilters(qb, query);

    const [column, direction] = SORTS[query.orden];
    qb.orderBy(column, direction).addOrderBy('v.id', 'ASC');
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

  async update(id: number, dto: VehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    if (vehicle.status === VehicleStatus.SOLD) {
      throw new ConflictException('Un vehículo vendido no se puede modificar');
    }
    await this.assertBrandExists(dto.brandId);
    await this.vehicles.update(id, this.toFields(dto));
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const vehicle = await this.findOne(id);
    await this.vehicles.remove(vehicle);
  }

  private applyFilters(qb: SelectQueryBuilder<Vehicle>, q: VehicleQueryDto): void {
    if (q.marca) qb.andWhere('LOWER(b.name) = LOWER(:marca)', { marca: q.marca });
    if (q.modelo) {
      qb.andWhere("v.model ILIKE :modelo ESCAPE '\\'", { modelo: `%${escapeLike(q.modelo)}%` });
    }
    if (q.anioMin) qb.andWhere('v.year >= :anioMin', { anioMin: q.anioMin });
    if (q.anioMax) qb.andWhere('v.year <= :anioMax', { anioMax: q.anioMax });
    if (q.precioMin) qb.andWhere('v.price >= :precioMin', { precioMin: q.precioMin });
    if (q.precioMax) qb.andWhere('v.price <= :precioMax', { precioMax: q.precioMax });
    if (q.combustible) qb.andWhere('v.fuel = :combustible', { combustible: q.combustible });
    if (q.transmision) qb.andWhere('v.transmission = :transmision', { transmision: q.transmision });
    if (q.estado) qb.andWhere('v.status = :estado', { estado: q.estado });
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
