import { BRANDS, VEHICLES } from './seed-data.js';
import { MODEL_PROFILES } from './seed-profiles.js';
import { describeVehicle, interleavedVehicleSeeds, slugify } from './seed.service.js';

const EXPECTED_BRANDS = [
  'Toyota', 'Chevrolet', 'Mazda', 'Renault', 'Kia',
  'Hyundai', 'Ford', 'Nissan', 'Volkswagen', 'BMW',
];

describe('datos semilla', () => {
  it('incluye las 10 marcas pedidas', () => {
    expect(BRANDS.map((b) => b.name).sort()).toEqual([...EXPECTED_BRANDS].sort());
  });

  it('tiene al menos 5 modelos por marca y 50 vehículos en total', () => {
    for (const brand of EXPECTED_BRANDS) {
      expect(VEHICLES[brand]?.length ?? 0).toBeGreaterThanOrEqual(5);
    }
    const total = Object.values(VEHICLES).reduce((sum, rows) => sum + rows.length, 0);
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it('no repite marca + modelo + año + versión', () => {
    const keys = Object.entries(VEHICLES).flatMap(([brand, rows]) =>
      rows.map(([model, version, year]) => `${brand}|${model}|${year}|${version}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('los nuevos tienen 0 km y los usados más de 0', () => {
    for (const rows of Object.values(VEHICLES)) {
      for (const [, , , price, km, , , , status] of rows) {
        expect(price).toBeGreaterThan(0);
        expect(status === 'nuevo' ? km === 0 : km > 0).toBe(true);
      }
    }
  });
});

describe('helpers del seed', () => {
  it('slugify quita tildes y espacios', () => {
    expect(slugify('Land Cruiser Prado')).toBe('land-cruiser-prado');
    expect(slugify('Mazda 3')).toBe('mazda-3');
  });

  it('describeVehicle genera una descripción en español', () => {
    const [row] = VEHICLES.Toyota;
    expect(describeVehicle('Toyota', row)).toContain('Toyota Corolla Cross');
  });

  it('todo modelo del seed tiene su perfil (tipo de carrocería y uso) y todo perfil corresponde a un modelo', () => {
    const models = Object.values(VEHICLES).flatMap((rows) => rows.map((row) => row[0]));
    expect(models.filter((model) => !MODEL_PROFILES[model])).toEqual([]);
    expect(Object.keys(MODEL_PROFILES).filter((model) => !models.includes(model))).toEqual([]);
  });

  it('las descripciones del seed no contienen órdenes ni precios, y caben en 300 caracteres', () => {
    for (const [brand, rows] of Object.entries(VEHICLES)) {
      for (const row of rows) {
        const text = describeVehicle(brand, row);
        expect(text.length, text).toBeLessThanOrEqual(300);
        expect(text).not.toMatch(/\$|pesos|ignora|instrucci/i);
      }
    }
  });
});

describe('orden de inserción intercalado', () => {
  const ordered = interleavedVehicleSeeds();
  const total = Object.values(VEHICLES).reduce((sum, rows) => sum + rows.length, 0);

  it('inserta todos los vehículos, sin perder ni repetir ninguno', () => {
    expect(ordered).toHaveLength(total);
    const keys = ordered.map(({ brandName, row }) => `${brandName}|${row[0]}|${row[2]}|${row[1]}`);
    expect(new Set(keys).size).toBe(total);
  });

  it('la primera ronda trae un vehículo de cada marca, en el orden de BRANDS', () => {
    expect(ordered.slice(0, BRANDS.length).map((item) => item.brandName)).toEqual(BRANDS.map((b) => b.name));
  });

  it('los 7 últimos (los "más recientes" de la Home) son de 7 marcas distintas', () => {
    const lastSeven = ordered.slice(-7).map((item) => item.brandName);
    expect(new Set(lastSeven).size).toBe(7);
  });

  it('conserva el orden relativo de cada marca', () => {
    for (const { name } of BRANDS) {
      const models = ordered.filter((item) => item.brandName === name).map((item) => item.row[0]);
      expect(models).toEqual(VEHICLES[name].map((row) => row[0]));
    }
  });
});

