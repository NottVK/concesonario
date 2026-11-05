import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODEL_PROVIDER } from '../src/chat/model/model-provider.js';
import type { MockProvider } from '../src/chat/model/mock.provider.js';
import { VIN_RECORDS } from '../src/database/seeds/vin-data.js';
import { VinRecord } from '../src/vin/entities/vin-record.entity.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers/app.js';

describe('VIN (e2e): GET /api/vin/:vin y respuesta del chat sin modelo', () => {
  let ctx: TestContext;
  let provider: MockProvider;

  beforeAll(async () => {
    ctx = await createTestContext({ listen: true });
    provider = ctx.app.get<MockProvider>(MODEL_PROVIDER);
    await resetDatabase(ctx.dataSource);
    await ctx.dataSource.query('TRUNCATE TABLE vehiculos_vin CASCADE');
    await ctx.dataSource.getRepository(VinRecord).insert(VIN_RECORDS.map((row) => ({ ...row })));
  });

  afterAll(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE vehiculos_vin CASCADE');
    await ctx.app.close();
  });

  it('un VIN registrado devuelve todos sus datos de fábrica, sin datos del propietario', async () => {
    const res = await request(ctx.server).get('/api/vin/9fbhjd204lm500005').expect(200);
    expect(res.body).toEqual({
      vin: '9FBHJD204LM500005', registered: true, source: 'registro', brand: 'Renault', model: 'Duster', year: 2020, version: 'Intens 1.3 Turbo',
      bodyType: 'SUV', doors: 5, engine: '1.3 L turbo', fuel: 'Gasolina', transmission: 'Automática CVT',
      // Qué significa cada parte del VIN; la NHTSA está apagada en las pruebas (y no conoce los VIN de Colombia).
      structure: {
        wmi: '9FB', manufacturer: 'Renault', region: 'Suramérica', country: 'Colombia', vds: 'HJD20', checkDigit: '4', checkDigitExpected: '4',
        checkDigitValid: true, yearCode: 'L', year: 2020, plantCode: 'M', serial: '500005',
      },
      external: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cedula|telefono|cliente|propietario/i);
  });

  it('un VIN sin registro devuelve la marca y el año de su estructura', async () => {
    const res = await request(ctx.server).get('/api/vin/KMHCT41DBRU899999').expect(200);
    expect(res.body).toMatchObject({ vin: 'KMHCT41DBRU899999', registered: false, source: 'estructura', brand: 'Hyundai', year: 2024, model: null, engine: null, external: null });
    expect(res.body.structure).toMatchObject({ country: 'Corea del Sur', region: 'Asia' });
  });

  it('un VIN mal formado responde 400 sin repetir lo enviado', async () => {
    for (const bad of ['123', '9FBHJD2O4LM500005', 'a'.repeat(200), "9FB' OR '1'='1"]) {
      const res = await request(ctx.server).get(`/api/vin/${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(bad.slice(0, 20));
    }
  });

  it('el chat responde un VIN al instante con esos datos y sin llamar al modelo', async () => {
    provider.resetScript();
    const res = await request(ctx.server).post('/api/chat').send({ message: 'Hola, mi VIN es 3mzbp2sm1rm200002, ¿qué carro es?' }).expect(200);
    expect(res.body.reply).toContain('Estos son los datos del VIN 3MZBP2SM1RM200002:');
    expect(res.body.reply).toContain('• Marca: Mazda');
    expect(res.body.reply).toContain('• Año: 2024');
    expect(res.body.reply).toContain('las posiciones 1 a 3 (3MZ) indican que se fabricó en México (Norteamérica), fabricante Mazda.');
    expect(res.body.reply).toContain('Ojo: el dígito verificador (posición 9) no cuadra');
    expect(provider.calls).toBe(0);
  });

  it('si dice VIN pero el código está mal escrito, avisa sin llamar al modelo', async () => {
    provider.resetScript();
    const res = await request(ctx.server).post('/api/chat').send({ message: 'mi vin es 9FBHJD204LM50000' }).expect(200);
    expect(res.body.reply).toMatch(/^Ese VIN no parece válido/);
    expect(provider.calls).toBe(0);
  });
});
