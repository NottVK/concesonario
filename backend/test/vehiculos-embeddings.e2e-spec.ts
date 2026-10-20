import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedEmbeddings } from '../src/database/seeds/seed.service.js';
import { EMBEDDING_PROVIDER } from '../src/embeddings/embedding-provider.js';
import type { EmbeddingProvider } from '../src/embeddings/embedding-provider.js';
import { EmbeddingSync } from '../src/embeddings/embedding-sync.js';
import { buildEmbeddingText, embeddingHash } from '../src/embeddings/embedding-text.js';
import { EmbeddingsService } from '../src/embeddings/embeddings.service.js';
import type { MockEmbeddingProvider } from '../src/embeddings/mock-embedding.provider.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

interface VectorRow {
  tiene_vector: boolean;
  embedding_hash: string | null;
  embedding_modelo: string | null;
  color: string;
  revision: number;
}

/** Proveedor de pruebas hecho a mano (sin copiar una instancia de clase). */
function fake(overrides: Partial<EmbeddingProvider>): EmbeddingProvider {
  return { model: 'x', embed: async () => [], isAvailable: async () => true, ...overrides };
}

describe('Embeddings al crear y editar vehículos (e2e, embeddings simulados)', () => {
  let ctx: TestContext;
  let embeddings: MockEmbeddingProvider;
  let service: EmbeddingsService;
  let adminToken: string;
  let brandId: number;

  const vehicleBody = (extra: object = {}) => ({
    brandId, model: `Modelo ${Math.random().toString(36).slice(2, 8)}`, year: 2024, version: 'Base', price: '90000000', mileage: 0,
    fuel: 'gasolina', transmission: 'automatica', color: 'Rojo', status: 'nuevo', description: 'camioneta familiar', ...extra,
  });
  const create = async (extra: object = {}) =>
    (await request(ctx.server).post('/api/vehiculos').set(auth(adminToken)).send(vehicleBody(extra)).expect(201)).body as { id: number; revision: number; model: string };
  const row = async (id: number): Promise<VectorRow> =>
    ((await ctx.dataSource.query(
      'SELECT (embedding IS NOT NULL) AS tiene_vector, embedding_hash, embedding_modelo, color, revision FROM vehiculos WHERE id = $1', [id],
    )) as VectorRow[])[0]!;
  const put = (id: number, current: { revision: number }, extra: object) =>
    request(ctx.server).put(`/api/vehiculos/${id}`).set(auth(adminToken)).send({ ...vehicleBody(), revision: current.revision, ...extra });

  beforeAll(async () => {
    ctx = await createTestContext();
    embeddings = ctx.app.get<MockEmbeddingProvider>(EMBEDDING_PROVIDER);
    service = ctx.app.get(EmbeddingsService);
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    brandId = (await ctx.dataSource.getRepository(Brand).save({ name: 'Mazda', country: 'Japón', logoUrl: null })).id;
  });

  afterAll(async () => {
    embeddings.available = true;
    await service.whenIdle();
    await ctx.app.close();
  });

  beforeEach(() => {
    embeddings.available = true;
  });

  it('al crear, el vector se calcula en segundo plano con su hash y su modelo', async () => {
    const car = await create();
    await service.whenIdle();
    const saved = await row(car.id);
    expect(saved.tiene_vector).toBe(true);
    expect(saved.embedding_modelo).toBe('mock-embed');
    expect(saved.embedding_hash).toHaveLength(64);
  });

  it('con el servicio de embeddings apagado, crear NO falla: queda en el catálogo, sin vector, fuera de la búsqueda', async () => {
    embeddings.available = false;
    const car = await create({ description: 'camioneta única sin vector' });
    await service.whenIdle();
    expect((await row(car.id)).tiene_vector).toBe(false);
    await request(ctx.server).get(`/api/vehiculos/${car.id}`).expect(200);
    const list = await request(ctx.server).get('/api/vehiculos?limit=50').expect(200);
    expect((list.body.data as { id: number }[]).map((v) => v.id)).toContain(car.id);
    embeddings.available = true;
    const found = await request(ctx.server).get('/api/vehiculos/buscar?q=camioneta%20única%20sin%20vector').expect(200);
    expect((found.body as { id: number }[]).map((v) => v.id)).not.toContain(car.id);
  });

  it('al editar un campo del texto, el vector viejo se anula en la misma sentencia y se recalcula; editar solo el precio no lo toca', async () => {
    const car = await create();
    await service.whenIdle();
    const before = await row(car.id);

    // Solo precio y kilometraje: el vector queda como estaba.
    const priceEdit = await put(car.id, car, { model: car.model, price: '99000000', mileage: 10 }).expect(200);
    await service.whenIdle();
    const afterPrice = await row(car.id);
    expect(afterPrice.embedding_hash).toBe(before.embedding_hash);
    expect(afterPrice.tiene_vector).toBe(true);

    // Cambia el color con el servicio apagado: el vector viejo NO sobrevive (queda NULL).
    embeddings.available = false;
    const colorEdit = await put(car.id, priceEdit.body as { revision: number }, { model: car.model, color: 'Azul' }).expect(200);
    await service.whenIdle();
    const stale = await row(car.id);
    expect(stale).toMatchObject({ tiene_vector: false, embedding_hash: null, color: 'Azul' });

    // Con el servicio de vuelta, la siguiente edición (o el sync) lo recalcula con el texto nuevo.
    embeddings.available = true;
    await put(car.id, colorEdit.body as { revision: number }, { model: car.model, color: 'Azul', description: 'camioneta familiar renovada' }).expect(200);
    await service.whenIdle();
    const fresh = await row(car.id);
    expect(fresh.tiene_vector).toBe(true);
    expect(fresh.embedding_hash).not.toBe(before.embedding_hash);
  });

  it('una edición posterior no queda pisada por un vector viejo que terminó tarde', async () => {
    const original = embeddings.embed.bind(embeddings);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    embeddings.embed = async (text: string, kind: 'query' | 'document') => {
      if (first && kind === 'document') {
        first = false;
        await gate; // el cálculo del texto ORIGINAL se queda esperando
      }
      return original(text, kind);
    };
    try {
      const car = await create({ description: 'texto original', color: 'Verde' });
      // Mientras el vector original sigue "calculándose", el administrador edita el vehículo.
      const edited = await put(car.id, car, { model: car.model, description: 'texto editado', color: 'Negro' }).expect(200);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await service.whenIdle();
      const saved = await row(car.id);
      const expectedText = buildEmbeddingText({
        brandName: 'Mazda', model: car.model, version: 'Base', year: 2024, fuel: 'gasolina', transmission: 'automatica',
        status: 'nuevo', color: 'Negro', description: 'texto editado',
      });
      expect(saved.tiene_vector).toBe(true);
      expect(saved.embedding_hash).toBe(embeddingHash(expectedText, 'mock-embed'));
      expect(edited.body.revision).toBe(car.revision + 1);
    } finally {
      embeddings.embed = original;
    }
  });

  it('embeddings:sync es idempotente: calcula lo que falta y la segunda corrida no calcula nada', async () => {
    embeddings.available = false;
    const missing = await Promise.all([create(), create()]);
    await service.whenIdle();
    embeddings.available = true;
    const sync = new EmbeddingSync(ctx.dataSource, embeddings);
    const first = await sync.syncAll();
    expect(first.updated).toBeGreaterThanOrEqual(missing.length);
    const second = await sync.syncAll();
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(second.total);
    for (const car of missing) expect((await row(car.id)).tiene_vector).toBe(true);
  });

  it('cambiar de modelo de embeddings invalida los vectores existentes (el hash incluye el modelo)', async () => {
    const car = await create();
    await service.whenIdle();
    const other = Object.create(embeddings, { model: { value: 'otro-modelo' } }) as MockEmbeddingProvider;
    const stats = await new EmbeddingSync(ctx.dataSource, other).syncAll();
    expect(stats.updated).toBeGreaterThanOrEqual(1);
    expect((await row(car.id)).embedding_modelo).toBe('otro-modelo');
    await new EmbeddingSync(ctx.dataSource, embeddings).syncAll();
  });

  it('el seed no falla si Ollama está apagado: avisa en una línea y sigue', async () => {
    const down = fake({ isAvailable: async () => false });
    const line = await seedEmbeddings(ctx.dataSource, () => down);
    expect(line).toMatch(/^Aviso: Ollama no responde/);
    expect(line).toContain('npm run embeddings:sync');
    expect(line).not.toContain('\n');
    const broken = await seedEmbeddings(ctx.dataSource, () => {
      throw new Error('OLLAMA_HOST inválido');
    });
    expect(broken).toMatch(/^Aviso: no se calcularon los vectores \(OLLAMA_HOST inválido\)/);
    const dies = await seedEmbeddings(ctx.dataSource, () => fake({ embed: async () => { throw new Error('se cayó a la mitad'); } }));
    expect(dies).toMatch(/^Aviso: no se calcularon/);
  });

  it('el seed con embeddings disponibles los calcula', async () => {
    const line = await seedEmbeddings(ctx.dataSource, () => embeddings);
    expect(line).toMatch(/^Embeddings \(mock-embed\): \d+ calculados, \d+ ya vigentes\.$/);
  });
});
