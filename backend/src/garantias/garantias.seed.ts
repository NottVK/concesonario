import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { FichaVin } from '../fichas-vin/entities/ficha-vin.entity.js';
import { User, UserRole } from '../usuarios/entities/user.entity.js';
import { hashDocument } from './document-hash.js';
import { PropietarioVin } from './entities/propietario-vin.entity.js';

/** Documentos FICTICIOS de demostración. Los servicios simulados responden por el id (1 a 3) de estos propietarios. */
export const DEMO_OWNERS = [
  { document: '1000000001', monthsAgo: 6 }, // 1: todo en regla
  { document: '1000000002', monthsAgo: 10 }, // 2: el taller simulado informa 130.000 km → vencida por km
  { document: '1000000003', monthsAgo: 8 }, // 3: la tienda simulada informa un cambio hecho por un tercero
];

function monthsAgo(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

/** Idempotente: 3 propietarios sobre los 3 primeros VIN de demostración y el usuario mecánico. Solo para desarrollo. */
export async function seedGarantias(ds: DataSource): Promise<number> {
  const fichas = await ds.getRepository(FichaVin).find({ order: { id: 'ASC' }, take: DEMO_OWNERS.length });
  const rows = fichas.map((ficha, index) => ({
    documentHash: hashDocument(DEMO_OWNERS[index]!.document),
    vin: ficha.vin,
    purchaseDate: monthsAgo(DEMO_OWNERS[index]!.monthsAgo),
  }));
  if (rows.length > 0) await ds.createQueryBuilder().insert().into(PropietarioVin).values(rows).orIgnore().execute();
  await seedMechanic(ds);
  return rows.length;
}

async function seedMechanic(ds: DataSource): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || process.env.NODE_ENV === 'production') return;
  const passwordHash = await bcrypt.hash(password, 10);
  await ds
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({ name: 'Mecánico Demo', email: 'mecanico@automax.co', passwordHash, role: UserRole.MECHANIC })
    .orIgnore()
    .execute();
}
