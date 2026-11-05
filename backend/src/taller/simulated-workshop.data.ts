/** Sedes y servicios del taller simulado: los mismos de la hoja «Catálogos» del Excel del taller. */
export interface SimSite {
  id: number;
  codigo: string;
  nombre: string;
  especialidades: string[];
  dias: number[];
  apertura: number;
  cierre: number;
  direccion: string;
}

export const SIM_SITES: readonly SimSite[] = [
  { id: 1, codigo: 'PL-CENTRO', nombre: 'Pulgas Locas Centro', especialidades: ['mantenimiento_general'], dias: [1, 2, 3, 4, 5, 6], apertura: 8, cierre: 17, direccion: 'Calle 13 # 24-50, Paloquemao' },
  { id: 2, codigo: 'PL-FRENOS', nombre: 'Pulgas Locas Frenos y Suspensión', especialidades: ['frenos', 'suspension'], dias: [1, 2, 3, 4, 5], apertura: 7, cierre: 16, direccion: 'Avenida Boyacá # 64-20, Normandía' },
  { id: 3, codigo: 'PL-MOTOR', nombre: 'Pulgas Locas Motor y Eléctrico', especialidades: ['motor', 'electrico', 'transmision'], dias: [1, 2, 3, 4, 5, 6], apertura: 8, cierre: 17, direccion: 'Autopista Sur # 68-15, Venecia' },
];

/** Manipulaciones previas del taller simulado (decisión 135): los frenos del Hyundai Accent 2024 (REL-1008), en otro taller. */
export const SIM_TAMPERING: readonly { vin: string; especialidad: string; fecha: string; tipo: string; sku?: string }[] = [
  { vin: 'KMHCT41DBRU800008', especialidad: 'frenos', fecha: '2026-06-10', tipo: 'otro_taller', sku: 'FRE-PASTILLAS' },
];

export const SIM_SERVICES: Record<string, { nombre: string; precio: number }> = {
  'MANT-10K': { nombre: 'Mantenimiento preventivo 10.000 km', precio: 120_000 },
  'MANT-ACEITE': { nombre: 'Cambio de aceite y filtro', precio: 45_000 },
  'REV-GENERAL': { nombre: 'Revisión general', precio: 60_000 },
  'FRE-DISCOS': { nombre: 'Rectificación o cambio de discos', precio: 140_000 },
  'FRE-LIQUIDO': { nombre: 'Purga y cambio de líquido de frenos', precio: 60_000 },
  'FRE-PASTILLAS': { nombre: 'Cambio de pastillas de freno', precio: 80_000 },
  'SUS-ALINEA': { nombre: 'Alineación y balanceo', precio: 70_000 },
  'SUS-AMORT': { nombre: 'Cambio de amortiguadores', precio: 150_000 },
  'MOT-BUJIAS': { nombre: 'Cambio de bujías y bobinas', precio: 110_000 },
  'MOT-DIAG': { nombre: 'Diagnóstico computarizado de motor', precio: 90_000 },
  'ELE-ALTERN': { nombre: 'Revisión y cambio de alternador', precio: 160_000 },
  'ELE-BATERIA': { nombre: 'Diagnóstico y cambio de batería', precio: 50_000 },
  'TRA-EMBRAGUE': { nombre: 'Cambio de kit de embrague', precio: 380_000 },
};

/** Reglas por palabras clave (como el "fuente: reglas" del taller), en orden: la primera que coincide gana. */
export const SIM_RULES: readonly { especialidad: string; pattern: RegExp; base: string; extra?: [RegExp, string][] }[] = [
  { especialidad: 'frenos', pattern: /fren|pastilla|chill|disco|pedal/, base: 'FRE-PASTILLAS', extra: [[/disco/, 'FRE-DISCOS'], [/liquido/, 'FRE-LIQUIDO']] },
  { especialidad: 'suspension', pattern: /suspensi|amortigu|alinea|balance|vibra|timon|se va (hacia|para)|golpe|direccion/, base: 'SUS-ALINEA', extra: [[/amortigu|golpe/, 'SUS-AMORT']] },
  { especialidad: 'transmision', pattern: /embrague|clutch|cambios|caja|transmisi/, base: 'TRA-EMBRAGUE' },
  { especialidad: 'electrico', pattern: /bateria|alternador|no (prende|enciende|arranca)|luces|electric/, base: 'ELE-BATERIA', extra: [[/alternador|no carga/, 'ELE-ALTERN']] },
  { especialidad: 'motor', pattern: /motor|bujia|humo|temperatura|calienta|tironea|testigo|check|pierde fuerza|acelera/, base: 'MOT-DIAG', extra: [[/bujia|tironea/, 'MOT-BUJIAS']] },
  { especialidad: 'mantenimiento_general', pattern: /mantenimiento|aceite|10\.?000|kilometraje/, base: 'MANT-10K', extra: [[/aceite/, 'MANT-ACEITE']] },
];
