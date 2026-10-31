import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatSession } from '../src/chat/entities/chat-session.entity.js';
import { hashToken } from '../src/chat/session/session.service.js';
import { hashDocument } from '../src/garantias/document-hash.js';
import { CasoGarantia, WarrantyStatus } from '../src/garantias/entities/caso-garantia.entity.js';
import { PropietarioVin } from '../src/garantias/entities/propietario-vin.entity.js';
import { GarantiasService, resetIdentifyLimits } from '../src/garantias/garantias.service.js';
import { SimulatedServices } from '../src/garantias/services/simulated.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

const DOC = '1020304050';
const VIN = 'AMXVEH00000000001';

function monthsAgo(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

describe('Flujo de garantías (e2e)', () => {
  let ctx: TestContext;
  let sim: SimulatedServices;
  let service: GarantiasService;
  let mechanicToken: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    sim = ctx.app.get(SimulatedServices, { strict: false });
    service = ctx.app.get(GarantiasService);
    await resetDatabase(ctx.dataSource);
    mechanicToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.MECHANIC, 'mecanico@prueba.co'));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    sim.reset();
    resetIdentifyLimits();
    await ctx.dataSource.query(`TRUNCATE casos_garantia, propietarios_vin RESTART IDENTITY CASCADE`);
  });

  const owner = (months = 6): Promise<PropietarioVin> => {
    const repo = ctx.dataSource.getRepository(PropietarioVin);
    return repo.save(repo.create({ documentHash: hashDocument(DOC), vin: VIN, purchaseDate: monthsAgo(months) }));
  };

  /** Sesión de chat nueva (el saludo no llama al modelo) con su id interno. */
  async function session(): Promise<{ token: string; id: string }> {
    const res = await request(ctx.server).post('/api/chat').send({ message: 'hola' }).expect(200);
    const token = (res.body as { sessionToken: string }).sessionToken;
    const row = await ctx.dataSource.getRepository(ChatSession).findOneByOrFail({ tokenHash: hashToken(token) });
    return { token, id: row.id };
  }

  const identify = (token: string, documento: string, vin: string) =>
    request(ctx.server).post('/api/chat/garantias/identificar').set('X-Chat-Session', token).send({ document: documento, vin });

  /** Propietario + sesión identificada por el formulario; listo para reportar la falla. */
  async function identified(months = 6) {
    const o = await owner(months);
    const s = await session();
    await identify(s.token, DOC, VIN).expect(200);
    return { o, s };
  }

  const pending = async (): Promise<CasoGarantia> => ctx.dataSource.getRepository(CasoGarantia).findOneByOrFail({ status: WarrantyStatus.PENDING_MECHANIC });

  it('1. identificación correcta: ata el caso a la sesión y no guarda el documento', async () => {
    const o = await owner();
    const s = await session();
    const res = await identify(s.token, '1.020.304.050', VIN.toLowerCase()).expect(200);
    expect(res.body).toMatchObject({ ok: true });
    const kase = await ctx.dataSource.getRepository(CasoGarantia).findOneByOrFail({ sessionId: s.id });
    expect(kase.ownerId).toBe(o.id);
    expect(JSON.stringify(await ctx.dataSource.query(`SELECT * FROM propietarios_vin`))).not.toContain(DOC);
  });

  it('2. no coincide: documento, VIN o ambos erróneos dan EXACTAMENTE la misma respuesta y no crean caso', async () => {
    await owner();
    const s = await session();
    const answers: string[] = [];
    for (const [documento, vin] of [['9999999999', VIN], [DOC, 'AMXVEH99999999999'], ['9999999999', 'AMXVEH99999999999']] as const) {
      const res = await identify(s.token, documento, vin);
      expect(res.status).toBe(404);
      answers.push(JSON.stringify(res.body));
    }
    expect(new Set(answers).size).toBe(1);
    // Un formato imposible ni siquiera llega a la verificación (validación de entrada, sin revelar nada).
    await identify(s.token, 'abc', 'x').expect(400);
    for (const body of [{}, { document: 123, vin: [] }, { document: 'x'.repeat(5000), vin: null }]) {
      const res = await request(ctx.server).post('/api/chat/garantias/identificar').set('X-Chat-Session', s.token).send(body);
      expect(res.status).toBe(400);
    }
    expect(await ctx.dataSource.getRepository(CasoGarantia).count()).toBe(0);
  });

  it('3. vencida: avisa el motivo, ofrece revisión y NO consulta disponibilidad ni agenda', async () => {
    const { s } = await identified(40);
    const view = await service.report(s.id, 'el motor hace ruido', false);
    expect(view).toMatchObject({ state: 'expired', canRequestReview: true });
    expect(view.message).toMatch(/36 meses/);
    expect(sim.availabilityCalls).toBe(0);
    expect(sim.bookingCalls).toBe(0);
  });

  it('4. cambios ajenos: NO rechaza, los marca para el mecánico y sí agenda la cita', async () => {
    const { o, s } = await identified();
    sim.setPurchases(o.id, [{ date: monthsAgo(1), item: 'Rines', installedBy: 'third_party' }]);
    const view = await service.report(s.id, 'vibra el volante', false);
    expect(view.state).toBe('pending_mechanic');
    const kase = await pending();
    expect(kase).toMatchObject({ foreignChanges: true, unverified: false });
    expect(kase.appointmentId).toBeTruthy();
    expect(sim.bookingCalls).toBe(1);
  });

  it('5. aceptada: cobro a Pagos, y el cliente recibe la lista de repuestos en el chat', async () => {
    const { s } = await identified();
    await service.report(s.id, 'falla la caja', false);
    const kase = await pending();
    await request(ctx.server).post(`/api/garantias/${kase.id}/decision`).set(auth(mechanicToken)).send({ action: 'aceptar', parts: ['Caja de cambios', 'Sello'] }).expect(200);
    expect(sim.chargesRegistered).toBe(1);
    const view = await service.status(s.id);
    expect(view).toMatchObject({ state: 'accepted', parts: ['Caja de cambios', 'Sello'] });
  });

  it('6. rechazada: el cliente recibe el motivo, sin cobro; sin motivo no se puede rechazar', async () => {
    const { s } = await identified();
    await service.report(s.id, 'rayón en la puerta', false);
    const kase = await pending();
    await request(ctx.server).post(`/api/garantias/${kase.id}/decision`).set(auth(mechanicToken)).send({ action: 'rechazar' }).expect(400);
    await request(ctx.server).post('/api/garantias/no-es-uuid/decision').set(auth(mechanicToken)).send({ action: 'rechazar', reason: 'x'.repeat(600) }).expect(400);
    await request(ctx.server).post(`/api/garantias/${kase.id}/decision`).set(auth(mechanicToken)).send({ action: 'rechazar', reason: 'Es un daño estético, no cubierto' }).expect(200);
    expect(await service.status(s.id)).toMatchObject({ state: 'rejected', reason: 'Es un daño estético, no cubierto' });
    expect(sim.chargesRegistered).toBe(0);
  });

  it('7. servicio que no responde: queda «no verificado» y pasa al mecánico, nunca se rechaza', async () => {
    const { s } = await identified();
    sim.fail('taller');
    sim.fail('tienda');
    const view = await service.report(s.id, 'se apaga solo', false);
    expect(view.state).toBe('pending_mechanic');
    expect(view.message).toMatch(/no pudimos verificar/i);
    expect(await pending()).toMatchObject({ unverified: true, appointmentId: null });
  });

  it('8. cobro repetido: aceptar dos veces, incluso tras perder el guardado, registra UN solo cobro', async () => {
    const { s } = await identified();
    await service.report(s.id, 'falla la caja', false);
    const kase = await pending();
    const accept = () => request(ctx.server).post(`/api/garantias/${kase.id}/decision`).set(auth(mechanicToken)).send({ action: 'aceptar', parts: ['Caja'] });
    await accept().expect(200);
    await accept().expect(200);
    expect(sim.chargeCalls).toBe(1);
    // Se pierde el guardado (el caso vuelve a pendiente) y el mecánico reintenta: Pagos recibe la MISMA clave de idempotencia.
    await ctx.dataSource.query(`UPDATE casos_garantia SET estado = 'pendiente_mecanico' WHERE id = $1`, [kase.id]);
    await accept().expect(200);
    expect(sim.chargeCalls).toBe(2);
    expect(sim.chargesRegistered).toBe(1);
  });
});
