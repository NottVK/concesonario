import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFichasVin, demoVin } from '../src/fichas-vin/fichas-vin.seed.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

const PUBLIC_KEYS = ['bodyType', 'brand', 'doors', 'fuel', 'model', 'transmission', 'version', 'year'];

describe('GET /api/fichas-vin/:vin', () => {
  let ctx: TestContext;
  let vin: string;
  let soldVin: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Mazda', country: 'Japón', logoUrl: null });
    const repo = ctx.dataSource.getRepository(Vehicle);
    const make = (model: string, status: VehicleStatus) =>
      repo.save(repo.create({ brandId: brand.id, model, year: 2024, version: 'Touring', price: '100000000.00', mileage: 0, color: 'Rojo', fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC, status, description: null, images: [] }));
    const live = await make('Mazda 3', VehicleStatus.NEW);
    const sold = await make('CX-30', VehicleStatus.SOLD);
    await seedFichasVin(ctx.dataSource);
    vin = demoVin(live.id);
    soldVin = demoVin(sold.id);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('devuelve solo los ocho campos públicos', async () => {
    const res = await request(ctx.server).get(`/api/fichas-vin/${vin}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
  });

  it('acepta minúsculas', async () => {
    await request(ctx.server).get(`/api/fichas-vin/${vin.toLowerCase()}`).expect(200);
  });

  it('inexistente y vendido dan la misma respuesta 404', async () => {
    const missing = await request(ctx.server).get('/api/fichas-vin/1HGCM82633A004352').expect(404);
    const sold = await request(ctx.server).get(`/api/fichas-vin/${soldVin}`).expect(404);
    expect(sold.body).toEqual(missing.body);
  });

  it('un VIN mal formado es 400', async () => {
    await request(ctx.server).get('/api/fichas-vin/ABC').expect(400);
    await request(ctx.server).get('/api/fichas-vin/1HGCM82633A00435Q').expect(400);
  });
});
