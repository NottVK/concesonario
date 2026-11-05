import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { VIN_RECORDS } from '../database/seeds/vin-data.js';
import type { VinRecord } from './entities/vin-record.entity.js';
import { brandFromWmi, isValidVin, normalizeVin, yearFromVin } from './vin-decoder.js';
import { externalDecoderEnabled, toData } from './nhtsa-vin.client.js';
import type { ExternalVinData, ExternalVinDecoder } from './nhtsa-vin.client.js';
import { INVALID_VIN_MESSAGE, VinService } from './vin.service.js';
import { expectedCheckDigit, readStructure } from './vin-structure.js';

const NOW = new Date('2026-10-31T12:00:00-05:00');

describe('Lectura de la estructura del VIN', () => {
  it('acepta 17 caracteres sin I, O ni Q y normaliza mayúsculas', () => {
    expect(normalizeVin('  9fbhjd204lm500005 ')).toBe('9FBHJD204LM500005');
    expect(isValidVin('9FBHJD204LM500005')).toBe(true);
    for (const bad of ['9FBHJD204LM50000', '9FBHJD204LM5000055', '9FBHJD2O4LM500005', '9FBHJD2I4LM500005', '9FBHJD2Q4LM500005', '9FBHJD204LM50000-']) {
      expect(isValidVin(bad), bad).toBe(false);
    }
  });

  it('saca la marca de las 3 primeras posiciones (los cuatro fabricantes del Excel del taller)', () => {
    expect(brandFromWmi('9FBHJD204PM100001')).toBe('Renault');
    expect(brandFromWmi('3MZBP2SM1RM200002')).toBe('Mazda');
    expect(brandFromWmi('9BWAG45U0NT300003')).toBe('Volkswagen');
    expect(brandFromWmi('KMHCT41DBMU400004')).toBe('Hyundai');
    expect(brandFromWmi('ZZZCT41DBMU400004')).toBeNull();
  });

  it('el año de la posición 10 coincide con el de los 8 VIN del taller', () => {
    for (const row of VIN_RECORDS) expect(yearFromVin(row.vin, NOW), row.vin).toBe(row.year);
  });

  it('el ciclo de 30 años elige el más reciente que no pase del año que viene', () => {
    const withCode = (code: string): string => `9FBHJD204${code}M500005`;
    expect(yearFromVin(withCode('Y'), NOW)).toBe(2000);
    expect(yearFromVin(withCode('V'), NOW)).toBe(2027);
    expect(yearFromVin(withCode('1'), NOW)).toBe(2001);
    expect(yearFromVin(withCode('A'), NOW)).toBe(2010);
    expect(yearFromVin(withCode('0'), NOW)).toBeNull();
  });
});

describe('Qué significa cada parte del VIN', () => {
  it('el dígito verificador: el VIN real de un Honda Accord 2003 cumple; el del Mazda 3 2024 de prueba no', () => {
    expect(expectedCheckDigit('1HGCM82633A004352')).toBe('3');
    expect(readStructure('1HGCM82633A004352', NOW)).toMatchObject({ checkDigit: '3', checkDigitValid: true, region: 'Norteamérica', country: 'Estados Unidos', manufacturer: 'Honda' });
    expect(readStructure('3MZBP2SM1RM200002', NOW).checkDigitValid).toBe(false);
    // Cuando el cálculo da 10, el dígito se escribe X.
    expect(expectedCheckDigit('1HGCM826X3A000007')).toBe('X');
    expect(readStructure('1HGCM826X3A000007', NOW).checkDigitValid).toBe(true);
  });

  it('separa las partes y dice país, región, fabricante y año', () => {
    expect(readStructure('9FBHJD204LM500005', NOW)).toEqual({
      wmi: '9FB', manufacturer: 'Renault', region: 'Suramérica', country: 'Colombia', vds: 'HJD20', checkDigit: '4',
      checkDigitExpected: '4', checkDigitValid: true, yearCode: 'L', year: 2020, plantCode: 'M', serial: '500005',
    });
    expect(readStructure('3MZBP2SM1RM200002', NOW)).toMatchObject({ country: 'México', manufacturer: 'Mazda', year: 2024 });
    expect(readStructure('KMHCT41DBMU400004', NOW)).toMatchObject({ country: 'Corea del Sur', region: 'Asia', manufacturer: 'Hyundai' });
    expect(readStructure('WBA00000000000000', NOW)).toMatchObject({ country: 'Alemania', region: 'Europa', manufacturer: 'BMW' });
  });
});

describe('Respuesta de la NHTSA', () => {
  const honda = {
    Make: 'HONDA', Model: 'Accord', ModelYear: '2003', Trim: 'EX-V6', BodyClass: 'Coupe', Doors: '2', DisplacementL: '2.998832712',
    EngineCylinders: '6', FuelTypePrimary: 'Gasoline', TransmissionStyle: 'Automatic', PlantCountry: 'UNITED STATES (USA)',
    Manufacturer: 'AMERICAN HONDA MOTOR CO., INC.', ErrorCode: '0',
  };

  it('traduce la ficha a español y redondea el motor', () => {
    expect(toData(honda)).toEqual({
      source: 'NHTSA vPIC', make: 'Honda', model: 'Accord', year: 2003, trim: 'EX-V6', bodyClass: 'Coupé', doors: 2,
      engine: '3.0 L, 6 cilindros', fuel: 'Gasolina', transmission: 'Automática', plantCountry: 'Estados Unidos',
      manufacturer: 'AMERICAN HONDA MOTOR CO., INC.',
    });
  });

  it('fabricante no registrado en EE. UU. (código 7), caracteres inválidos (400) o sin marca: null', () => {
    expect(toData({ ErrorCode: '7' })).toBeNull();
    expect(toData({ ...honda, ErrorCode: '1,5,14,400' })).toBeNull();
    expect(toData({ ...honda, Make: '' })).toBeNull();
  });

  it('VIN_DECODER_EXTERNAL=false la apaga; por defecto está encendida', () => {
    expect(externalDecoderEnabled({ VIN_DECODER_EXTERNAL: 'false' })).toBe(false);
    expect(externalDecoderEnabled({})).toBe(true);
  });
});

describe('VinService', () => {
  const record = { ...VIN_RECORDS[4]!, createdAt: NOW } as VinRecord;
  const repo = { findOneBy: vi.fn(async ({ vin }: { vin: string }) => (vin === record.vin ? record : null)) };
  const external: ExternalVinData = {
    source: 'NHTSA vPIC', make: 'Honda', model: 'Accord', year: 2003, trim: 'EX-V6', bodyClass: 'Coupe', doors: 2,
    engine: '3.0 L, 6 cilindros', fuel: 'Gasolina', transmission: 'Automática', plantCountry: 'United States (Usa)', manufacturer: 'AMERICAN HONDA MOTOR CO., INC.',
  };
  const decoder = { decode: vi.fn(async (vin: string) => (vin === '1HGCM82633A004352' ? external : null)) };
  const service = new VinService(repo as unknown as Repository<VinRecord>, decoder as unknown as ExternalVinDecoder);

  it('con el VIN registrado devuelve los datos de fábrica, qué significa el código y nada del propietario', async () => {
    const info = await service.lookup('9fbhjd204lm500005', NOW);
    expect(info).toMatchObject({
      vin: '9FBHJD204LM500005', registered: true, source: 'registro', brand: 'Renault', model: 'Duster', year: 2020, version: 'Intens 1.3 Turbo',
      bodyType: 'SUV', doors: 5, engine: '1.3 L turbo', fuel: 'Gasolina', transmission: 'Automática CVT', external: null,
    });
    expect(info.structure).toMatchObject({ country: 'Colombia', year: 2020, checkDigitValid: true });
    expect(JSON.stringify(info)).not.toMatch(/39765432|Marta|3009998877/);
  });

  it('sin registro pero conocido por la NHTSA: la ficha completa', async () => {
    const info = await service.lookup('1HGCM82633A004352', NOW);
    expect(info).toMatchObject({ registered: false, source: 'nhtsa', brand: 'Honda', model: 'Accord', year: 2003, version: 'EX-V6', engine: '3.0 L, 6 cilindros', external });
    expect(info.structure.checkDigitValid).toBe(true);
  });

  it('sin registro ni NHTSA devuelve lo que dice la estructura (marca y año) y el resto en null', async () => {
    const info = await service.lookup('3MZBP2SM1SM699999', NOW);
    expect(info).toMatchObject({ registered: false, source: 'estructura', brand: 'Mazda', model: null, version: null, engine: null, external: null });
    expect(info.year).toBe(2025);
  });

  it('un VIN mal formado responde 400 sin repetir lo que se envió ni consultar afuera', async () => {
    decoder.decode.mockClear();
    const attempt = service.lookup('<script>alert(1)</script>');
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.lookup('<script>alert(1)</script>')).rejects.toThrow(INVALID_VIN_MESSAGE);
    expect(decoder.decode).not.toHaveBeenCalled();
  });
});
