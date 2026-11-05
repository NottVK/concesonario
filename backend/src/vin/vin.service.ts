import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { VinInfoDto } from './dto/vin-info.dto.js';
import { VinRecord } from './entities/vin-record.entity.js';
import { ExternalVinDecoder } from './nhtsa-vin.client.js';
import type { ExternalVinData } from './nhtsa-vin.client.js';
import { isValidVin, normalizeVin } from './vin-decoder.js';
import { readStructure } from './vin-structure.js';
import type { VinStructure } from './vin-structure.js';

export const INVALID_VIN_MESSAGE = 'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q.';

/**
 * Consulta de VIN (decisiones 129 y 132): siempre la lectura de su estructura; los datos, del registro del concesionario
 * si está, si no de la NHTSA y, si tampoco, solo marca y año por la estructura.
 */
@Injectable()
export class VinService {
  constructor(
    @InjectRepository(VinRecord) private readonly records: Repository<VinRecord>,
    private readonly external: ExternalVinDecoder,
  ) {}

  async lookup(raw: string, now = new Date()): Promise<VinInfoDto> {
    const vin = normalizeVin(raw);
    // El mensaje no repite lo que se envió: un VIN inválido puede traer cualquier cosa.
    if (!isValidVin(vin)) throw new BadRequestException(INVALID_VIN_MESSAGE);
    const structure = readStructure(vin, now);
    const [record, external] = await Promise.all([this.records.findOneBy({ vin }), this.external.decode(vin)]);
    if (record) return { ...fromRecord(record), structure, external };
    return external ? fromExternal(vin, structure, external) : fromStructure(vin, structure);
  }
}

function fromRecord(record: VinRecord): Omit<VinInfoDto, 'structure' | 'external'> {
  const { vin, brand, model, year, version, bodyType, doors, engine, fuel, transmission } = record;
  return { vin, registered: true, source: 'registro', brand, model, year, version, bodyType, doors, engine, fuel, transmission };
}

function fromExternal(vin: string, structure: VinStructure, data: ExternalVinData): VinInfoDto {
  return {
    vin, registered: false, source: 'nhtsa',
    brand: data.make ?? structure.manufacturer, model: data.model, year: data.year ?? structure.year, version: data.trim,
    bodyType: data.bodyClass, doors: data.doors, engine: data.engine, fuel: data.fuel, transmission: data.transmission,
    structure, external: data,
  };
}

function fromStructure(vin: string, structure: VinStructure): VinInfoDto {
  return {
    vin, registered: false, source: 'estructura',
    brand: structure.manufacturer, model: null, year: structure.year, version: null,
    bodyType: null, doors: null, engine: null, fuel: null, transmission: null,
    structure, external: null,
  };
}
