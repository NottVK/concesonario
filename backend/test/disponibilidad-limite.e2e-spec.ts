// Debe fijarse ANTES de cargar la app: `publicThrottle()` lee el límite al declarar el controlador.
process.env.THROTTLE_PUBLIC_LIMIT = '3';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

describe('Disponibilidad: límite de peticiones (e2e)', () => {
  let ctx: TestContext;
  let vehicleId: number;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Kia', country: 'Corea', logoUrl: null });
    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const car = await vehicles.save(vehicles.create({
      brandId: brand.id, model: 'Rio', year: 2024, version: 'Base', price: '70000000', mileage: 0,
      fuel: FuelType.GASOLINE, transmission: Transmission.MANUAL, color: 'Gris', status: VehicleStatus.NEW,
      description: null, images: [],
    }));
    vehicleId = car.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('es una ruta limitada: pasado el tope por minuto responde 429', async () => {
    const hit = () => request(ctx.server).get(`/api/vehiculos/${vehicleId}/disponibilidad`);
    await hit().expect(200);
    await hit().expect(200);
    await hit().expect(200);
    const blocked = await hit().expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('el límite es por ruta: el catálogo sigue respondiendo', async () => {
    await request(ctx.server).get('/api/vehiculos').expect(200);
    await request(ctx.server).get('/api/marcas').expect(200);
  });
});
