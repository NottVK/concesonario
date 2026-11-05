import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODEL_PROVIDER } from '../src/chat/model/model-provider.js';
import type { MockProvider } from '../src/chat/model/mock.provider.js';
import { RELATION_RECORDS } from '../src/database/seeds/relaciones-data.js';
import { VIN_RECORDS } from '../src/database/seeds/vin-data.js';
import { ContactCrypto } from '../src/relaciones/contact-crypto.js';
import { Relationship } from '../src/relaciones/entities/relationship.entity.js';
import { VinRecord } from '../src/vin/entities/vin-record.entity.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

/**
 * Taller (decisión 131): el MODELO organiza los pasos con las tools del taller (aquí el guion del mock, que sigue la
 * regla 13 del prompt) contra el taller simulado. Se prueba lo que pone el servidor: la cédula no llega al modelo ni
 * al historial, solo se agenda una hora ofrecida y con «sí», y la orden queda copiada.
 */
describe('Taller (e2e): el agente agenda en el taller simulado con sus tools', () => {
  let ctx: TestContext;
  let provider: MockProvider;
  let token: string | undefined;

  const say = async (message: string): Promise<string> => {
    const req = request(ctx.server).post('/api/chat');
    if (token) req.set('X-Chat-Session', token);
    const res = await req.send({ message }).expect(200);
    token ??= res.body.sessionToken as string;
    return res.body.reply as string;
  };

  beforeAll(async () => {
    ctx = await createTestContext({ listen: true });
    provider = ctx.app.get<MockProvider>(MODEL_PROVIDER);
    await resetDatabase(ctx.dataSource);
    await ctx.dataSource.getRepository(VinRecord).insert(VIN_RECORDS.map((row) => ({ ...row })));
    const crypto = ContactCrypto.fromEnv();
    await ctx.dataSource.getRepository(Relationship).insert(
      RELATION_RECORDS.map(({ cedula, nombre, telefono, ...row }) => ({ ...row, cedulaHmac: crypto.cedulaHmac(cedula), encryptedContact: crypto.seal(row.id, { cedula, nombre, telefono }) })),
    );
  });

  afterAll(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE ordenes_taller, relaciones, vehiculos_vin CASCADE');
    await ctx.app.close();
  });

  it('de punta a punta: identificar, prediagnóstico, horas del taller, «sí» y orden copiada', async () => {
    provider.resetScript();
    expect(await say('Mi carro chilla al frenar, quiero llevarlo al taller')).toMatch(/número de documento \(DNI\) y el número VIN/);
    expect(await say('mi número de documento es 1.020.304.050 y el VIN 9fbhjd204pm100001')).toContain('Encontré tu Renault Duster 2023 de placa LMX201');
    const hours = await say('chilla al frenar');
    // El guion salta del prediagnóstico a las horas: el servidor antepone el prediagnóstico para que el cliente lo vea.
    expect(hours).toMatch(/^Según el prediagnóstico del taller, parece un tema de frenos\./);
    expect(hours).toContain('Horas libres en Pulgas Locas Frenos y Suspensión');
    expect(await say('1')).toMatch(/¿Confirmas\?$/);
    const booked = await say('sí');
    expect(booked).toContain('Tu cita en el taller quedó agendada: orden OT-0001');
    expect(booked).toContain('un mecánico de la sede toma la orden');

    const orders = await ctx.dataSource.query('SELECT codigo, id_relacion, sede_codigo, estado, origen FROM ordenes_taller') as Record<string, string>[];
    expect(orders).toEqual([{ codigo: 'OT-0001', id_relacion: 'REL-1001', sede_codigo: 'PL-FRENOS', estado: 'agendada', origen: 'simulado' }]);
  });

  it('la cédula no llega al modelo ni queda en el historial ni en la base en claro', async () => {
    const seen = JSON.stringify(provider.lastRequest);
    expect(seen).not.toMatch(/1[.\s]?020[.\s]?304[.\s]?050/);
    const history = JSON.stringify(await ctx.dataSource.query('SELECT mensaje FROM conversaciones'));
    expect(history).not.toMatch(/1[.\s]?020[.\s]?304[.\s]?050/);
    expect(history).toContain('[número]');
    const stored = JSON.stringify(await ctx.dataSource.query('SELECT * FROM relaciones'));
    expect(stored).not.toMatch(/1020304050|Laura|3015556677/);
  });

  it('sin «sí» no se agenda: el servidor rechaza la llamada del modelo', async () => {
    token = undefined;
    provider.resetScript();
    await say('quiero una cita en el taller');
    await say('1020304050 9FBHJD204PM100002');
    // El modelo se salta el prediagnóstico y los horarios e intenta agendar una hora que el taller nunca ofreció.
    provider.setScript((req) => {
      const last = req.messages.at(-1)!;
      if (last.role === 'tool') return { content: /"error":"[^"]+"/.test(last.content) ? 'El taller no me dejó agendar todavía.' : 'agendada', toolCalls: [] };
      return { content: '', toolCalls: [{ id: 'x', name: 'agendar_cita_taller', arguments: { sede: 'PL-FRENOS', fecha_hora: '2030-01-08T07:00:00-05:00' } }] };
    });
    expect(await say('sí')).toBe('El taller no me dejó agendar todavía.');
    expect(await ctx.dataSource.query('SELECT codigo FROM ordenes_taller')).toHaveLength(1);
  });

  it('cédula y VIN que no coinciden: no se revela si existe el uno o el otro', async () => {
    token = undefined;
    provider.resetScript();
    await say('quiero llevar mi carro al taller');
    expect(await say('39765432 9FBHJD204PM100001')).toMatch(/^No hay un vehículo con ese número de documento y ese VIN/);
  });
});
