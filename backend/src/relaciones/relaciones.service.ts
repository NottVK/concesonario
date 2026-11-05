import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VinRecord } from '../vin/entities/vin-record.entity.js';
import { CONTACT_CRYPTO, ContactCrypto } from './contact-crypto.js';
import { Relationship } from './entities/relationship.entity.js';
import { bogotaToday, warrantyOf } from './warranty.js';
import type { Warranty } from './warranty.js';

/** Lo que el bot necesita después de identificar al cliente. Sin cédula, nombre ni teléfono. */
export interface RelationSummary {
  idRelacion: string;
  vin: string;
  plate: string;
  /** "Renault Duster 2023". */
  vehicle: string;
  /** Kilometraje registrado: el taller lo usa para el prediagnóstico y la garantía. */
  mileage: number;
  warranty: Warranty;
}

/** Respuesta de `consultar_relacion` del contrato del taller (camelCase, como pide el Excel). */
export interface RelationRecord {
  idRelacion: string;
  cedula: string;
  cliente: string;
  telefono: string;
  vin: string;
  placa: string;
  kilometraje: number;
  cabeceraVin: {
    vin: string; marca: string; modelo: string; anio: number; version: string; carroceria: string;
    puertas: number; motor: string; combustible: string; transmision: string;
  } | null;
  garantia: Warranty;
}

export const RELATION_ID_PATTERN = /^REL-\d{4,6}$/;

/** Relaciones cliente–vehículo (decisión 130). Los datos personales solo se descifran para el taller. */
@Injectable()
export class RelacionesService {
  constructor(
    @InjectRepository(Relationship) private readonly relations: Repository<Relationship>,
    @InjectRepository(VinRecord) private readonly vins: Repository<VinRecord>,
    @Inject(CONTACT_CRYPTO) private readonly crypto: ContactCrypto,
  ) {}

  /** Cédula + VIN → relación, o null si no coinciden (la misma respuesta si falla la cédula o el VIN). */
  async identify(cedula: string, vin: string, today = bogotaToday()): Promise<RelationSummary | null> {
    const relation = await this.relations.findOneBy({ cedulaHmac: this.crypto.cedulaHmac(cedula), vin: vin.toUpperCase() });
    if (!relation) return null;
    const vehicle = await this.vins.findOneBy({ vin: relation.vin });
    return {
      idRelacion: relation.id,
      vin: relation.vin,
      plate: relation.plate,
      mileage: relation.mileage,
      vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}` : `VIN ${relation.vin}`,
      warranty: warrantyOf(relation.saleDate, relation.mileage, relation.plan, today),
    };
  }

  /** `consultar_relacion`: todos los datos, o null si el id no existe o no tiene el formato. */
  async consult(idRelacion: string, today = bogotaToday()): Promise<RelationRecord | null> {
    if (!RELATION_ID_PATTERN.test(idRelacion)) return null;
    const relation = await this.relations.findOneBy({ id: idRelacion });
    if (!relation) return null;
    const contact = this.crypto.open(relation.id, relation.encryptedContact);
    const vehicle = await this.vins.findOneBy({ vin: relation.vin });
    return {
      idRelacion: relation.id,
      cedula: contact.cedula,
      cliente: contact.nombre,
      telefono: contact.telefono,
      vin: relation.vin,
      placa: relation.plate,
      kilometraje: relation.mileage,
      cabeceraVin: vehicle ? vinHeader(vehicle) : null,
      garantia: warrantyOf(relation.saleDate, relation.mileage, relation.plan, today),
    };
  }
}

function vinHeader(v: VinRecord): NonNullable<RelationRecord['cabeceraVin']> {
  return {
    vin: v.vin, marca: v.brand, modelo: v.model, anio: v.year, version: v.version, carroceria: v.bodyType,
    puertas: v.doors, motor: v.engine, combustible: v.fuel, transmision: v.transmission,
  };
}
