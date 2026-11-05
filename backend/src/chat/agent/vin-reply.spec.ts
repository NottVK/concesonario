import type { ReadOnlyApi } from '../api/public-api.client.js';
import { codeMeaning, describeVin, findVin, mentionsInvalidVin, VIN_INVALID_REPLY, VIN_UNAVAILABLE_REPLY, vinReply } from './vin-reply.js';
import type { ApiVinInfo } from './vin-reply.js';

const duster: ApiVinInfo = {
  vin: '9FBHJD204LM500005', registered: true, brand: 'Renault', model: 'Duster', year: 2020, version: 'Intens 1.3 Turbo',
  bodyType: 'SUV', doors: 5, engine: '1.3 L turbo', fuel: 'Gasolina', transmission: 'Automática CVT',
};

describe('VIN en el mensaje del chat', () => {
  it('encuentra el VIN aunque venga en minúsculas o dentro de una frase', () => {
    expect(findVin('9FBHJD204LM500005')).toBe('9FBHJD204LM500005');
    expect(findVin('hola, mi vin es 9fbhjd204lm500005, ¿qué carro es?')).toBe('9FBHJD204LM500005');
  });

  it('no confunde una palabra larga ni acepta I, O o Q', () => {
    expect(findVin('RESPONSABILIDADES')).toBeNull();
    expect(findVin('9FBHJD2O4LM500005')).toBeNull();
    expect(findVin('9FBHJD204LM5000051')).toBeNull();
  });

  it('avisa si dice VIN pero el código no tiene el formato; sin código va al modelo', () => {
    expect(mentionsInvalidVin('mi VIN es 9FBHJD204LM50000')).toBe(true);
    expect(mentionsInvalidVin('¿qué es el VIN de un carro?')).toBe(false);
    expect(mentionsInvalidVin('quiero un Mazda 3 2024')).toBe(false);
  });
});

describe('Respuesta con los datos del VIN', () => {
  it('registrado: todos los datos en líneas de texto', () => {
    const text = describeVin(duster);
    expect(text).toContain('Estos son los datos del VIN 9FBHJD204LM500005:');
    expect(text).toContain('• Marca: Renault');
    expect(text).toContain('• Modelo: Duster');
    expect(text).toContain('• Año: 2020');
    expect(text).toContain('• Carrocería: SUV de 5 puertas');
    expect(text).toContain('• Motor: 1.3 L turbo, Gasolina');
    expect(text).toContain('• Transmisión: Automática CVT');
  });

  it('sin registro: dice que no está y solo lo que sale de la estructura', () => {
    const blank = { ...duster, registered: false, model: null, version: null, bodyType: null, doors: null, engine: null, fuel: null, transmission: null };
    expect(describeVin(blank)).toMatch(/no está en nuestro registro\. Por su estructura es un Renault modelo 2020/);
    expect(describeVin({ ...blank, brand: null })).toMatch(/No reconozco su fabricante \(9FB\) y, según la posición 10, es modelo 2020/);
  });

  it('explica qué significa el código: origen, año, serie y dígito verificador', () => {
    const structure = { wmi: '9FB', manufacturer: 'Renault', region: 'Suramérica', country: 'Colombia', vds: 'HJD20', checkDigitValid: true, yearCode: 'L', year: 2020, plantCode: 'M', serial: '500005' };
    const text = describeVin({ ...duster, source: 'registro', structure });
    expect(text).toContain('las posiciones 1 a 3 (9FB) indican que se fabricó en Colombia (Suramérica), fabricante Renault.');
    expect(text).toContain('La posición 10 (L) indica que es modelo 2020.');
    expect(text).toContain('las últimas seis (500005) son el número de serie');
    expect(text).toContain('El dígito verificador (posición 9) es correcto.');
    expect(codeMeaning({ ...structure, checkDigitValid: false })).toMatch(/no cuadra, algo común en vehículos fabricados fuera de Norteamérica/);
    expect(codeMeaning({ ...structure, region: 'Norteamérica', country: 'Estados Unidos', checkDigitValid: false })).toMatch(/revisa que el VIN esté bien escrito/);
  });

  it('sin registro pero en la NHTSA: lo dice y muestra su ficha', () => {
    const honda: ApiVinInfo = {
      vin: '1HGCM82633A004352', registered: false, source: 'nhtsa', brand: 'Honda', model: 'Accord', year: 2003, version: 'EX-V6',
      bodyType: 'Coupe', doors: 2, engine: '3.0 L, 6 cilindros', fuel: 'Gasolina', transmission: 'Automática', external: { plantCountry: 'United States (Usa)' },
    };
    const text = describeVin(honda);
    expect(text).toMatch(/^El VIN 1HGCM82633A004352 no está en nuestro registro, pero en la base pública de la NHTSA \(EE\. UU\.\) aparece así:/);
    expect(text).toContain('• Modelo: Accord');
    expect(text).toContain('• Planta: United States (Usa)');
  });

  it('consulta GET /vin/:vin y traduce los errores a mensajes fijos', async () => {
    const api = (status: number, data: unknown = {}): ReadOnlyApi & { get: ReturnType<typeof vi.fn> } => ({
      get: vi.fn().mockResolvedValue({ status, data }),
      post: vi.fn(),
    });
    const ok = api(200, duster);
    expect(await vinReply(ok, duster.vin)).toContain('Renault');
    expect(ok.get).toHaveBeenCalledWith('/vin/9FBHJD204LM500005');
    expect(await vinReply(api(400), duster.vin)).toBe(VIN_INVALID_REPLY);
    expect(await vinReply(api(503), duster.vin)).toBe(VIN_UNAVAILABLE_REPLY);
  });
});
