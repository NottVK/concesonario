import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEmbeddingText } from '../src/embeddings/embedding-text.js';
import { EMBEDDING_PROVIDER, toVectorLiteral } from '../src/embeddings/embedding-provider.js';
import type { EmbeddingProvider } from '../src/embeddings/embedding-provider.js';
import type { MockEmbeddingProvider } from '../src/embeddings/mock-embedding.provider.js';
import { SEARCH_UNAVAILABLE_MESSAGE } from '../src/vehiculos/vehiculos.service.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

describe('GET /vehiculos/buscar (e2e, embeddings simulados)', () => {
  let ctx: TestContext;
  let embeddings: MockEmbeddingProvider;
  const ids: Record<string, number> = {};

  const search = (q: unknown, extra = '') => request(ctx.server).get(`/api/vehiculos/buscar?q=${encodeURIComponent(String(q))}${extra}`);
  const embed = async (vehicleId: number, provider: EmbeddingProvider): Promise<void> => {
    const vehicle = await ctx.dataSource.getRepository(Vehicle).findOneOrFail({ where: { id: vehicleId }, relations: { brand: true } });
    const text = buildEmbeddingText({
      brandName: vehicle.brand.name, model: vehicle.model, version: vehicle.version, year: vehicle.year, fuel: vehicle.fuel,
      transmission: vehicle.transmission, status: vehicle.status, color: vehicle.color, description: vehicle.description,
    });
    await ctx.dataSource.query('UPDATE vehiculos SET embedding = $1::vector WHERE id = $2', [toVectorLiteral(await provider.embed(text, 'document')), vehicleId]);
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    embeddings = ctx.app.get<MockEmbeddingProvider>(EMBEDDING_PROVIDER);
    await resetDatabase(ctx.dataSource);
    const brands = ctx.dataSource.getRepository(Brand);
    const toyota = await brands.save({ name: 'Toyota', country: 'Japón', logoUrl: null });
    const kia = await brands.save({ name: 'Kia', country: 'Corea', logoUrl: null });
    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const make = (key: string, brandId: number, model: string, description: string, extra: Partial<Vehicle> = {}) =>
      vehicles.save(vehicles.create({
        brandId, model, year: 2024, version: 'Base', price: '90000000.00', mileage: 0, fuel: FuelType.GASOLINE,
        transmission: Transmission.AUTOMATIC, color: 'Gris', status: VehicleStatus.NEW, description, images: [], ...extra,
      })).then((v) => { ids[key] = v.id; return v; });
    await make('suv', toyota.id, 'Fortuner', 'camioneta familiar de siete puestos para familia');
    await make('city', kia.id, 'Picanto', 'carro económico compacto para la ciudad', { price: '55000000.00' });
    await make('electric', kia.id, 'EV6', 'vehículo eléctrico sin gasolina', { fuel: FuelType.ELECTRIC });
    await make('sold', toyota.id, 'Hilux', 'camioneta familiar de trabajo', { status: VehicleStatus.SOLD });
    await make('noVector', toyota.id, 'Prado', 'camioneta familiar sin vector todavía');
    for (const key of ['suv', 'city', 'electric', 'sold']) await embed(ids[key]!, embeddings);
  });

  afterAll(async () => {
    embeddings.available = true;
    await ctx.app.close();
  });

  it('ordena por similitud y devuelve la ficha completa sin exponer el vector', async () => {
    const res = await search('camioneta para familia').expect(200);
    const list = res.body as { id: number }[];
    expect(list[0]!.id).toBe(ids.suv);
    expect(JSON.stringify(res.body)).not.toMatch(/embedding/i);
    expect(res.body[0]).toMatchObject({ model: 'Fortuner', price: '90000000.00', status: 'nuevo' });
    expect(res.body[0].brand.name).toBe('Toyota');
  });

  it('nunca devuelve vendidos ni vehículos sin vector', async () => {
    const res = await search('camioneta familiar').expect(200);
    const found = (res.body as { id: number }[]).map((v) => v.id);
    expect(found).toContain(ids.suv);
    expect(found).not.toContain(ids.sold);
    expect(found).not.toContain(ids.noVector);
  });

  it('el precio sale de la fila actual, no del vector', async () => {
    await ctx.dataSource.query('UPDATE vehiculos SET precio = 99000000 WHERE id = $1', [ids.city]);
    const res = await search('carro económico ciudad').expect(200);
    expect(res.body[0]).toMatchObject({ id: ids.city, price: '99000000.00' });
    await ctx.dataSource.query('UPDATE vehiculos SET precio = 55000000 WHERE id = $1', [ids.city]);
  });

  it('un vehículo que se vende después de calcular su vector deja de aparecer', async () => {
    await ctx.dataSource.query("UPDATE vehiculos SET estado = 'vendido' WHERE id = $1", [ids.electric]);
    const res = await search('vehículo eléctrico').expect(200);
    expect((res.body as { id: number }[]).map((v) => v.id)).not.toContain(ids.electric);
    await ctx.dataSource.query("UPDATE vehiculos SET estado = 'nuevo' WHERE id = $1", [ids.electric]);
  });

  it('sin parecido suficiente devuelve lista vacía', async () => {
    const res = await search('helicóptero submarino').expect(200);
    expect(res.body).toEqual([]);
  });

  it('limit: 5 por defecto, de 1 a 10', async () => {
    expect((await search('camioneta', '&limit=1').expect(200)).body).toHaveLength(1);
    expect((await search('camioneta').expect(200)).body.length).toBeLessThanOrEqual(5);
    expect((await search('camioneta', '&limit=10').expect(200)).body.length).toBeLessThanOrEqual(10);
  });

  it('valida q y limit con 400', async () => {
    const bad = [
      '/api/vehiculos/buscar', '/api/vehiculos/buscar?q=', '/api/vehiculos/buscar?q=ab', '/api/vehiculos/buscar?q=%20%20%20%20',
      `/api/vehiculos/buscar?q=${'a'.repeat(201)}`, '/api/vehiculos/buscar?q=a&q=b', '/api/vehiculos/buscar?q[]=abc', '/api/vehiculos/buscar?q[a]=abc',
      '/api/vehiculos/buscar?q=%E2%80%8B%E2%80%8B%E2%80%8B%E2%80%8B', '/api/vehiculos/buscar?q=%00%01%02%03',
      '/api/vehiculos/buscar?q=camioneta&limit=0', '/api/vehiculos/buscar?q=camioneta&limit=11', '/api/vehiculos/buscar?q=camioneta&limit=-1',
      '/api/vehiculos/buscar?q=camioneta&limit=abc', '/api/vehiculos/buscar?q=camioneta&limit=1.5', '/api/vehiculos/buscar?q=camioneta&otro=1',
    ];
    for (const url of bad) expect((await request(ctx.server).get(url)).status, url).toBe(400);
  });

  it('limpia el texto: controles, espacios y Unicode raro (NFC)', async () => {
    const messy = 'camioneta\u0001   fami\u200Bliar\n\n para familia';
    const clean = await search(messy).expect(200);
    expect((clean.body as { id: number }[])[0]!.id).toBe(ids.suv);
    // El carácter nulo ya lo rechaza el filtro global de entradas.
    await search('camioneta\u0000familiar').expect(400);
    const exactly200 = 'camioneta '.repeat(20).trim();
    await search(exactly200).expect(200);
    await search(`${'camioneta '.repeat(25)}`).expect(400);
  });

  it('con SQL o comodines en q no rompe ni filtra (se parametriza y solo se embebe)', async () => {
    for (const q of ["'; DROP TABLE vehiculos; --", '%_%_%', '" OR 1=1 --', '{{7*7}}', '<script>alert(1)</script>']) {
      expect((await search(q)).status, q).toBe(200);
    }
    expect(await ctx.dataSource.getRepository(Vehicle).count()).toBe(5);
  });

  it('con el servicio de embeddings caído: 503 con el mensaje en español; el catálogo sigue', async () => {
    embeddings.available = false;
    const res = await search('camioneta familiar').expect(503);
    expect(res.body.message).toBe(SEARCH_UNAVAILABLE_MESSAGE);
    await request(ctx.server).get('/api/vehiculos').expect(200);
    embeddings.available = true;
  });

  it('"buscar" no se interpreta como un id y es pública', async () => {
    await request(ctx.server).get('/api/vehiculos/buscar?q=camioneta').expect(200);
    await request(ctx.server).get('/api/vehiculos/abc').expect(400);
  });
});
