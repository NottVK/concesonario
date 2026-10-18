import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import {
  FuelType,
  Transmission,
  Vehicle,
  VehicleStatus,
} from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

describe('Marcas y vehículos (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let sellerToken: string;
  let toyota: Brand;
  let kia: Brand;

  const vehicleBody = (brandId: number, overrides: Record<string, unknown> = {}) => ({
    brandId,
    model: 'Modelo X',
    year: 2024,
    version: 'Base',
    price: '90000000',
    mileage: 0,
    fuel: 'gasolina',
    transmission: 'automatica',
    color: 'Blanco',
    status: 'nuevo',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));

    const brands = ctx.dataSource.getRepository(Brand);
    toyota = await brands.save(brands.create({ name: 'Toyota', country: 'Japón', logoUrl: null }));
    kia = await brands.save(brands.create({ name: 'Kia', country: 'Corea', logoUrl: null }));

    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const make = (brandId: number, model: string, year: number, price: string, extra: Partial<Vehicle>) =>
      vehicles.create({
        brandId, model, year, price, version: 'Base', mileage: 0, color: 'Gris',
        fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC,
        status: VehicleStatus.NEW, description: null, images: [], ...extra,
      });
    await vehicles.save([
      make(toyota.id, 'Corolla', 2022, '80000000', {}),
      make(toyota.id, 'Hilux', 2024, '210000000', { fuel: FuelType.DIESEL }),
      make(toyota.id, 'Yaris', 2020, '60000000', { status: VehicleStatus.USED, transmission: Transmission.MANUAL }),
      make(kia.id, 'Sportage', 2023, '150000000', { fuel: FuelType.HYBRID }),
      make(kia.id, 'Picanto', 2021, '50000000', { status: VehicleStatus.SOLD }),
    ]);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('marcas', () => {
    it('lista y detalla sin token', async () => {
      const list = await request(ctx.server).get('/api/marcas').expect(200);
      expect(list.body.map((b: Brand) => b.name)).toEqual(['Kia', 'Toyota']);
      await request(ctx.server).get(`/api/marcas/${toyota.id}`).expect(200);
      await request(ctx.server).get('/api/marcas/9999').expect(404);
      await request(ctx.server).get('/api/marcas/abc').expect(400);
    });

    it('solo el admin escribe: 401 sin token, 403 vendedor', async () => {
      const body = { name: 'Mazda', country: 'Japón' };
      await request(ctx.server).post('/api/marcas').send(body).expect(401);
      await request(ctx.server).post('/api/marcas').set(auth(sellerToken)).send(body).expect(403);
    });

    it('admin crea, edita y borra; rechaza duplicados y datos inválidos', async () => {
      const created = await request(ctx.server)
        .post('/api/marcas').set(auth(adminToken)).send({ name: 'Mazda', country: 'Japón' }).expect(201);
      await request(ctx.server)
        .post('/api/marcas').set(auth(adminToken)).send({ name: 'mazda', country: 'Japón' }).expect(409);
      await request(ctx.server)
        .post('/api/marcas').set(auth(adminToken)).send({ name: 'X' }).expect(400);
      await request(ctx.server)
        .put(`/api/marcas/${created.body.id}`).set(auth(adminToken))
        .send({ name: 'Mazda', country: 'Japón', logoUrl: '/autos/marcas/mazda.svg' }).expect(200);
      await request(ctx.server).delete(`/api/marcas/${created.body.id}`).set(auth(adminToken)).expect(204);
      await request(ctx.server).get(`/api/marcas/${created.body.id}`).expect(404);
    });

    it('no borra una marca con vehículos (409)', async () => {
      await request(ctx.server).delete(`/api/marcas/${toyota.id}`).set(auth(adminToken)).expect(409);
    });
  });

  describe('vehículos: listado', () => {
    const list = async (query: string) =>
      (await request(ctx.server).get(`/api/vehiculos?${query}`).expect(200)).body;
    const models = (body: { data: Vehicle[] }) => body.data.map((v) => v.model).sort();

    it('pagina y excluye los vendidos', async () => {
      const body = await list('limit=2&page=1&orden=precio_asc');
      expect(body.meta).toEqual({ total: 4, page: 1, limit: 2, pages: 2 });
      expect(body.data.map((v: Vehicle) => v.model)).toEqual(['Yaris', 'Corolla']);
      const page2 = await list('limit=2&page=2&orden=precio_asc');
      expect(page2.data.map((v: Vehicle) => v.model)).toEqual(['Sportage', 'Hilux']);
    });

    it('incluye la marca y no expone embedding', async () => {
      const body = await list('marca=kia');
      expect(body.data[0].brand.name).toBe('Kia');
      expect(body.data[0]).not.toHaveProperty('embedding');
    });

    it('filtra por marca, modelo, año, precio, combustible, transmisión y estado', async () => {
      expect(models(await list('marca=TOYOTA'))).toEqual(['Corolla', 'Hilux', 'Yaris']);
      expect(models(await list('modelo=oro'))).toEqual(['Corolla']);
      expect(models(await list('anioMin=2022&anioMax=2023'))).toEqual(['Corolla', 'Sportage']);
      expect(models(await list('precioMin=60000000&precioMax=150000000'))).toEqual(['Corolla', 'Sportage', 'Yaris']);
      expect(models(await list('combustible=diesel'))).toEqual(['Hilux']);
      expect(models(await list('transmision=manual'))).toEqual(['Yaris']);
      expect(models(await list('estado=usado'))).toEqual(['Yaris']);
    });

    it('trata % y _ del modelo como texto literal', async () => {
      expect((await list('modelo=%25')).data).toHaveLength(0);
    });

    it('valida la consulta con 400', async () => {
      for (const bad of ['limit=51', 'page=0', 'combustible=agua', 'orden=azar', 'estado=vendido',
        'precioMin=abc', 'anioMin=2025&anioMax=2020', 'desconocido=1']) {
        await request(ctx.server).get(`/api/vehiculos?${bad}`).expect(400);
      }
    });

    it('resiste inyección SQL en los filtros', async () => {
      const body = await list(`marca=${encodeURIComponent("x' OR '1'='1")}`);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('vehículos: detalle y comparador', () => {
    it('devuelve detalle y 404', async () => {
      const first = (await request(ctx.server).get('/api/vehiculos?limit=1').expect(200)).body.data[0];
      await request(ctx.server).get(`/api/vehiculos/${first.id}`).expect(200);
      await request(ctx.server).get('/api/vehiculos/9999').expect(404);
    });

    it('compara de 2 a 3 vehículos en el orden pedido', async () => {
      const all = (await request(ctx.server).get('/api/vehiculos?limit=50').expect(200)).body.data as Vehicle[];
      const [a, b, c] = all;
      const res = await request(ctx.server).get(`/api/vehiculos/comparar?ids=${c.id},${a.id},${b.id}`).expect(200);
      expect(res.body.map((v: Vehicle) => v.id)).toEqual([c.id, a.id, b.id]);
    });

    it('rechaza comparaciones inválidas', async () => {
      await request(ctx.server).get('/api/vehiculos/comparar?ids=1').expect(400);
      await request(ctx.server).get('/api/vehiculos/comparar?ids=1,2,3,4').expect(400);
      await request(ctx.server).get('/api/vehiculos/comparar?ids=1,1').expect(400);
      await request(ctx.server).get('/api/vehiculos/comparar?ids=a,b').expect(400);
      await request(ctx.server).get('/api/vehiculos/comparar?ids=1,9999').expect(404);
    });
  });

  describe('vehículos: escritura', () => {
    it('exige rol admin', async () => {
      await request(ctx.server).post('/api/vehiculos').send(vehicleBody(toyota.id)).expect(401);
      await request(ctx.server).post('/api/vehiculos').set(auth(sellerToken)).send(vehicleBody(toyota.id)).expect(403);
    });

    it('crea, actualiza y borra', async () => {
      const created = await request(ctx.server)
        .post('/api/vehiculos').set(auth(adminToken)).send(vehicleBody(kia.id, { model: 'Seltos' })).expect(201);
      expect(created.body).toMatchObject({ model: 'Seltos', price: '90000000.00', brand: { name: 'Kia' } });

      const updated = await request(ctx.server)
        .put(`/api/vehiculos/${created.body.id}`).set(auth(adminToken))
        .send(vehicleBody(kia.id, { model: 'Seltos', price: '95500000.50', images: ['/autos/kia-seltos.webp'] }))
        .expect(200);
      expect(updated.body).toMatchObject({ price: '95500000.50', images: ['/autos/kia-seltos.webp'] });

      await request(ctx.server).delete(`/api/vehiculos/${created.body.id}`).set(auth(adminToken)).expect(204);
      await request(ctx.server).get(`/api/vehiculos/${created.body.id}`).expect(404);
    });

    it('valida el cuerpo: precio, estado vendido, marca inexistente y duplicados', async () => {
      const post = (body: object) =>
        request(ctx.server).post('/api/vehiculos').set(auth(adminToken)).send(body);
      await post(vehicleBody(toyota.id, { price: '0' })).expect(400);
      await post(vehicleBody(toyota.id, { price: '-5' })).expect(400);
      await post(vehicleBody(toyota.id, { price: 90000000 })).expect(400);
      await post(vehicleBody(toyota.id, { status: 'vendido' })).expect(400);
      await post(vehicleBody(toyota.id, { year: 1980 })).expect(400);
      await post(vehicleBody(toyota.id, { fuel: 'agua' })).expect(400);
      await post(vehicleBody(toyota.id, { extra: 'x' })).expect(400);
      await post(vehicleBody(9999)).expect(400);
      await post(vehicleBody(toyota.id, { model: 'Corolla', year: 2022 })).expect(409);
    });

    it('no modifica un vehículo vendido (409)', async () => {
      const sold = await ctx.dataSource.getRepository(Vehicle).findOneByOrFail({ model: 'Picanto' });
      await request(ctx.server)
        .put(`/api/vehiculos/${sold.id}`).set(auth(adminToken))
        .send(vehicleBody(kia.id, { model: 'Picanto', year: 2021 })).expect(409);
    });
  });
});
