import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

const PHONE = '3109876543';
const EMAIL = 'privado.historial@correo.co';

/** Historial de ventas (solo admin): la lista no lleva correo ni teléfono, el detalle lleva el correo y el teléfono nunca sale. */
describe('Historial de ventas (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let sellerToken: string;
  let customerToken: string;
  let saleIds: number[];
  let counter = 0;

  const newVehicle = async (brand: Brand): Promise<Vehicle> => {
    const repo = ctx.dataSource.getRepository(Vehicle);
    return repo.save(
      repo.create({
        brandId: brand.id, model: `Modelo ${++counter}`, year: 2024, version: 'Base', price: '120000000', mileage: 500,
        fuel: FuelType.GASOLINE, transmission: Transmission.AUTOMATIC, color: 'Negro', status: VehicleStatus.NEW,
        description: null, images: [],
      }),
    );
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    customerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.CUSTOMER));
    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Renault', country: 'Francia', logoUrl: null });
    const customers = ctx.dataSource.getRepository(Customer);
    const buyer = await customers.save(customers.create({ name: 'Marta Compradora', email: EMAIL, phone: PHONE }));
    saleIds = [];
    for (const price of ['110000000', '115000000.50', '118000000']) {
      const car = await newVehicle(brand);
      const res = await request(ctx.server)
        .post('/api/ventas').set(auth(sellerToken))
        .send({ vehicleId: car.id, customerId: buyer.id, finalPrice: price, payment: 'credito' }).expect(201);
      saleIds.push(res.body.id);
    }
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('solo el admin lo ve: sin token 401, vendedor y cliente 403', async () => {
    await request(ctx.server).get('/api/ventas').expect(401);
    await request(ctx.server).get('/api/ventas').set(auth(sellerToken)).expect(403);
    await request(ctx.server).get('/api/ventas').set(auth(customerToken)).expect(403);
    await request(ctx.server).get(`/api/ventas/${saleIds[0]}`).set(auth(sellerToken)).expect(403);
  });

  describe('lista', () => {
    it('trae solo el nombre del cliente: ni correo ni teléfono, ni en ningún otro campo', async () => {
      const res = await request(ctx.server).get('/api/ventas').set(auth(adminToken)).expect(200);
      expect(res.body.data).toHaveLength(3);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(EMAIL);
      expect(text).not.toContain(PHONE);
      expect(text).not.toMatch(/phone|telefono|email|correo|passwordHash|\$2[aby]\$/i);
      for (const sale of res.body.data) {
        expect(Object.keys(sale.customer).sort()).toEqual(['id', 'name']);
        expect(sale.customer.name).toBe('Marta Compradora');
        expect(Object.keys(sale.seller).sort()).toEqual(['id', 'name']);
        expect(Object.keys(sale.vehicle).sort()).toEqual(['brand', 'id', 'model', 'version', 'year']);
        expect(Object.keys(sale).sort()).toEqual(['customer', 'finalPrice', 'id', 'payment', 'seller', 'soldAt', 'vehicle']);
      }
    });

    it('va de la más reciente a la más antigua y pagina', async () => {
      const all = await request(ctx.server).get('/api/ventas').set(auth(adminToken)).expect(200);
      expect(all.body.data.map((sale: { id: number }) => sale.id)).toEqual([...saleIds].reverse());
      expect(all.body.data[0].finalPrice).toBe('118000000.00');
      const page = await request(ctx.server).get('/api/ventas?limit=2&page=2').set(auth(adminToken)).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 });
    });
  });

  describe('detalle', () => {
    it('trae el correo del cliente, pero nunca su teléfono', async () => {
      const res = await request(ctx.server).get(`/api/ventas/${saleIds[1]}`).set(auth(adminToken)).expect(200);
      expect(res.body.customer).toEqual({ id: expect.any(Number), name: 'Marta Compradora', email: EMAIL });
      expect(JSON.stringify(res.body)).not.toContain(PHONE);
      expect(JSON.stringify(res.body)).not.toMatch(/phone|telefono|passwordHash|\$2[aby]\$/i);
      expect(res.body).toMatchObject({ id: saleIds[1], finalPrice: '115000000.50', payment: 'credito' });
      expect(res.body.vehicle).toMatchObject({ brand: 'Renault', color: 'Negro', mileage: 500, listPrice: '120000000.00' });
      expect(Object.keys(res.body.seller).sort()).toEqual(['id', 'name']);
    });

    it('una venta que no existe da 404, y un id basura 400', async () => {
      await request(ctx.server).get('/api/ventas/999999').set(auth(adminToken)).expect(404);
      for (const id of ['abc', '0', '-1', '1.5', '99999999999999999999', '2147483648']) {
        await request(ctx.server).get(`/api/ventas/${id}`).set(auth(adminToken)).expect(400);
      }
    });
  });
});
