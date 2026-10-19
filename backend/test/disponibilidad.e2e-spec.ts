import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment, AppointmentStatus } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, THURSDAY, TUESDAY, WEDNESDAY } from './helpers/dates.js';

const FRIDAY = 5;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

describe('Disponibilidad de test-drive (e2e)', () => {
  let ctx: TestContext;
  let carA: Vehicle;
  let carB: Vehicle;
  let soldCar: Vehicle;

  const tue10 = bogotaSlot(TUESDAY, 10);
  const tue11 = bogotaSlot(TUESDAY, 11);
  const wed9 = bogotaSlot(WEDNESDAY, 9);
  const thu14 = bogotaSlot(THURSDAY, 14);
  const plus = (iso: string, ms: number): string => new Date(new Date(iso).getTime() + ms).toISOString();

  const availability = (id: number | string, query = '') =>
    request(ctx.server).get(`/api/vehiculos/${id}/disponibilidad${query}`);
  const busyOf = async (id: number, query = ''): Promise<string[]> =>
    ((await availability(id, query).expect(200)).body.busy as { startsAt: string }[]).map((slot) => slot.startsAt);
  const iso = (value: string): string => new Date(value).toISOString();

  let customerCounter = 0;
  const book = async (vehicleId: number, scheduledAt: string, status = AppointmentStatus.PENDING) => {
    const customers = ctx.dataSource.getRepository(Customer);
    const customer = await customers.save(
      customers.create({ name: `Cliente Secreto ${++customerCounter}`, email: `secreto${customerCounter}@privado.co`, phone: '300 999 0000' }),
    );
    const repo = ctx.dataSource.getRepository(Appointment);
    return repo.save(repo.create({ vehicleId, customerId: customer.id, scheduledAt: new Date(scheduledAt), durationMin: 60, status }));
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
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

    await book(carA.id, tue10);
    await book(carA.id, wed9, AppointmentStatus.CONFIRMED);
    await book(carA.id, thu14, AppointmentStatus.CANCELLED);
    await book(carB.id, tue11);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('qué devuelve', () => {
    it('es público y lista solo las franjas ocupadas del vehículo, en orden', async () => {
      const res = await availability(carA.id).expect(200);
      expect(res.body.vehicleId).toBe(carA.id);
      expect(res.body.durationMin).toBe(60);
      expect(res.body.busy.map((slot: { startsAt: string }) => slot.startsAt)).toEqual([iso(tue10), iso(wed9)].sort());
      expect(res.body.busy[0].endsAt).toBe(plus(res.body.busy[0].startsAt, HOUR_MS));
    });

    it('no incluye citas canceladas ni las de otros vehículos', async () => {
      const busy = await busyOf(carA.id);
      expect(busy).not.toContain(iso(thu14));
      expect(busy).not.toContain(iso(tue11));
      expect(await busyOf(carB.id)).toEqual([iso(tue11)]);
    });

    it('no filtra ningún dato del cliente ni el estado de la cita', async () => {
      const res = await availability(carA.id).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['busy', 'durationMin', 'from', 'to', 'vehicleId']);
      for (const slot of res.body.busy) expect(Object.keys(slot).sort()).toEqual(['endsAt', 'startsAt']);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/Secreto|privado\.co|300 999|pendiente|confirmada|customer|email/i);
    });

    it('un vehículo sin citas devuelve la lista vacía', async () => {
      const brand = await ctx.dataSource.getRepository(Brand).findOneByOrFail({ name: 'Mazda' });
      const vehicles = ctx.dataSource.getRepository(Vehicle);
      const free = await vehicles.save(vehicles.create({
        brandId: brand.id, model: 'Sin citas', year: 2024, version: 'Base', price: '90000000', mileage: 0,
        fuel: FuelType.GASOLINE, transmission: Transmission.MANUAL, color: 'Azul', status: VehicleStatus.NEW,
        description: null, images: [],
      }));
      expect((await availability(free.id).expect(200)).body.busy).toEqual([]);
    });
  });

  describe('rango', () => {
    it('por defecto va desde ahora hasta 35 días después', async () => {
      const before = Date.now();
      const { body } = await availability(carA.id).expect(200);
      const from = new Date(body.from).getTime();
      expect(from).toBeGreaterThanOrEqual(before - 1000);
      expect(from).toBeLessThanOrEqual(Date.now() + 1000);
      expect(new Date(body.to).getTime() - from).toBe(35 * DAY_MS);
    });

    it('solo from: el fin son 35 días después de from; solo to: parte de ahora', async () => {
      const from = '2030-03-04T00:00:00-05:00';
      const { body } = await availability(carA.id, `?from=${from}`).expect(200);
      expect(new Date(body.to).getTime() - new Date(body.from).getTime()).toBe(35 * DAY_MS);
      const onlyTo = await availability(carA.id, `?to=${plus(new Date().toISOString(), 10 * DAY_MS)}`).expect(200);
      expect(new Date(onlyTo.body.from).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('filtra por rango y respeta los bordes: una franja que termina en from o empieza en to no cuenta', async () => {
      expect(await busyOf(carA.id, `?from=${wed9}&to=${plus(wed9, 3 * HOUR_MS)}`)).toEqual([iso(wed9)]);
      // La cita de martes 10:00 termina justo a las 11:00: no ocupa desde las 11:00.
      expect(await busyOf(carA.id, `?from=${tue11}&to=${wed9}`)).toEqual([]);
      // Un rango que corta la mitad de la franja sí la incluye.
      expect(await busyOf(carA.id, `?from=${plus(tue10, 30 * 60_000)}&to=${tue11}`)).toEqual([iso(tue10)]);
    });

    it('acepta rangos con desfase distinto de -05:00 y Z', async () => {
      const fromUtc = new Date(new Date(tue10).getTime() - HOUR_MS).toISOString();
      const toUtc = new Date(new Date(tue10).getTime() + 2 * HOUR_MS).toISOString();
      expect(await busyOf(carA.id, `?from=${fromUtc}&to=${toUtc}`)).toEqual([iso(tue10)]);
    });
  });

  describe('coherencia con POST /citas', () => {
    const post = (vehicleId: number, scheduledAt: string, email: string) =>
      request(ctx.server).post('/api/citas').send({ vehicleId, scheduledAt, customer: { name: 'Ana Pérez', email } });

    it('lo que aparece ocupado es lo que POST rechaza, y lo libre se puede reservar y pasa a ocupado', async () => {
      await post(carA.id, tue10, 'ana1@correo.co').expect(409);

      const fri15 = bogotaSlot(FRIDAY, 15);
      expect(await busyOf(carA.id)).not.toContain(iso(fri15));
      await post(carA.id, fri15, 'ana2@correo.co').expect(201);
      expect(await busyOf(carA.id)).toContain(iso(fri15));
      await post(carA.id, fri15, 'ana3@correo.co').expect(409);
    });

    it('al cancelar una cita la franja queda libre otra vez', async () => {
      const seller = await createUser(ctx.dataSource, UserRole.SELLER, 'vendedor.disp@prueba.co');
      const token = await ctx.tokenFor(seller);
      const sat = bogotaSlot(6, 9);
      const created = await post(carB.id, sat, 'ana4@correo.co').expect(201);
      expect(await busyOf(carB.id)).toContain(iso(sat));
      await request(ctx.server)
        .patch(`/api/citas/${created.body.id}/estado`)
        .set(auth(token))
        .send({ status: 'cancelada' })
        .expect(200);
      expect(await busyOf(carB.id)).not.toContain(iso(sat));
    });
  });

  describe('errores', () => {
    it('404 si el vehículo no existe', async () => {
      await availability(999999).expect(404);
    });

    it('409 si el vehículo ya fue vendido (igual que POST /citas)', async () => {
      const res = await availability(soldCar.id).expect(409);
      expect(res.body.message).toMatch(/vendido/);
    });

    it('400 con id que no es número', async () => {
      await availability('abc').expect(400);
    });

    it.each([
      ['from sin zona horaria', '?from=2026-11-02T00:00:00'],
      ['to sin zona horaria', '?to=2026-12-02T00:00:00'],
      ['fecha imposible', '?from=2026-13-45T10:00:00-05:00'],
      ['to igual a from', '?from=2026-11-02T00:00:00-05:00&to=2026-11-02T00:00:00-05:00'],
      ['to anterior a from', '?from=2026-11-02T00:00:00-05:00&to=2026-11-01T00:00:00-05:00'],
      ['rango de más de 62 días', '?from=2026-11-02T00:00:00-05:00&to=2027-01-05T00:00:00-05:00'],
      ['parámetro desconocido', '?foo=1'],
      ['intento de inyección SQL', `?from=${encodeURIComponent("2026-11-02T00:00:00-05:00' OR '1'='1")}`],
    ])('400: %s', async (_label, query) => {
      await availability(carA.id, query).expect(400);
    });

    it('acepta justo 62 días', async () => {
      await availability(carA.id, '?from=2026-11-02T00:00:00-05:00&to=2027-01-03T00:00:00-05:00').expect(200);
    });
  });
});
