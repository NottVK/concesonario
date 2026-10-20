import { Injectable, NotFoundException } from '@nestjs/common';
import { sanitizeText } from '../common/text.js';
import { looksLikeInstruction } from '../chat/text/sanitize.js';
import { MarcasService } from '../marcas/marcas.service.js';
import { Vehicle, VehicleStatus } from '../vehiculos/entities/vehicle.entity.js';
import type { VehicleFilters } from '../vehiculos/dto/vehicle-query.dto.js';
import { VehiculosService } from '../vehiculos/vehiculos.service.js';

/**
 * Un vehículo tal como lo ve un tercero: campos EXPLÍCITOS y de solo lectura. Nunca una entidad: un campo nuevo que se
 * agregue mañana a `Vehicle` (costo, notas internas…) no sale por aquí por accidente.
 */
export interface PublicVehicle {
  ref: number;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  estado: 'nuevo' | 'usado';
  combustible: string;
  transmision: string;
  color: string;
  kilometraje: number;
  /** Precio en COP como texto con 2 decimales. */
  precio_cop: string;
  disponible: true;
}

/** Un vehículo ya vendido: se reconoce, pero no se ofrece ni se da su precio. */
export interface SoldVehicle {
  ref: number;
  marca: string;
  modelo: string;
  anio: number;
  disponible: false;
}

export interface StockQuery {
  marca?: string;
  modelo?: string;
  anio?: number;
  estado?: 'nuevo' | 'usado';
  limite: number;
}

export interface StockResult {
  total: number;
  vehiculos: PublicVehicle[];
}

/** Texto de un catálogo editado por el administrador: saneado, corto y sin órdenes escondidas. */
function safe(value: string, max = 60): string {
  const clean = sanitizeText(value, max);
  return looksLikeInstruction(clean) ? '' : clean;
}

function toPublic(v: Vehicle): PublicVehicle {
  return {
    ref: v.id,
    marca: safe(v.brand?.name ?? ''),
    modelo: safe(v.model),
    version: safe(v.version),
    anio: v.year,
    estado: v.status === VehicleStatus.USED ? 'usado' : 'nuevo',
    combustible: safe(v.fuel),
    transmision: safe(v.transmission),
    color: safe(v.color, 40),
    kilometraje: v.mileage,
    precio_cop: v.price,
    disponible: true,
  };
}

/**
 * Catálogo público para los canales de terceros (el servidor MCP). Solo expone lo que ya es público en la API
 * (`GET /marcas`, `GET /vehiculos`, `GET /vehiculos/:id`): vehículos NO vendidos, sin descripción libre ni imágenes.
 * Usa los servicios del catálogo, no repositorios, y devuelve objetos planos con campos explícitos.
 */
@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly vehicles: VehiculosService,
    private readonly brands: MarcasService,
  ) {}

  /** Nombres de las marcas, en orden alfabético. */
  async listBrands(): Promise<string[]> {
    return (await this.brands.findAll()).map((brand) => safe(brand.name));
  }

  /** Vehículos disponibles que cumplen los filtros (todos opcionales y combinados con AND), del más nuevo al más viejo. */
  async searchStock(query: StockQuery): Promise<StockResult> {
    const filters = {
      page: 1,
      limit: query.limite,
      sort: 'newest',
      ...(query.marca ? { brand: query.marca } : {}),
      ...(query.modelo ? { model: query.modelo } : {}),
      ...(query.anio ? { yearMin: query.anio, yearMax: query.anio } : {}),
      ...(query.estado ? { status: query.estado === 'nuevo' ? VehicleStatus.NEW : VehicleStatus.USED } : {}),
    } as VehicleFilters;
    const page = await this.vehicles.findAll(filters);
    return { total: page.meta.total, vehiculos: page.data.map(toPublic) };
  }

  /** Un vehículo por su id público: disponible (con precio), vendido (sin precio) o null si no existe. */
  async findByRef(ref: number): Promise<PublicVehicle | SoldVehicle | null> {
    try {
      const vehicle = await this.vehicles.findOne(ref);
      if (vehicle.status === VehicleStatus.SOLD) {
        return { ref: vehicle.id, marca: safe(vehicle.brand?.name ?? ''), modelo: safe(vehicle.model), anio: vehicle.year, disponible: false };
      }
      return toPublic(vehicle);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}
