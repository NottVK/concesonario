import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChatSession } from '../src/chat/entities/chat-session.entity.js';
import { hashToken } from '../src/chat/session/session.service.js';
import { demoVin, seedFichasVin } from '../src/fichas-vin/fichas-vin.seed.js';
import { hashDocument } from '../src/garantias/document-hash.js';
import { CasoGarantia, WarrantyStatus } from '../src/garantias/entities/caso-garantia.entity.js';
import { PropietarioVin } from '../src/garantias/entities/propietario-vin.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

process.env.MCP_IP_PER_MINUTE = '100000';
process.env.MCP_IP_CONCURRENT = '100';
process.env.MCP_GLOBAL_PER_MINUTE = '100000';
process.env.MCP_LOCKOUT_FAILURES = '100000';

const DOC = '1020304050';

describe('Contrato de integración v0.1: habilidades entrantes (e2e)', () => {
  let ctx: TestContext;
  let tallerKey: string;
  let otherKey: string;
  let ownerId: number;
  let ownerVin: string;
  let freeVin: string;
  let sessionId: string;

  const createBot = async (adminToken: string, name: string): Promise<string> =>
    ((await request(ctx.server).post('/api/admin/bots').set(auth(adminToken)).send({ name, limitPerMinute: 600 }).expect(201)).body as { apiKey: string }).apiKey;

  const call = (key: string, skill: string, params: object, idempotencyKey?: string) => {
    const req = request(ctx.server).post('/a2a/tasks').set('Authorization', `Bearer ${key}`);
    if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
    return req.send({ skill, params });
  };

  const newCase = async (status = WarrantyStatus.PENDING_MECHANIC): Promise<string> => {
    const repo = ctx.dataSource.getRepository(CasoGarantia);
    return (await repo.save(repo.create({ ownerId, sessionId, status }))).id;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    await ctx.dataSource.query(`TRUNCATE casos_garantia, propietarios_vin RESTART IDENTITY CASCADE`);
    const adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    tallerKey = await createBot(adminToken, 'Taller');
    otherKey = await createBot(adminToken, 'Otro Bot');
    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Chevrolet', country: 'EE. UU.', logoUrl: null });
    const repo = ctx.dataSource.getRepository(Vehicle);
    const make = (model: string, status: VehicleStatus) =>
      repo.save(repo.create({ brandId: brand.id, model, year: 2016, version: 'LT', price: '40000000.00', mileage: 0, color: 'Rojo', fuel: FuelType.GASOLINE, transmission: Transmission.MANUAL, status, description: null, images: [] }));
    const sold = await make('Spark', VehicleStatus.SOLD);
    const free = await make('Beat', VehicleStatus.NEW);
    await seedFichasVin(ctx.dataSource);
    ownerVin = demoVin(sold.id);
    freeVin = demoVin(free.id);
    const owners = ctx.dataSource.getRepository(PropietarioVin);
    ownerId = (await owners.save(owners.create({ documentHash: hashDocument(DOC), vin: ownerVin, purchaseDate: '2025-01-15' }))).id;
    const chat = await request(ctx.server).post('/api/chat').send({ message: 'hola' }).expect(200);
    sessionId = (await ctx.dataSource.getRepository(ChatSession).findOneByOrFail({ tokenHash: hashToken((chat.body as { sessionToken: string }).sessionToken) })).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('la tarjeta publica las habilidades del contrato', async () => {
    const res = await request(ctx.server).get('/.well-known/agent.json').expect(200);
    expect(res.body.skills).toEqual(expect.arrayContaining(['consultar_ficha_vin', 'consultar_vehiculo', 'consultar_caso', 'informar_decision_garantia']));
  });

  it('consultar_ficha_vin: cualquier bot con key; respuesta con la forma del contrato y sin datos del dueño', async () => {
    const res = await call(otherKey, 'consultar_ficha_vin', { vin: freeVin.toLowerCase() }).expect(200);
    expect(res.body).toMatchObject({ status: 'completed', code: null, message: 'Listo', data: { marca: 'Chevrolet', modelo: 'Beat', anio: 2016 } });
    expect(res.body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/documento|propietario|1020304050/i);
  });

  it('consultar_ficha_vin: VIN inválido es 400 INVALID_VIN; inexistente y vendido dan el mismo 404', async () => {
    expect((await call(otherKey, 'consultar_ficha_vin', { vin: 'ABC' }).expect(400)).body.code).toBe('INVALID_VIN');
    const missing = await call(otherKey, 'consultar_ficha_vin', { vin: '1HGCM82633A004352' }).expect(404);
    const sold = await call(otherKey, 'consultar_ficha_vin', { vin: ownerVin }).expect(404);
    expect({ ...sold.body, request_id: 0 }).toEqual({ ...missing.body, request_id: 0 });
  });

  it('consultar_vehiculo: solo Taller o Tienda; devuelve ficha, fecha de venta y política, nunca el documento', async () => {
    await call(otherKey, 'consultar_vehiculo', { id: ownerId }).expect(403);
    const res = await call(tallerKey, 'consultar_vehiculo', { id: ownerId }).expect(200);
    expect(res.body.data).toMatchObject({ id: ownerId, vin: ownerVin, fecha_venta: '2025-01-15', garantia: { meses: 36, km: 100000 } });
    expect(JSON.stringify(res.body)).not.toMatch(/1020304050|documento/i);
    await call(tallerKey, 'consultar_vehiculo', { id: 99999 }).expect(404);
  });

  it('consultar_caso: solo Taller; formato inválido es 400 y un caso inexistente 404', async () => {
    const id = await newCase();
    await call(otherKey, 'consultar_caso', { caso_id: id }).expect(403);
    expect((await call(tallerKey, 'consultar_caso', { caso_id: id }).expect(200)).body.data).toEqual({ caso_id: id, estado: 'pendiente_mecanico' });
    await call(tallerKey, 'consultar_caso', { caso_id: 'no-es-uuid' }).expect(400);
    await call(tallerKey, 'consultar_caso', { caso_id: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('informar_decision_garantia: exige Idempotency-Key, solo Taller y registra la decisión', async () => {
    const id = await newCase();
    const params = { caso_id: id, aceptada: true, motivo: 'Falla del módulo de encendido dentro del plazo' };
    await call(tallerKey, 'informar_decision_garantia', params).expect(400);
    await call(otherKey, 'informar_decision_garantia', params, 'otro-1').expect(403);
    const res = await call(tallerKey, 'informar_decision_garantia', params, 'taller-1').expect(200);
    expect(res.body).toMatchObject({ status: 'completed', message: 'Decisión registrada', data: { caso_id: id, estado: 'garantia_aceptada' } });
    const saved = await ctx.dataSource.getRepository(CasoGarantia).findOneByOrFail({ id });
    expect(saved.status).toBe(WarrantyStatus.ACCEPTED);
    expect(saved.chargeRef).toBeTruthy();
  });

  it('repetir la misma petición con la misma clave devuelve lo mismo; otra petición con esa clave es 409 IDEMPOTENCY_CONFLICT', async () => {
    const id = await newCase();
    const params = { caso_id: id, aceptada: false, motivo: 'Cambio ajeno de piezas' };
    const first = await call(tallerKey, 'informar_decision_garantia', params, 'taller-2').expect(200);
    const again = await call(tallerKey, 'informar_decision_garantia', params, 'taller-2').expect(200);
    expect(again.body).toMatchObject({ status: 'completed', data: first.body.data });
    const other = await call(tallerKey, 'informar_decision_garantia', { ...params, aceptada: true }, 'taller-2').expect(409);
    expect(other.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('un caso ya decidido de otra forma es 409 DECISION_ALREADY_REGISTERED; uno no pendiente es 409 CASE_NOT_PENDING', async () => {
    const decided = await newCase(WarrantyStatus.REJECTED);
    const res = await call(tallerKey, 'informar_decision_garantia', { caso_id: decided, aceptada: true, motivo: 'ok' }, 'taller-3').expect(409);
    expect(res.body.code).toBe('DECISION_ALREADY_REGISTERED');
    const expired = await newCase(WarrantyStatus.EXPIRED);
    expect((await call(tallerKey, 'informar_decision_garantia', { caso_id: expired, aceptada: true, motivo: 'ok' }, 'taller-4').expect(409)).body.code).toBe('CASE_NOT_PENDING');
  });

  it('el motivo es dato no confiable: se guarda sin enlaces ni documentos y con tope', async () => {
    const id = await newCase();
    const motivo = `Ver https://malo.example/x con cédula 1020304050 ${'a'.repeat(900)}`;
    await call(tallerKey, 'informar_decision_garantia', { caso_id: id, aceptada: false, motivo }, 'taller-5').expect(200);
    const reason = (await ctx.dataSource.getRepository(CasoGarantia).findOneByOrFail({ id })).reason ?? '';
    expect(reason).not.toMatch(/malo\.example|1020304050/);
    expect(Array.from(reason).length).toBeLessThanOrEqual(300);
  });

  it('parámetros de más o mal formados son 400', async () => {
    const id = await newCase();
    await call(tallerKey, 'informar_decision_garantia', { caso_id: id, aceptada: 'si', motivo: 'x' }, 'taller-6').expect(400);
    await call(tallerKey, 'informar_decision_garantia', { caso_id: id, aceptada: true, motivo: 'x', extra: 1 }, 'taller-7').expect(400);
  });
});
