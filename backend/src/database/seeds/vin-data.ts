/**
 * VIN de prueba del taller, REL-1001 a REL-1008 (Excel del 29/10/2026 y tabla completa que envió el taller el
 * 31/10/2026; todos a gasolina). Datos ficticios de práctica (decisión 129).
 */
export interface VinRow {
  vin: string;
  brand: string;
  model: string;
  year: number;
  version: string;
  bodyType: string;
  doors: number;
  engine: string;
  fuel: string;
  transmission: string;
}

export const VIN_RECORDS: readonly VinRow[] = [
  { vin: '9FBHJD204PM100001', brand: 'Renault', model: 'Duster', year: 2023, version: 'Intens 1.3 Turbo', bodyType: 'SUV', doors: 5, engine: '1.3 L turbo', fuel: 'Gasolina', transmission: 'Automática CVT' },
  { vin: '3MZBP2SM1RM200002', brand: 'Mazda', model: 'Mazda 3', year: 2024, version: 'Touring Sedán', bodyType: 'Sedán', doors: 4, engine: '2.0 L Skyactiv-G', fuel: 'Gasolina', transmission: 'Automática de 6 velocidades' },
  { vin: '9BWAG45U0NT300003', brand: 'Volkswagen', model: 'Gol', year: 2022, version: 'Trendline', bodyType: 'Hatchback', doors: 5, engine: '1.6 L MSI', fuel: 'Gasolina', transmission: 'Manual de 5 velocidades' },
  { vin: 'KMHCT41DBMU400004', brand: 'Hyundai', model: 'Accent', year: 2021, version: 'GL Coupé', bodyType: 'Coupé', doors: 2, engine: '1.6 L', fuel: 'Gasolina', transmission: 'Manual de 6 velocidades' },
  { vin: '9FBHJD204LM500005', brand: 'Renault', model: 'Duster', year: 2020, version: 'Intens 1.3 Turbo', bodyType: 'SUV', doors: 5, engine: '1.3 L turbo', fuel: 'Gasolina', transmission: 'Automática CVT' },
  { vin: '3MZBP2SM1SM600006', brand: 'Mazda', model: 'Mazda 3', year: 2025, version: 'Touring Sedán', bodyType: 'Sedán', doors: 4, engine: '2.0 L Skyactiv-G', fuel: 'Gasolina', transmission: 'Automática de 6 velocidades' },
  { vin: '9BWAG45U0PT700007', brand: 'Volkswagen', model: 'Gol', year: 2023, version: 'Trendline', bodyType: 'Hatchback', doors: 5, engine: '1.6 L MSI', fuel: 'Gasolina', transmission: 'Manual de 5 velocidades' },
  { vin: 'KMHCT41DBRU800008', brand: 'Hyundai', model: 'Accent', year: 2024, version: 'GL Coupé', bodyType: 'Coupé', doors: 2, engine: '1.6 L', fuel: 'Gasolina', transmission: 'Manual de 6 velocidades' },
];
