import { DataSource } from 'typeorm';
import { Vehicle } from '../vehiculos/entities/vehicle.entity.js';
import { FichaVin } from './entities/ficha-vin.entity.js';

/** Carrocería y puertas por modelo (clave: nombre sin espacios ni guiones, en minúsculas). Lo no listado es SUV de 5 puertas. */
const PICKUPS = new Set(['amarok', 'frontier', 'hilux', 'ranger']);
const SEDANS = new Set(['accent', 'logan', 'mazda3', 'serie3', 'versa', 'virtus']);
const HATCHBACKS = new Set(['fiesta', 'grandi10', 'kwid', 'mazda2', 'march', 'onix', 'picanto', 'polo', 'sparkgt', 'yaris', 'serie1', 'rio', 'sandero']);

export function bodyOf(model: string): { bodyType: string; doors: number } {
  const key = model.toLowerCase().replace(/[\s-]+/g, '');
  if (PICKUPS.has(key)) return { bodyType: 'camioneta pick-up', doors: 4 };
  if (SEDANS.has(key)) return { bodyType: 'sedán', doors: 4 };
  if (HATCHBACKS.has(key)) return { bodyType: 'hatchback', doors: 5 };
  if (key === 'mx5') return { bodyType: 'convertible', doors: 2 };
  return { bodyType: 'SUV', doors: 5 };
}

/** VIN ficticio y reconocible (AMXVEH + id), con formato válido. Solo para datos de demostración. */
export function demoVin(vehicleId: number): string {
  return `AMXVEH${String(vehicleId).padStart(11, '0')}`;
}

/** Idempotente: no pisa una ficha ya existente. */
export async function seedFichasVin(ds: DataSource): Promise<number> {
  const vehicles = await ds.getRepository(Vehicle).find();
  const rows = vehicles.map((v) => ({ vin: demoVin(v.id), vehicleId: v.id, ...bodyOf(v.model) }));
  if (rows.length === 0) return 0;
  await ds.createQueryBuilder().insert().into(FichaVin).values(rows).orIgnore().execute();
  return rows.length;
}
