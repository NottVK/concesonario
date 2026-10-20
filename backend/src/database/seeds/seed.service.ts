import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { FUEL_LABEL, label, TRANSMISSION_LABEL } from '../../common/labels.js';
import { createEmbeddingProvider } from '../../embeddings/embedding-factory.js';
import type { EmbeddingProvider } from '../../embeddings/embedding-provider.js';
import { EmbeddingSync } from '../../embeddings/embedding-sync.js';
import { Brand } from '../../marcas/entities/brand.entity.js';
import { User, UserRole } from '../../usuarios/entities/user.entity.js';
import { Vehicle } from '../../vehiculos/entities/vehicle.entity.js';
import { BRANDS, VEHICLES } from './seed-data.js';
import { MODEL_PROFILES } from './seed-profiles.js';
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
  const profile = MODEL_PROFILES[model] ?? '';
  return `${brand} ${model} ${version} ${year} color ${color.toLowerCase()}, ${state}. Motor ${label(FUEL_LABEL, fuel)}, transmisión ${label(TRANSMISSION_LABEL, transmission)}. ${profile}`.trim();
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

/**
 * Orden de inserción de los vehículos: una ronda por marca (el 1.º de cada marca, luego el 2.º…),
 * en el orden de BRANDS. Así los ids, y por tanto "los más recientes" del catálogo, quedan repartidos
 * entre marcas en lugar de agrupados (la Home muestra los más recientes como destacados).
 */
export function interleavedVehicleSeeds(): { brandName: string; row: VehicleRow }[] {
  const groups = BRANDS.map(({ name }) => (VEHICLES[name] ?? []).map((row) => ({ brandName: name, row })));
  const longest = Math.max(0, ...groups.map((group) => group.length));
  const ordered: { brandName: string; row: VehicleRow }[] = [];
  for (let round = 0; round < longest; round++) {
    for (const group of groups) if (round < group.length) ordered.push(group[round]);
  }
  return ordered;
}

async function seedVehicles(ds: DataSource, brands: Brand[]): Promise<void> {
  const byName = new Map(brands.map((brand) => [brand.name, brand]));
  const rows = interleavedVehicleSeeds().map(({ brandName, row }) => {
    const brand = byName.get(brandName);
    if (!brand) throw new Error(`Falta la marca ${brandName} en la base`);
    return toVehicle(brand, row);
  });
  // Al repetir el seed solo se refrescan datos de catálogo; precio, km y estado
  // no se tocan para no revivir vehículos vendidos ni pisar cambios comerciales.
  // Tampoco se renumeran los ids: el orden intercalado solo aplica a una base recién creada.
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

/**
 * Los vectores son opcionales para el seed: si Ollama está apagado (o falta el modelo) devuelve un aviso de una
 * línea y NO falla; los vectores se llenan después con `npm run embeddings:sync`.
 */
export async function seedEmbeddings(ds: DataSource, makeProvider: () => EmbeddingProvider = createEmbeddingProvider): Promise<string> {
  const later = 'los vectores de búsqueda se llenan después con `npm run embeddings:sync`';
  try {
    const provider = makeProvider();
    if (!(await provider.isAvailable())) return `Aviso: Ollama no responde; ${later}.`;
    const stats = await new EmbeddingSync(ds, provider).syncAll();
    return `Embeddings (${provider.model}): ${stats.updated} calculados, ${stats.skipped} ya vigentes.`;
  } catch (error: unknown) {
    return `Aviso: no se calcularon los vectores (${error instanceof Error ? error.message : 'error desconocido'}); ${later}.`;
  }
}
