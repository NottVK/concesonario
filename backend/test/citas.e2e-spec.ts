import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import {
  FuelType,
  Transmission,
  Vehicle,
  VehicleStatus,
} from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, SUNDAY, THURSDAY, TUESDAY, WEDNESDAY } from './helpers/dates.js';

describe('Clientes y citas (e2e)', () => {
  let ctx: TestContext;
  let sellerToken: string;
  let adminToken: string;
  let carA: Vehicle;
  let carB: Vehicle;
  let soldCar: Vehicle;

  const ana = { name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' };
  const luis = { name: 'Luis Gómez', email: 'luis@correo.co' };
  const book = (body: object) => request(ctx.server).post('/api/citas').send(body);
  const bookBody = (vehicleId: number, scheduledAt: string, customer: object = ana) => ({
    vehicleId, scheduledAt, customer,
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));

    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Mazda', country: 'Japón', logoUrl: null });
    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const make = (model: string, status: VehicleStatus) =>
      vehicles.save(vehicles.create({
        brandId: brand.id, model, year: 2024, version: 'Base', price: '100000000', mileage: 0,
        fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC, color: 'Rojo', status,
        description: null, images: [],
      }));
    carA = await make('Mazda 3', VehicleStatus.NEW);
    carB = await make('CX-30', VehicleStatus.NEW);
    soldCar = await make('CX-5', VehicleStatus.SOLD);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('clientes', () => {
    it('el registro es público y solo devuelve el id', async () => {
      const res = await request(ctx.server).post('/api/clientes').send(luis).expect(201);
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('rechaza correo repetido (sin importar mayúsculas) y datos inválidos', async () => {
      await request(ctx.server).post('/api/clientes').send({ ...luis, email: 'LUIS@correo.co' }).expect(409);
      await request(ctx.server).post('/api/clientes').send({ name: 'A', email: 'x' }).expect(400);
      await request(ctx.server).post('/api/clientes').send({ ...luis, phone: 'abc' }).expect(400);
      await request(ctx.server).post('/api/clientes').send({ ...luis, rol: 'admin' }).expect(400);
    });

    it('los GET exigen sesión de personal', async () => {
      await request(ctx.server).get('/api/clientes').expect(401);
      await request(ctx.server).get('/api/clientes/1').expect(401);
      await request(ctx.server).put('/api/clientes/1').send(luis).expect(401);
    });

    it('el personal lista, busca, consulta y edita', async () => {
      const list = await request(ctx.server).get('/api/clientes?q=LUIS').set(auth(sellerToken)).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.meta.total).toBe(1);
      const id = list.body.data[0].id;
      await request(ctx.server).get(`/api/clientes/${id}`).set(auth(sellerToken)).expect(200);
      const updated = await request(ctx.server)
        .put(`/api/clientes/${id}`).set(auth(adminToken)).send({ ...luis, name: 'Luis G. Gómez' }).expect(200);
      expect(updated.body.name).toBe('Luis G. Gómez');
      await request(ctx.server).get('/api/clientes/9999').set(auth(sellerToken)).expect(404);
    });
  });

  describe('citas: agendar (público)', () => {
    it('agenda sin sesión, crea al cliente y no filtra sus datos', async () => {
      const res = await book(bookBody(carA.id, bogotaSlot(TUESDAY, 10))).expect(201);
      expect(res.body).toMatchObject({ vehicleId: carA.id, status: 'pendiente' });
      expect(Date.parse(res.body.endsAt) - Date.parse(res.body.scheduledAt)).toBe(3_600_000);
      expect(JSON.stringify(res.body)).not.toMatch(/ana|correo|300/i);
      expect(await ctx.dataSource.getRepository(Customer).countBy({ email: ana.email })).toBe(1);
    });

    it('rechaza el domingo, fuera de horario, pasado y sin zona horaria', async () => {
      await book(bookBody(carB.id, bogotaSlot(SUNDAY, 10))).expect(400);
      await book(bookBody(carB.id, bogotaSlot(WEDNESDAY, 7, 30))).expect(400);
      await book(bookBody(carB.id, bogotaSlot(WEDNESDAY, 17, 30))).expect(400);
      await book(bookBody(carB.id, '2020-01-07T10:00:00-05:00')).expect(400);
      await book(bookBody(carB.id, bogotaSlot(WEDNESDAY, 10).replace('-05:00', ''))).expect(400);
      await book(bookBody(carB.id, 'mañana')).expect(400);
    });

    it('valida el cuerpo: vehículo, cliente y campos extra', async () => {
      const when = bogotaSlot(WEDNESDAY, 10);
      await book(bookBody(9999, when)).expect(404);
      await book(bookBody(carB.id, when, { name: 'X', email: 'no' })).expect(400);
      await book({ vehicleId: carB.id, scheduledAt: when }).expect(400);
      await book({ vehicleId: carB.id, scheduledAt: when, customer: 'ana' }).expect(400);
      await book({ vehicleId: carB.id, scheduledAt: when, customer: null }).expect(400);
      await book({ ...bookBody(carB.id, when), customerId: 1 }).expect(400);
    });

    it('no agenda un vehículo vendido (409)', async () => {
      await book(bookBody(soldCar.id, bogotaSlot(WEDNESDAY, 11))).expect(409);
    });

    it('un correo existente se reutiliza sin modificar sus datos', async () => {
      await book(bookBody(carB.id, bogotaSlot(WEDNESDAY, 9), { ...ana, name: 'Suplantador' })).expect(201);
      const customer = await ctx.dataSource.getRepository(Customer).findOneByOrFail({ email: ana.email });
      expect(customer.name).toBe('Ana Pérez');
    });
  });

  describe('citas: solapes (restricciones de exclusión)', () => {
    it('mismo vehículo: la misma hora y un cruce parcial de 30 min dan 409', async () => {
      const tuesday = bogotaSlot(TUESDAY, 10);
      await book(bookBody(carA.id, tuesday, luis)).expect(409);
      await book(bookBody(carA.id, bogotaSlot(TUESDAY, 10, 30), luis)).expect(409);
      await book(bookBody(carA.id, bogotaSlot(TUESDAY, 9, 30), luis)).expect(409);
    });

    it('mismo vehículo: citas contiguas (terminar a las 11:00, empezar a las 11:00) sí caben', async () => {
      await book(bookBody(carA.id, bogotaSlot(TUESDAY, 11), luis)).expect(201);
      await book(bookBody(carA.id, bogotaSlot(TUESDAY, 9), luis)).expect(201);
    });

    it('mismo cliente: no puede estar en dos autos a la vez, ni con cruce parcial', async () => {
      await book(bookBody(carB.id, bogotaSlot(TUESDAY, 10), ana)).expect(409);
      await book(bookBody(carB.id, bogotaSlot(TUESDAY, 10, 45), ana)).expect(409);
    });

    it('otro cliente y otro vehículo a la misma hora no chocan', async () => {
      await book(bookBody(carB.id, bogotaSlot(THURSDAY, 15), luis)).expect(201);
      await book(bookBody(carA.id, bogotaSlot(THURSDAY, 15), { name: 'Marta Ruiz', email: 'marta@correo.co' })).expect(201);
    });

    it('la BD rechaza el cruce aunque se salte la validación del servicio (23P01)', async () => {
      const repo = ctx.dataSource.getRepository(Appointment);
      const existing = await repo.findOneByOrFail({ vehicleId: carA.id });
      const clash = repo.create({
        vehicleId: existing.vehicleId,
        customerId: (await ctx.dataSource.getRepository(Customer).findOneByOrFail({ email: 'marta@correo.co' })).id,
        scheduledAt: new Date(existing.scheduledAt.getTime() + 30 * 60_000),
        durationMin: 60,
      });
      await expect(repo.save(clash)).rejects.toMatchObject({ driverError: { code: '23P01' } });
    });

    it('dos peticiones simultáneas por el mismo horario: una gana y la otra recibe 409', async () => {
      const when = bogotaSlot(WEDNESDAY, 14);
      const results = await Promise.all([
        book(bookBody(carA.id, when, { name: 'Pedro Ríos', email: 'pedro@correo.co' })),
        book(bookBody(carA.id, when, { name: 'Sara León', email: 'sara@correo.co' })),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    });

    it('una cita cancelada libera el horario', async () => {
      const when = bogotaSlot(WEDNESDAY, 16);
      const first = await book(bookBody(carB.id, when, luis)).expect(201);
      await book(bookBody(carB.id, when, ana)).expect(409);
      await request(ctx.server)
        .patch(`/api/citas/${first.body.id}/estado`).set(auth(sellerToken)).send({ status: 'cancelada' }).expect(200);
      await book(bookBody(carB.id, when, ana)).expect(201);
    });
  });

  describe('citas: consulta y estados (personal)', () => {
    it('los GET y el PATCH exigen sesión de personal', async () => {
      await request(ctx.server).get('/api/citas').expect(401);
      await request(ctx.server).get('/api/citas/1').expect(401);
      await request(ctx.server).patch('/api/citas/1/estado').send({ status: 'confirmada' }).expect(401);
    });

    it('lista con cliente y vehículo, filtra y pagina', async () => {
      const all = await request(ctx.server).get('/api/citas?limit=3').set(auth(sellerToken)).expect(200);
      expect(all.body.data).toHaveLength(3);
      expect(all.body.data[0]).toMatchObject({ customer: { email: expect.any(String) }, vehicle: { brand: { name: 'Mazda' } } });
      const onlyB = await request(ctx.server).get(`/api/citas?vehiculoId=${carB.id}`).set(auth(sellerToken)).expect(200);
      expect(onlyB.body.data.every((a: Appointment) => a.vehicleId === carB.id)).toBe(true);
      await request(ctx.server).get('/api/citas?estado=nada').set(auth(sellerToken)).expect(400);
      await request(ctx.server).get('/api/citas?desde=ayer').set(auth(sellerToken)).expect(400);
    });

    it('sigue la máquina de estados: pendiente → confirmada → cancelada, sin volver atrás', async () => {
      const created = await book(bookBody(carB.id, bogotaSlot(THURSDAY, 9), luis)).expect(201);
      const patch = (status: string) =>
        request(ctx.server).patch(`/api/citas/${created.body.id}/estado`).set(auth(sellerToken)).send({ status });
      await patch('confirmada').expect(200);
      await patch('confirmada').expect(409);
      await patch('pendiente').expect(400);
      const cancelled = await patch('cancelada').expect(200);
      expect(cancelled.body.status).toBe('cancelada');
      await patch('confirmada').expect(409);
      await request(ctx.server).patch('/api/citas/9999/estado').set(auth(sellerToken)).send({ status: 'cancelada' }).expect(404);
    });
  });
});
