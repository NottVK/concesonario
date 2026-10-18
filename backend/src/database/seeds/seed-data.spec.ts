import { BRANDS, VEHICLES } from './seed-data.js';
import { describeVehicle, slugify } from './seed.service.js';

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
});
