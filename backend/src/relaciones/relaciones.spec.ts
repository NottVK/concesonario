import type { Repository } from 'typeorm';
import { RELATION_RECORDS } from '../database/seeds/relaciones-data.js';
import { VIN_RECORDS } from '../database/seeds/vin-data.js';
import type { VinRecord } from '../vin/entities/vin-record.entity.js';
import { ContactCrypto, normalizeCedula } from './contact-crypto.js';
import type { Relationship } from './entities/relationship.entity.js';
import { RelacionesService } from './relaciones.service.js';
import { warrantyOf } from './warranty.js';

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const TODAY = '2026-10-31';

describe('Garantía de fábrica (3 años o 60.000 km)', () => {
  it('coincide con la hoja «Datos de prueba» del Excel del taller', () => {
    const expected: Record<string, boolean> = {
      'REL-1001': true, 'REL-1002': true, 'REL-1003': true, 'REL-1004': false,
      'REL-1005': false, 'REL-1006': true, 'REL-1007': true, 'REL-1008': true,
    };
    for (const row of RELATION_RECORDS) expect(warrantyOf(row.saleDate, row.mileage, row.plan, TODAY).vigente, row.id).toBe(expected[row.id]);
  });

  it('vence con lo primero: la fecha o los 60.000 km, y el motivo lo dice', () => {
    expect(warrantyOf('2020-02-17', 98_000, 'todo', TODAY)).toMatchObject({ vigente: false, vence: '2023-02-17', motivo: 'La garantía venció el 2023-02-17' });
    expect(warrantyOf('2025-01-10', 61_000, 'todo', TODAY)).toMatchObject({ vigente: false, motivo: expect.stringMatching(/60\.000 km/) });
    expect(warrantyOf('2023-11-20', 42_000, 'tren_motriz', TODAY)).toEqual({ vigente: true, vence: '2026-11-20', kmMaximo: 60_000, cubre: ['motor', 'transmision', 'electrico'] });
    expect(warrantyOf('2023-11-20', 42_000, 'tren_motriz', '2026-11-20').vigente).toBe(false);
    expect(warrantyOf('2024-02-29', 1_000, 'todo', TODAY).vence).toBe('2027-02-28');
  });
});

describe('Cifrado de los datos de contacto', () => {
  const crypto = new ContactCrypto(KEY);
  const contact = { cedula: '39765432', nombre: 'Marta Gil', telefono: '3009998877' };

  it('cifra y descifra, atado al id de la relación', () => {
    const sealed = crypto.seal('REL-1005', contact);
    expect(sealed.startsWith('enc:v2:')).toBe(true);
    expect(sealed).not.toContain('39765432');
    expect(crypto.open('REL-1005', sealed)).toEqual(contact);
    expect(() => crypto.open('REL-1001', sealed)).toThrow();
  });

  it('el HMAC de la cédula no depende de puntos ni espacios y no revela la cédula', () => {
    expect(normalizeCedula('39.765.432')).toBe('39765432');
    expect(crypto.cedulaHmac('39.765.432')).toBe(crypto.cedulaHmac('39765432'));
    expect(crypto.cedulaHmac('39765432')).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.cedulaHmac('39765432')).not.toBe(new ContactCrypto(Buffer.alloc(32, 7)).cedulaHmac('39765432'));
  });
});

describe('RelacionesService', () => {
  const crypto = new ContactCrypto(KEY);
  const rows: Relationship[] = RELATION_RECORDS.map(({ cedula, nombre, telefono, ...row }) => ({
    ...row, cedulaHmac: crypto.cedulaHmac(cedula), encryptedContact: crypto.seal(row.id, { cedula, nombre, telefono }), createdAt: new Date(),
  }));
  const relations = { findOneBy: vi.fn(async (where: Partial<Relationship>) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k as keyof Relationship] === v)) ?? null) };
  const vins = { findOneBy: vi.fn(async ({ vin }: { vin: string }) => (VIN_RECORDS.find((v) => v.vin === vin) as VinRecord | undefined) ?? null) };
  const service = new RelacionesService(relations as unknown as Repository<Relationship>, vins as unknown as Repository<VinRecord>, crypto);

  it('identifica con cédula + VIN y no devuelve datos personales', async () => {
    const found = await service.identify('1.020.304.050', '9fbhjd204pm100001', TODAY);
    expect(found).toMatchObject({ idRelacion: 'REL-1001', plate: 'LMX201', vehicle: 'Renault Duster 2023' });
    expect(JSON.stringify(found)).not.toMatch(/1020304050|Laura|3015556677/);
  });

  it('cédula de otra persona o VIN de otro carro: null (la misma respuesta en los dos casos)', async () => {
    expect(await service.identify('39765432', '9FBHJD204PM100001', TODAY)).toBeNull();
    expect(await service.identify('1020304050', '9FBHJD204LM500005', TODAY)).toBeNull();
  });

  it('consultar_relacion devuelve la forma del contrato del taller en camelCase', async () => {
    const record = await service.consult('REL-1005', TODAY);
    expect(record).toEqual({
      idRelacion: 'REL-1005', cedula: '39765432', cliente: 'Marta Gil', telefono: '3009998877', vin: '9FBHJD204LM500005', placa: 'MGL630', kilometraje: 98000,
      cabeceraVin: { vin: '9FBHJD204LM500005', marca: 'Renault', modelo: 'Duster', anio: 2020, version: 'Intens 1.3 Turbo', carroceria: 'SUV', puertas: 5, motor: '1.3 L turbo', combustible: 'Gasolina', transmision: 'Automática CVT' },
      garantia: { vigente: false, vence: '2023-02-17', kmMaximo: 60000, cubre: ['frenos', 'suspension', 'motor', 'electrico', 'transmision'], motivo: 'La garantía venció el 2023-02-17' },
    });
    expect(await service.consult('REL-9999', TODAY)).toBeNull();
    expect(await service.consult("REL-1' OR '1'='1", TODAY)).toBeNull();
  });
});
