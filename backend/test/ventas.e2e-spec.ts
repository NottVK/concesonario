import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment, AppointmentStatus } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { User, UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { Sale } from '../src/ventas/entities/sale.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, THURSDAY, TUESDAY } from './helpers/dates.js';

describe('Ventas (e2e)', () => {
  let ctx: TestContext;
  let seller: User;
  let sellerToken: string;
  let adminToken: string;
  let admin: User;
  let customerToken: string;
  let customerA: Customer;
  let customerB: Customer;
  let brand: Brand;
  let modelCounter = 0;

  const newVehicle = async (): Promise<Vehicle> => {
    const repo = ctx.dataSource.getRepository(Vehicle);
    return repo.save(repo.create({
      brandId: brand.id, model: `Modelo ${++modelCounter}`, year: 2024, version: 'Base', price: '120000000',
      mileage: 0, fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC, color: 'Negro',
      status: VehicleStatus.NEW, description: null, images: [],
    }));
  };
  const sell = (token: string, body: object) =>
    request(ctx.server).post('/api/ventas').set(auth(token)).send(body);
  const saleBody = (vehicleId: number, customerId: number, extra: object = {}) => ({
    vehicleId, customerId, finalPrice: '115000000.50', payment: 'credito', ...extra,
  });
  const statusOf = async (id: number): Promise<VehicleStatus> =>
    (await ctx.dataSource.getRepository(Vehicle).findOneByOrFail({ id })).status;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    seller = await createUser(ctx.dataSource, UserRole.SELLER);
    sellerToken = await ctx.tokenFor(seller);
    admin = await createUser(ctx.dataSource, UserRole.ADMIN);
    adminToken = await ctx.tokenFor(admin);
    customerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.CUSTOMER));
    brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Renault', country: 'Francia', logoUrl: null });
    const customers = ctx.dataSource.getRepository(Customer);
    customerA = await customers.save(customers.create({ name: 'Cliente A', email: 'a@correo.co', phone: null }));
    customerB = await customers.save(customers.create({ name: 'Cliente B', email: 'b@correo.co', phone: null }));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('exige sesión: sin token 401 en las tres rutas', async () => {
    await request(ctx.server).post('/api/ventas').send(saleBody(1, 1)).expect(401);
    await request(ctx.server).get('/api/ventas').expect(401);
    await request(ctx.server).get('/api/ventas/1').expect(401);
  });

  it('el vendedor registra ventas pero NO puede listarlas ni consultarlas (403); el admin sí', async () => {
    const vehicle = await newVehicle();
    const created = await sell(sellerToken, saleBody(vehicle.id, customerA.id)).expect(201);
    await request(ctx.server).get('/api/ventas').set(auth(sellerToken)).expect(403);
    await request(ctx.server).get(`/api/ventas/${created.body.id}`).set(auth(sellerToken)).expect(403);
    await request(ctx.server).get('/api/ventas').set(auth(adminToken)).expect(200);
    await request(ctx.server).get(`/api/ventas/${created.body.id}`).set(auth(adminToken)).expect(200);
  });

  it('un usuario con rol cliente no puede registrar, listar ni consultar ventas (403)', async () => {
    const vehicle = await newVehicle();
    await sell(customerToken, saleBody(vehicle.id, customerA.id)).expect(403);
    await request(ctx.server).get('/api/ventas').set(auth(customerToken)).expect(403);
    await request(ctx.server).get('/api/ventas/1').set(auth(customerToken)).expect(403);
    expect(await statusOf(vehicle.id)).toBe(VehicleStatus.NEW);
  });

  it('guarda quién registró la venta: el vendedor del token, o el admin si fue él; nunca el del cuerpo', async () => {
    const bySeller = await sell(sellerToken, saleBody((await newVehicle()).id, customerA.id)).expect(201);
    const byAdmin = await sell(adminToken, saleBody((await newVehicle()).id, customerB.id)).expect(201);
    expect(bySeller.body).toMatchObject({ sellerId: seller.id, seller: { id: seller.id, role: 'vendedor' } });
    expect(byAdmin.body).toMatchObject({ sellerId: admin.id, seller: { id: admin.id, role: 'admin' } });
    // Intentar poner a otro como vendedor en el cuerpo se rechaza (campo no permitido), y no cambia nada.
    const spoofed = await sell(sellerToken, { ...saleBody((await newVehicle()).id, customerA.id), sellerId: admin.id });
    expect(spoofed.status).toBe(400);
    const stored = await ctx.dataSource.getRepository(Sale).findOneByOrFail({ id: bySeller.body.id });
    expect(stored.sellerId).toBe(seller.id);
  });

  it('registra la venta, marca el vehículo como vendido y toma el vendedor del token', async () => {
    const vehicle = await newVehicle();
    const res = await sell(sellerToken, saleBody(vehicle.id, customerA.id)).expect(201);
    expect(res.body).toMatchObject({
      vehicleId: vehicle.id,
      customerId: customerA.id,
      sellerId: seller.id,
      finalPrice: '115000000.50',
      payment: 'credito',
      vehicle: { brand: { name: 'Renault' } },
      customer: { email: 'a@correo.co' },
      seller: { id: seller.id },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(await statusOf(vehicle.id)).toBe(VehicleStatus.SOLD);
  });

  it('el vehículo vendido desaparece del catálogo público', async () => {
    const vehicle = await newVehicle();
    await sell(sellerToken, saleBody(vehicle.id, customerA.id)).expect(201);
    const list = await request(ctx.server).get('/api/vehiculos?limit=50').expect(200);
    expect(list.body.data.map((v: Vehicle) => v.id)).not.toContain(vehicle.id);
  });

  it('no permite vender dos veces el mismo vehículo (409)', async () => {
    const vehicle = await newVehicle();
    await sell(sellerToken, saleBody(vehicle.id, customerA.id)).expect(201);
    await sell(sellerToken, saleBody(vehicle.id, customerB.id)).expect(409);
    expect(await ctx.dataSource.getRepository(Sale).countBy({ vehicleId: vehicle.id })).toBe(1);
  });

  it('dos ventas simultáneas del mismo vehículo: una gana y la otra recibe 409', async () => {
    const vehicle = await newVehicle();
    const results = await Promise.all([
      sell(sellerToken, saleBody(vehicle.id, customerA.id)),
      sell(sellerToken, saleBody(vehicle.id, customerB.id)),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await ctx.dataSource.getRepository(Sale).countBy({ vehicleId: vehicle.id })).toBe(1);
  });

  it('FOR UPDATE: la venta espera a la transacción que tiene el vehículo y luego respeta su estado', async () => {
    // Aquí el índice único NO puede decidir: la otra transacción marca el vehículo como vendido
    // sin crear ninguna venta. Sin el bloqueo, la venta leería "nuevo" y respondería 201.
    const vehicle = await newVehicle();
    const holder = ctx.dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.manager.findOne(Vehicle, { where: { id: vehicle.id }, lock: { mode: 'pessimistic_write' } });

    let settled = false;
    const pending = sell(sellerToken, saleBody(vehicle.id, customerA.id)).then((res) => {
      settled = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(settled).toBe(false);

    await holder.manager.update(Vehicle, vehicle.id, { status: VehicleStatus.SOLD });
    await holder.commitTransaction();
    await holder.release();

    expect((await pending).status).toBe(409);
    expect(await ctx.dataSource.getRepository(Sale).countBy({ vehicleId: vehicle.id })).toBe(0);
  });

  it('ráfaga de 6 ventas simultáneas del mismo vehículo: exactamente una se registra', async () => {
    const vehicle = await newVehicle();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => sell(sellerToken, saleBody(vehicle.id, i % 2 ? customerA.id : customerB.id))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
  });

  it('si el cliente no existe responde 404 y NO deja el vehículo vendido (rollback)', async () => {
    const vehicle = await newVehicle();
    await sell(sellerToken, saleBody(vehicle.id, 9999)).expect(404);
    expect(await statusOf(vehicle.id)).toBe(VehicleStatus.NEW);
    expect(await ctx.dataSource.getRepository(Sale).countBy({ vehicleId: vehicle.id })).toBe(0);
  });

  it('vehículo inexistente: 404', async () => {
    await sell(sellerToken, saleBody(9999, customerA.id)).expect(404);
  });

  it('cancela las citas abiertas del vehículo vendido y respeta las de otros', async () => {
    const sold = await newVehicle();
    const other = await newVehicle();
    const appointments = ctx.dataSource.getRepository(Appointment);
    const make = (vehicleId: number, scheduledAt: string, status: AppointmentStatus) =>
      appointments.save(appointments.create({
        vehicleId, customerId: customerA.id, scheduledAt: new Date(scheduledAt), durationMin: 60, status,
      }));
    const pending = await make(sold.id, bogotaSlot(TUESDAY, 9), AppointmentStatus.PENDING);
    const confirmed = await make(sold.id, bogotaSlot(THURSDAY, 9), AppointmentStatus.CONFIRMED);
    const untouched = await make(other.id, bogotaSlot(THURSDAY, 11), AppointmentStatus.PENDING);

    await sell(sellerToken, saleBody(sold.id, customerB.id)).expect(201);

    const statuses = async (ids: number[]) =>
      (await appointments.findBy(ids.map((id) => ({ id })))).map((a) => a.status);
    expect(await statuses([pending.id, confirmed.id])).toEqual([AppointmentStatus.CANCELLED, AppointmentStatus.CANCELLED]);
    expect(await statuses([untouched.id])).toEqual([AppointmentStatus.PENDING]);
  });

  it('valida el cuerpo con 400: precio, pago, vendedor en el cuerpo y campos extra', async () => {
    const vehicle = await newVehicle();
    for (const bad of [
      { finalPrice: '0' },
      { finalPrice: '-10' },
      { finalPrice: 115000000 },
      { finalPrice: '10.999' },
      { payment: 'trueque' },
      { sellerId: 1 },
      { vehicleId: 'x' },
    ]) {
      await sell(sellerToken, { ...saleBody(vehicle.id, customerA.id), ...bad }).expect(400);
    }
    expect(await statusOf(vehicle.id)).toBe(VehicleStatus.NEW);
  });

  it('lista con paginación y consulta por id (admin)', async () => {
    const list = await request(ctx.server).get('/api/ventas?limit=2').set(auth(adminToken)).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(5);
    expect(list.body.meta.limit).toBe(2);
    const id = list.body.data[0].id;
    await request(ctx.server).get(`/api/ventas/${id}`).set(auth(adminToken)).expect(200);
    await request(ctx.server).get('/api/ventas/9999').set(auth(adminToken)).expect(404);
  });

  describe('precio final validado en el servidor', () => {
    it('acepta justo el tope y 1 centavo, y guarda el monto exacto', async () => {
      const top = await sell(sellerToken, saleBody((await newVehicle()).id, customerA.id, { finalPrice: '5000000000.00' })).expect(201);
      const cent = await sell(sellerToken, saleBody((await newVehicle()).id, customerB.id, { finalPrice: '0.01' })).expect(201);
      expect(top.body.finalPrice).toBe('5000000000.00');
      expect(cent.body.finalPrice).toBe('0.01');
    });

    it.each([
      ['5000000000.01', /no puede superar/],
      ['9999999999.99', /no puede superar/],
      ['0', /mayor que cero/],
      ['0.00', /mayor que cero/],
      ['-5', /monto en COP/],
      ['1.234', /monto en COP/],
    ])('rechaza %s con 400 y un mensaje claro, sin vender el vehículo', async (finalPrice, message) => {
      const vehicle = await newVehicle();
      const res = await sell(sellerToken, saleBody(vehicle.id, customerA.id, { finalPrice })).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
      expect(await statusOf(vehicle.id)).toBe(VehicleStatus.NEW);
      expect(await ctx.dataSource.getRepository(Sale).countBy({ vehicleId: vehicle.id })).toBe(0);
    });
  });

  describe('borrar vehículos con historial (mensaje claro para el panel)', () => {
    it('con una venta: 409 que lo explica y el vehículo sigue ahí', async () => {
      const vehicle = await newVehicle();
      await sell(sellerToken, saleBody(vehicle.id, customerA.id)).expect(201);
      const res = await request(ctx.server).delete(`/api/vehiculos/${vehicle.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/una venta registrada/);
      expect(res.body.message).toMatch(/historial/);
      expect(await ctx.dataSource.getRepository(Vehicle).existsBy({ id: vehicle.id })).toBe(true);
    });

    it('con citas (aunque estén canceladas): 409 con la cantidad', async () => {
      const vehicle = await newVehicle();
      const appointments = ctx.dataSource.getRepository(Appointment);
      await appointments.save([
        appointments.create({ vehicleId: vehicle.id, customerId: customerA.id, scheduledAt: new Date(bogotaSlot(TUESDAY, 9)), durationMin: 60, status: AppointmentStatus.CANCELLED }),
        appointments.create({ vehicleId: vehicle.id, customerId: customerB.id, scheduledAt: new Date(bogotaSlot(TUESDAY, 11)), durationMin: 60 }),
      ]);
      const res = await request(ctx.server).delete(`/api/vehiculos/${vehicle.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/2 cita\(s\) \(incluidas las canceladas\)/);
      expect(res.body.message).not.toMatch(/venta/);
    });

    it('con venta y citas: el mensaje menciona ambas y nunca datos de clientes', async () => {
      const vehicle = await newVehicle();
      const appointments = ctx.dataSource.getRepository(Appointment);
      await appointments.save(appointments.create({ vehicleId: vehicle.id, customerId: customerA.id, scheduledAt: new Date(bogotaSlot(THURSDAY, 10)), durationMin: 60 }));
      await sell(sellerToken, saleBody(vehicle.id, customerB.id)).expect(201);
      const res = await request(ctx.server).delete(`/api/vehiculos/${vehicle.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/una venta registrada y 1 cita\(s\)/);
      expect(res.body.message).not.toMatch(/Cliente A|Cliente B|@correo/);
    });

    it('un vehículo sin historial se borra (204)', async () => {
      const vehicle = await newVehicle();
      await request(ctx.server).delete(`/api/vehiculos/${vehicle.id}`).set(auth(adminToken)).expect(204);
      expect(await ctx.dataSource.getRepository(Vehicle).existsBy({ id: vehicle.id })).toBe(false);
    });

    it('una marca con vehículos: 409 que dice cuántos y qué hacer', async () => {
      await newVehicle();
      const res = await request(ctx.server).delete(`/api/marcas/${brand.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toMatch(/tiene \d+ vehículo\(s\) en el inventario/);
      expect(res.body.message).toMatch(/pásalos a otra marca/);
    });
  });
});
