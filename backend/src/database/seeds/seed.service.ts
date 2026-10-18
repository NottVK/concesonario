import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { Brand } from '../../marcas/entities/brand.entity.js';
import { User, UserRole } from '../../usuarios/entities/user.entity.js';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';
import { BRANDS, VEHICLES } from './seed-data.js';
import type { VehicleRow } from './seed-data.js';

export interface SeedResult {
  brands: number;
  vehicles: number;
  users: number;
}

const DEMO_USERS = [
  { name: 'Administrador AutoMax', email: 'admin@automax.co', role: UserRole.ADMIN },
  { name: 'Vendedor AutoMax', email: 'vendedor@automax.co', role: UserRole.SELLER },
];

/** Convierte "Land Cruiser Prado" en "land-cruiser-prado" para el nombre de la imagen. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function describeVehicle(brand: string, row: VehicleRow): string {
  const [model, version, year, , mileage, fuel, transmission, color, status] = row;
  const state = status === 'nuevo' ? 'nuevo, 0 km' : `usado, ${mileage.toLocaleString('es-CO')} km`;
  return `${brand} ${model} ${version} ${year} color ${color.toLowerCase()}, ${state}. Motor ${fuel}, transmisión ${transmission}.`;
}

function toVehicle(brand: Brand, row: VehicleRow): Partial<Vehicle> {
  const [model, version, year, price, mileage, fuel, transmission, color, status] = row;
  const slug = `${slugify(brand.name)}-${slugify(model)}`;
  return {
    brandId: brand.id,
    model,
    version,
    year,
    price: price.toFixed(2),
    mileage,
    fuel,
    transmission,
    color,
    status,
    description: describeVehicle(brand.name, row),
    images: [`/autos/${slug}.webp`],
  };
}

async function seedBrands(ds: DataSource): Promise<Brand[]> {
  const repo = ds.getRepository(Brand);
  await repo.upsert(
    BRANDS.map((b) => ({
      name: b.name,
      country: b.country,
      logoUrl: `/autos/marcas/${slugify(b.name)}.svg`,
    })),
    ['name'],
  );
  return repo.find();
}

async function seedVehicles(ds: DataSource, brands: Brand[]): Promise<void> {
  const rows = brands.flatMap((brand) =>
    (VEHICLES[brand.name] ?? []).map((row) => toVehicle(brand, row)),
  );
  // Al repetir el seed solo se refrescan datos de catálogo; precio, km y estado
  // no se tocan para no revivir vehículos vendidos ni pisar cambios comerciales.
  await ds
    .createQueryBuilder()
    .insert()
    .into(Vehicle)
    .values(rows)
    .orUpdate(
      ['color', 'combustible', 'transmision', 'descripcion', 'imagenes'],
      ['marca_id', 'modelo', 'anio', 'version'],
    )
    .execute();
}

async function seedUsers(ds: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Los usuarios demo no se cargan en producción (NODE_ENV=production)');
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    throw new Error('Falta SEED_DEMO_PASSWORD en el archivo .env');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // orIgnore: si el usuario ya existe no se reemplaza su contraseña.
  await ds
    .createQueryBuilder()
    .insert()
    .into(User)
    .values(DEMO_USERS.map((u) => ({ ...u, passwordHash })))
    .orIgnore()
    .execute();
}

/** Carga marcas, vehículos y usuarios demo. Es idempotente: se puede correr varias veces. */
export async function runSeed(ds: DataSource): Promise<SeedResult> {
  const brands = await seedBrands(ds);
  await seedVehicles(ds, brands);
  await seedUsers(ds);
  return {
    brands: await ds.getRepository(Brand).count(),
    vehicles: await ds.getRepository(Vehicle).count(),
    users: await ds.getRepository(User).count(),
  };
}
