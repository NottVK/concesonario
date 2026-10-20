import { buildEmbeddingText, embeddingHash } from './embedding-text.js';
import type { EmbeddableVehicle } from './embedding-text.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';
import { createEmbeddingProvider } from './embedding-factory.js';
import { embeddedTextChanged } from '../vehiculos/vehiculos.service.js';
import type { Vehicle } from '../vehiculos/entities/vehicle.entity.js';

const base: EmbeddableVehicle = {
  brandName: 'Mazda', model: 'CX-5', version: 'Grand Touring', year: 2024, fuel: 'gasolina', transmission: 'automatica',
  status: 'nuevo', color: 'Rojo', description: 'Camioneta familiar de cinco puestos.',
};

describe('buildEmbeddingText', () => {
  it('incluye marca, modelo, versión, año, combustible, transmisión, estado, color y descripción', () => {
    const text = buildEmbeddingText(base);
    for (const part of ['Mazda CX-5 Grand Touring', '2024', 'gasolina', 'automática', 'nuevo', 'Rojo', 'Camioneta familiar']) {
      expect(text).toContain(part);
    }
  });

  it('NUNCA lleva precio ni kilometraje, ni aunque estén escritos en la descripción', () => {
    const text = buildEmbeddingText({
      ...base,
      description: 'Oferta: $95.900.000, solo 45.000 km, 120.000 kilómetros, 95 millones, 5000 pesos, COP 95000000. Único dueño.',
    });
    expect(text).not.toMatch(/\$|95\.900|45\.000|120\.000|millones|pesos|COP|\bkm\b/i);
    expect(text).toContain('Único dueño');
  });

  it('la descripción se sanea (sin invisibles) y se trunca a 800', () => {
    const text = buildEmbeddingText({ ...base, description: `hola​ mundo ${'x'.repeat(2000)}` });
    expect(text).not.toContain('​');
    expect(text.length).toBeLessThan(1000);
  });

  it('el hash cambia si cambia el texto o el modelo', () => {
    const a = embeddingHash('texto', 'nomic-embed-text');
    expect(a).toHaveLength(64);
    expect(embeddingHash('texto', 'nomic-embed-text')).toBe(a);
    expect(embeddingHash('otro', 'nomic-embed-text')).not.toBe(a);
    expect(embeddingHash('texto', 'otro-modelo')).not.toBe(a);
  });
});

describe('embeddedTextChanged', () => {
  const current = { brandId: 1, model: 'CX-5', version: 'GT', year: 2024, fuel: 'gasolina', transmission: 'automatica', color: 'Rojo', status: 'nuevo', description: null } as unknown as Vehicle;
  const same = { brandId: 1, model: 'CX-5', version: 'GT', year: 2024, fuel: 'gasolina', transmission: 'automatica', color: 'Rojo', status: 'nuevo', price: '1', mileage: 0, revision: 1 } as never;

  it('precio y kilometraje no cuentan', () => {
    expect(embeddedTextChanged(current, { ...(same as object), price: '999', mileage: 5000 } as never)).toBe(false);
  });

  it.each([['brandId', 2], ['model', 'CX-30'], ['version', 'X'], ['year', 2025], ['fuel', 'diesel'], ['transmission', 'manual'], ['color', 'Azul'], ['status', 'usado'], ['description', 'nueva']])(
    'cambiar %s anula el vector',
    (field, value) => {
      expect(embeddedTextChanged(current, { ...(same as object), [field]: value } as never)).toBe(true);
    },
  );
});

describe('MockEmbeddingProvider y fábrica', () => {
  it('textos con palabras en común se parecen más que textos sin ellas', async () => {
    const provider = new MockEmbeddingProvider();
    const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
    const query = await provider.embed('camioneta familiar', 'query');
    const near = await provider.embed('camioneta familiar de siete puestos', 'document');
    const far = await provider.embed('deportivo biplaza', 'document');
    expect(query).toHaveLength(768);
    expect(dot(query, near)).toBeGreaterThan(dot(query, far));
  });

  it('la fábrica usa OLLAMA_HOST/OLLAMA_EMBED_MODEL y valida', () => {
    expect(createEmbeddingProvider({ OLLAMA_HOST: 'http://192.168.1.5:11434' }).model).toBe('nomic-embed-text+sinprefijo');
    expect(createEmbeddingProvider({ OLLAMA_EMBED_PREFIXES: 'true' }).model).toBe('nomic-embed-text');
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'mock' }).model).toBe('mock-embed');
    expect(() => createEmbeddingProvider({ EMBEDDING_PROVIDER: 'otro' })).toThrow(/EMBEDDING_PROVIDER/);
    expect(() => createEmbeddingProvider({ OLLAMA_HOST: 'ftp://x' })).toThrow(/OLLAMA_HOST/);
    expect(() => createEmbeddingProvider({ OLLAMA_EMBED_MODEL: 'a b' })).toThrow(/OLLAMA_EMBED_MODEL/);
  });
});
