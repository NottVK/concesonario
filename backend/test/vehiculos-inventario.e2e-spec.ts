import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, TUESDAY } from './helpers/dates.js';

/** Edición del inventario por el admin: ediciones simultáneas, imágenes y borrado con historial. */
describe('Inventario admin: concurrencia, imágenes y borrado (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let sellerToken: string;
  let brand: Brand;
  let customer: Customer;
  let counter = 0;

  const newVehicle = async (): Promise<Vehicle> => {
    const repo = ctx.dataSource.getRepository(Vehicle);
    return repo.save(
      repo.create({
        brandId: brand.id, model: `Modelo ${++counter}`, year: 2024, version: 'Base', price: '100000000', mileage: 0,
        fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC, color: 'Gris', status: VehicleStatus.NEW,
        description: null, images: [],
      }),
    );
  };
  const body = (car: Vehicle, overrides: Record<string, unknown> = {}) => ({
    brandId: car.brandId, model: car.model, year: car.year, version: car.version, price: car.price, mileage: car.mileage,
    fuel: car.fuel, transmission: car.transmission, color: car.color, status: car.status, revision: car.revision,
    ...overrides,
  });
  const put = (id: number, payload: object) =>
    request(ctx.server).put(`/api/vehiculos/${id}`).set(auth(adminToken)).send(payload);
  const post = (payload: object) => request(ctx.server).post('/api/vehiculos').set(auth(adminToken)).send(payload);
  const reload = (id: number) => ctx.dataSource.getRepository(Vehicle).findOneByOrFail({ id });

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Mazda', country: 'Japón', logoUrl: null });
    const customers = ctx.dataSource.getRepository(Customer);
    customer = await customers.save(customers.create({ name: 'Cliente A', email: 'a@correo.co', phone: null }));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('control de ediciones simultáneas', () => {
    it('PUT exige la revisión y la sube en 1 con cada edición', async () => {
      const car = await newVehicle();
      await put(car.id, { ...body(car), revision: undefined }).expect(400);
      const first = await put(car.id, body(car, { color: 'Rojo' })).expect(200);
      expect(first.body).toMatchObject({ color: 'Rojo', revision: 2 });
      const second = await put(car.id, body(car, { color: 'Azul', revision: 2 })).expect(200);
      expect(second.body).toMatchObject({ color: 'Azul', revision: 3 });
    });

    it('una revisión vieja da 409 claro y no pisa los cambios de la otra persona', async () => {
      const car = await newVehicle();
      await put(car.id, body(car, { price: '111000000' })).expect(200);
      const stale = await put(car.id, body(car, { price: '222000000' })).expect(409);
      expect(stale.body.message).toMatch(/Otra persona modificó este vehículo/);
      expect((await reload(car.id)).price).toBe('111000000.00');
    });

    it('dos ediciones a la vez con la misma revisión: una gana y la otra recibe 409', async () => {
      const car = await newVehicle();
      const results = await Promise.all([
        put(car.id, body(car, { color: 'Verde' })),
        put(car.id, body(car, { color: 'Negro' })),
      ]);
      expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect((await reload(car.id)).revision).toBe(2);
    });

    it('si se vendió mientras se editaba: 409 "vendido", sin cambios y con la revisión ya subida por la venta', async () => {
      const car = await newVehicle();
      const opened = body(car); // el admin abre el formulario con la revisión 1
      await request(ctx.server)
        .post('/api/ventas').set(auth(sellerToken))
        .send({ vehicleId: car.id, customerId: customer.id, finalPrice: '95000000', payment: 'contado' })
        .expect(201);
      const afterSale = await reload(car.id);
      expect(afterSale.status).toBe(VehicleStatus.SOLD);
      expect(afterSale.revision).toBe(2);

      const res = await put(car.id, { ...opened, price: '1' }).expect(409);
      expect(res.body.message).toMatch(/vendido no se puede modificar/);
      expect((await reload(car.id)).price).toBe('100000000.00');
    });

    it('la revisión no puede ser basura ni un número fuera de rango', async () => {
      const car = await newVehicle();
      for (const revision of [0, -1, 1.5, 2_147_483_648, 'abc', null, [], {}]) {
        await put(car.id, body(car, { revision })).expect(400);
      }
    });
  });

  describe('imágenes: solo /autos/... o https://', () => {
    const valid = ['/autos/mazda-3.webp', 'https://cdn.ejemplo.com/fotos/mazda-3.jpg'];
    const invalid = [
      'javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://ejemplo.com/a.jpg', '//evil.com/a.jpg',
      '/autos/../secreto.webp', 'file:///etc/passwd', 'https://usuario:clave@ejemplo.com/a.jpg', '/otra/ruta.webp', ' ',
      `https://ejemplo.com/${'a'.repeat(300)}`,
    ];

    it('acepta rutas propias y URL https en POST y PUT', async () => {
      const car = await newVehicle();
      const created = await post(body(car, { model: 'Con fotos', revision: undefined, images: valid })).expect(201);
      expect(created.body.images).toEqual(valid);
      await put(car.id, body(car, { images: valid })).expect(200);
    });

    it.each(invalid)('rechaza %s con 400 en POST y en PUT', async (image) => {
      const car = await newVehicle();
      const created = await post(body(car, { model: `Mala ${counter}`, revision: undefined, images: [image] }));
      expect(created.status).toBe(400);
      expect(JSON.stringify(created.body.message)).toMatch(/imagen/);
      await put(car.id, body(car, { images: ['/autos/ok.webp', image] })).expect(400);
      expect((await reload(car.id)).images).toEqual([]);
    });
  });

  describe('borrado', () => {
    it('un vehículo sin historial se borra', async () => {
      const car = await newVehicle();
      await request(ctx.server).delete(`/api/vehiculos/${car.id}`).set(auth(adminToken)).expect(204);
    });

    it('con una venta: 409 con un mensaje que lo explica', async () => {
      const car = await newVehicle();
      await request(ctx.server)
        .post('/api/ventas').set(auth(sellerToken))
        .send({ vehicleId: car.id, customerId: customer.id, finalPrice: '95000000', payment: 'contado' }).expect(201);
      const res = await request(ctx.server).delete(`/api/vehiculos/${car.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/una venta registrada/);
      expect(res.body.message).toMatch(/no se borran/);
    });

    it('con citas (incluso canceladas): 409 que dice cuántas', async () => {
      const car = await newVehicle();
      const appointments = ctx.dataSource.getRepository(Appointment);
      await appointments.save(
        appointments.create({ vehicleId: car.id, customerId: customer.id, scheduledAt: new Date(bogotaSlot(TUESDAY, 10)), durationMin: 60 }),
      );
      const res = await request(ctx.server).delete(`/api/vehiculos/${car.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/1 cita\(s\)/);
    });

    it('un vendedor no puede borrar ni editar (403)', async () => {
      const car = await newVehicle();
      await request(ctx.server).delete(`/api/vehiculos/${car.id}`).set(auth(sellerToken)).expect(403);
      await request(ctx.server).put(`/api/vehiculos/${car.id}`).set(auth(sellerToken)).send(body(car)).expect(403);
    });
  });
});
