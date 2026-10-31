import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleStatus } from '../vehiculos/entities/vehicle.entity.js';
import { FichaVin } from './entities/ficha-vin.entity.js';
import { isValidVin, normalizeVin, VIN_INVALID_MESSAGE, VIN_NOT_FOUND_MESSAGE } from './vin.js';

/** Ficha pública: SOLO estos campos. Nada de precio, kilometraje, estado, dueño, compra ni garantía. */
export interface FichaVinView {
  brand: string;
  model: string;
  year: number;
  version: string;
  bodyType: string;
  doors: number;
  fuel: string;
  transmission: string;
}

@Injectable()
export class FichasVinService {
  constructor(@InjectRepository(FichaVin) private readonly fichas: Repository<FichaVin>) {}

  /** Un VIN inexistente, sin ficha o de un vehículo vendido responde exactamente igual (404 con el mismo mensaje). */
  async find(rawVin: string): Promise<FichaVinView> {
    const vin = normalizeVin(rawVin);
    if (!isValidVin(vin)) throw new BadRequestException(VIN_INVALID_MESSAGE);
    const view = await this.lookup(vin, false);
    if (!view) throw new NotFoundException(VIN_NOT_FOUND_MESSAGE);
    return view;
  }

  /** Ficha de un vehículo YA VENDIDO a un propietario (para Taller y Tienda). Solo se llama con un VIN que ya es de un propietario. */
  findOwned(vin: string): Promise<FichaVinView | null> {
    return this.lookup(vin, true);
  }

  private async lookup(vin: string, includeSold: boolean): Promise<FichaVinView | null> {
    const query = this.fichas.createQueryBuilder('f').innerJoinAndSelect('f.vehicle', 'v').innerJoinAndSelect('v.brand', 'b').where('f.vin = :vin', { vin });
    if (!includeSold) query.andWhere('v.status != :sold', { sold: VehicleStatus.SOLD });
    const ficha = await query.getOne();
    if (!ficha) return null;
    const { vehicle } = ficha;
    return {
      brand: vehicle.brand.name,
      model: vehicle.model,
      year: vehicle.year,
      version: vehicle.version,
      bodyType: ficha.bodyType,
      doors: ficha.doors,
      fuel: vehicle.fuel,
      transmission: vehicle.transmission,
    };
  }
}
