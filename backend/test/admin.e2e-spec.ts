import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment, AppointmentStatus } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { User, UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { PaymentMethod, Sale } from '../src/ventas/entities/sale.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, THURSDAY, TUESDAY, WEDNESDAY } from './helpers/dates.js';

/** Mes calendario de Bogotá calculado aparte de la implementación (desplazando 5 h el reloj). */
function bogotaYearMonth(offsetMonths = 0): { year: number; month: number } {
  const local = new Date(Date.now() - 5 * 3_600_000);
  const index = local.getUTCFullYear() * 12 + local.getUTCMonth() + offsetMonths;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
const key = ({ year, month }: { year: number; month: number }): string => `${year}-${String(month).padStart(2, '0')}`;
/** Instante 00:00 del día 1 de ese mes en Bogotá (= 05:00 UTC). */
const startOfMonth = ({ year, month }: { year: number; month: number }): Date => new Date(Date.UTC(year, month - 1, 1, 5));

describe('Panel admin: métricas y listado de inventario (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let sellerToken: string;
  let customerToken: string;
  let seller: User;
  let customerRow: Customer;

  const get = (path: string, token?: string) => {
    const req = request(ctx.server).get(path);
    return token ? req.set(auth(token)) : req;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    const admin = await createUser(ctx.dataSource, UserRole.ADMIN);
    seller = await createUser(ctx.dataSource, UserRole.SELLER);
    const customerUser = await createUser(ctx.dataSource, UserRole.CUSTOMER);
    [adminToken, sellerToken, customerToken] = await Promise.all(
      [admin, seller, customerUser].map((user) => ctx.tokenFor(user)),
    );

    const brands = ctx.dataSource.getRepository(Brand);
    const toyota = await brands.save({ name: 'Toyota', country: 'Japón', logoUrl: null });
    const kia = await brands.save({ name: 'Kia', country: 'Corea', logoUrl: null });
    await brands.save({ name: 'Mazda', country: 'Japón', logoUrl: null }); // sin inventario

    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const make = (brandId: number, model: string, price: string, status: VehicleStatus) =>
      vehicles.save(vehicles.create({
        brandId, model, year: 2024, version: 'Base', price, mileage: 0, fuel: FuelType.GASOLINE,
        transmission: Transmission.AUTOMATIC, color: 'Gris', status, description: null, images: [],
      }));
    const a = await make(toyota.id, 'Corolla', '100000000', VehicleStatus.NEW);
    const b = await make(toyota.id, 'Yaris', '50000000', VehicleStatus.USED);
    const d = await make(kia.id, 'Sportage', '70000000', VehicleStatus.NEW);
    const sold = await Promise.all(
      ['Hilux', 'Rio', 'Picanto', 'Seltos', 'Cerato'].map((model, i) =>
        make(i === 0 ? toyota.id : kia.id, model, '80000000', VehicleStatus.SOLD),
      ),
    );

    // Ventas: dos en el mes actual (una justo en el primer instante del mes), dos en el anterior
    // (una un milisegundo antes de que termine) y una hace 3 meses.
    const customers = ctx.dataSource.getRepository(Customer);
    customerRow = await customers.save(customers.create({ name: 'Comprador', email: 'comprador@correo.co', phone: null }));
    const current = bogotaYearMonth(0);
    const previous = bogotaYearMonth(-1);
    const when = [
      ['90000000', new Date()],
      ['10000000', startOfMonth(current)],
      ['5000000', new Date(startOfMonth(current).getTime() - 1)],
      ['20000000', new Date(startOfMonth(previous).getTime() + 15 * 86_400_000)],
      ['7000000', new Date(startOfMonth(bogotaYearMonth(-3)).getTime() + 5 * 86_400_000)],
    ] as const;
    const sales = ctx.dataSource.getRepository(Sale);
    for (const [index, [price, soldAt]] of when.entries()) {
      const sale = await sales.save(sales.create({
        vehicleId: sold[index].id, customerId: customerRow.id, sellerId: seller.id, finalPrice: price,
        payment: PaymentMethod.CASH,
      }));
      // `fecha` se asigna sola al insertar; se fija a mano para probar los bordes de mes.
      await ctx.dataSource.query('UPDATE ventas SET fecha = $1 WHERE id = $2', [soldAt, sale.id]);
    }

    // Citas: 2 pendientes, 1 confirmada y 1 cancelada (cada una con su cliente y vehículo, sin solapes).
    const appointments = ctx.dataSource.getRepository(Appointment);
    const book = async (vehicle: Vehicle, status: AppointmentStatus, slot: string, n: number) => {
      const c = await customers.save(customers.create({ name: `Cliente ${n}`, email: `c${n}@correo.co`, phone: null }));
      await appointments.save(appointments.create({
        vehicleId: vehicle.id, customerId: c.id, scheduledAt: new Date(slot), durationMin: 60, status,
      }));
    };
    await book(a, AppointmentStatus.PENDING, bogotaSlot(TUESDAY, 10), 1);
    await book(b, AppointmentStatus.PENDING, bogotaSlot(WEDNESDAY, 10), 2);
    await book(d, AppointmentStatus.CONFIRMED, bogotaSlot(THURSDAY, 10), 3);
    await book(a, AppointmentStatus.CANCELLED, bogotaSlot(THURSDAY, 15), 4);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('acceso solo para admin', () => {
    const routes = [
      '/api/admin/metricas/resumen',
      '/api/admin/metricas/ventas-por-mes',
      '/api/admin/metricas/stock-por-marca',
      '/api/admin/vehiculos',
    ];

    it.each(routes)('%s: 401 sin token', async (path) => {
      await get(path).expect(401);
    });

    it.each(routes)('%s: 403 para vendedor y para cliente, 200 para admin', async (path) => {
      await get(path, sellerToken).expect(403);
      await get(path, customerToken).expect(403);
      await get(path, adminToken).expect(200);
    });

    it('un token con datos manipulados no da acceso', async () => {
      await get(routes[0], `${adminToken}x`).expect(401);
    });
  });

  describe('resumen', () => {
    it('cuenta inventario, citas pendientes y ventas del mes', async () => {
      const { body } = await get('/api/admin/metricas/resumen', adminToken).expect(200);
      expect(body).toEqual({
        month: key(bogotaYearMonth(0)),
        vehiclesInStock: 3,
        stockValue: '220000000.00',
        pendingAppointments: 2,
        salesThisMonth: 2,
        revenueThisMonth: '100000000.00',
      });
    });

    it('el dinero viaja como texto, nunca como número', async () => {
      const { body } = await get('/api/admin/metricas/resumen', adminToken).expect(200);
      expect(typeof body.stockValue).toBe('string');
      expect(typeof body.revenueThisMonth).toBe('string');
    });
  });

  describe('ventas por mes', () => {
    it('una fila por mes, del más antiguo al más reciente, con ceros y bordes de mes en hora de Bogotá', async () => {
      const { body } = await get('/api/admin/metricas/ventas-por-mes?months=4', adminToken).expect(200);
      expect(body).toEqual([
        { month: key(bogotaYearMonth(-3)), count: 1, total: '7000000.00' },
        { month: key(bogotaYearMonth(-2)), count: 0, total: '0.00' },
        // La venta de 5 M ocurrió 1 ms antes del mes actual: cuenta en el anterior.
        { month: key(bogotaYearMonth(-1)), count: 2, total: '25000000.00' },
        // La de 10 M ocurrió justo en el primer instante del mes actual: cuenta en este.
        { month: key(bogotaYearMonth(0)), count: 2, total: '100000000.00' },
      ]);
    });

    it('por defecto devuelve 12 meses y acepta hasta 24', async () => {
      expect((await get('/api/admin/metricas/ventas-por-mes', adminToken).expect(200)).body).toHaveLength(12);
      const all = (await get('/api/admin/metricas/ventas-por-mes?months=24', adminToken).expect(200)).body;
      expect(all).toHaveLength(24);
      expect(all[23].month).toBe(key(bogotaYearMonth(0)));
    });

    it.each(['0', '25', '-1', 'abc', '1.5', ''])('400 con months=%s', async (months) => {
      await get(`/api/admin/metricas/ventas-por-mes?months=${months}`, adminToken).expect(400);
    });

    it('400 con parámetros desconocidos', async () => {
      await get('/api/admin/metricas/ventas-por-mes?foo=1', adminToken).expect(400);
    });
  });

  describe('stock por marca', () => {
    it('cuenta solo lo disponible, incluye marcas en 0 y ordena por cantidad y luego por nombre', async () => {
      const { body } = await get('/api/admin/metricas/stock-por-marca', adminToken).expect(200);
      expect(body.map((row: { brand: string }) => row.brand)).toEqual(['Toyota', 'Kia', 'Mazda']);
      expect(body).toMatchObject([
        { brand: 'Toyota', count: 2, value: '150000000.00' },
        { brand: 'Kia', count: 1, value: '70000000.00' },
        { brand: 'Mazda', count: 0, value: '0.00' },
      ]);
      expect(typeof body[0].brandId).toBe('number');
    });
  });

  describe('listado admin de vehículos', () => {
    const list = async (query = '') =>
      (await get(`/api/admin/vehiculos${query}`, adminToken).expect(200)).body as {
        data: Vehicle[];
        meta: { total: number; page: number; limit: number; pages: number };
      };
    const models = (body: { data: Vehicle[] }): string[] => body.data.map((v) => v.model).sort();

    it('incluye los vendidos, que el catálogo público no muestra', async () => {
      const admin = await list();
      expect(admin.meta.total).toBe(8);
      expect(admin.data.some((v) => v.status === VehicleStatus.SOLD)).toBe(true);
      const pub = (await request(ctx.server).get('/api/vehiculos').expect(200)).body;
      expect(pub.meta.total).toBe(3);
      expect(pub.data.every((v: Vehicle) => v.status !== VehicleStatus.SOLD)).toBe(true);
    });

    it('filtra por status, incluido vendido', async () => {
      expect(models(await list('?status=vendido'))).toEqual(['Cerato', 'Hilux', 'Picanto', 'Rio', 'Seltos']);
      expect(models(await list('?status=nuevo'))).toEqual(['Corolla', 'Sportage']);
      expect(models(await list('?status=usado'))).toEqual(['Yaris']);
    });

    it('conserva los demás filtros, el orden y la paginación del catálogo', async () => {
      expect(models(await list('?brand=KIA&status=vendido'))).toEqual(['Cerato', 'Picanto', 'Rio', 'Seltos']);
      expect(models(await list('?model=oro&fuel=gasolina'))).toEqual(['Corolla']);
      const page = await list('?limit=3&page=2&sort=price_desc');
      expect(page.meta).toEqual({ total: 8, page: 2, limit: 3, pages: 3 });
      expect(page.data).toHaveLength(3);
      const prices = (await list('?sort=price_asc&limit=50')).data.map((v) => Number(v.price));
      expect(prices).toEqual([...prices].sort((x, y) => x - y));
    });

    it('trae la marca y nunca el embedding', async () => {
      const { data } = await list();
      expect(data[0].brand.name).toBeTruthy();
      expect(data[0]).not.toHaveProperty('embedding');
    });

    it('valida igual que el catálogo y no abre el catálogo público a los vendidos', async () => {
      await get('/api/admin/vehiculos?status=otro', adminToken).expect(400);
      await get('/api/admin/vehiculos?limit=1000', adminToken).expect(400);
      await get('/api/admin/vehiculos?desconocido=1', adminToken).expect(400);
      // El catálogo público sigue sin aceptar `vendido`.
      await request(ctx.server).get('/api/vehiculos?status=vendido').expect(400);
    });
  });
});
