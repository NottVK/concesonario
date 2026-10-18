import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../vehiculos/entities/vehicle.entity.js';
import type { BrandDto } from './dto/brand.dto.js';
import { Brand } from './entities/brand.entity.js';

@Injectable()
export class MarcasService {
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
  ) {}

  findAll(): Promise<Brand[]> {
    return this.brands.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Brand> {
    const brand = await this.brands.findOneBy({ id });
    if (!brand) throw new NotFoundException(`No existe la marca ${id}`);
    return brand;
  }

  async create(dto: BrandDto): Promise<Brand> {
    await this.assertNameFree(dto.name);
    return this.brands.save(this.brands.create(this.toFields(dto)));
  }

  async update(id: number, dto: BrandDto): Promise<Brand> {
    const brand = await this.findOne(id);
    if (brand.name.toLowerCase() !== dto.name.toLowerCase()) await this.assertNameFree(dto.name);
    Object.assign(brand, this.toFields(dto));
    return this.brands.save(brand);
  }

  private toFields(dto: BrandDto): Pick<Brand, 'name' | 'country' | 'logoUrl'> {
    return { name: dto.name, country: dto.country, logoUrl: dto.logoUrl ?? null };
  }

  async remove(id: number): Promise<void> {
    const brand = await this.findOne(id);
    const inUse = await this.vehicles.countBy({ brandId: id });
    if (inUse > 0) {
      throw new ConflictException(`No se puede borrar ${brand.name}: tiene ${inUse} vehículo(s)`);
    }
    await this.brands.remove(brand);
  }

  private async assertNameFree(name: string): Promise<void> {
    const exists = await this.brands
      .createQueryBuilder('b')
      .where('LOWER(b.name) = LOWER(:name)', { name })
      .getExists();
    if (exists) throw new ConflictException(`Ya existe la marca ${name}`);
  }
}
