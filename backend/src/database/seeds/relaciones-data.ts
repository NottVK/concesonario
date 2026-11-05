import type { WarrantyPlan } from '../../relaciones/entities/relationship.entity.js';

/**
 * Relaciones de prueba del taller (Excel «Datos de prueba» del 29/10/2026 y tabla que envió el taller el
 * 31/10/2026). Datos ficticios de práctica: cédula, cliente, teléfono, placa y VIN son los que reconoce el taller;
 * km, fecha de venta y plan salen del Excel. El seed los cifra antes de guardarlos (decisión 130).
 */
export interface RelationRow {
  id: string;
  cedula: string;
  nombre: string;
  telefono: string;
  vin: string;
  plate: string;
  mileage: number;
  saleDate: string;
  plan: WarrantyPlan;
}

export const RELATION_RECORDS: readonly RelationRow[] = [
  { id: 'REL-1001', cedula: '1020304050', nombre: 'Laura Mejía', telefono: '3015556677', vin: '9FBHJD204PM100001', plate: 'LMX201', mileage: 18200, saleDate: '2025-03-14', plan: 'todo' },
  { id: 'REL-1002', cedula: '80123456', nombre: 'Carlos Rojas', telefono: '3104445566', vin: '3MZBP2SM1RM200002', plate: 'CRB552', mileage: 31500, saleDate: '2024-08-02', plan: 'todo' },
  { id: 'REL-1003', cedula: '52987654', nombre: 'Diana Cárdenas', telefono: '3201112233', vin: '9BWAG45U0NT300003', plate: 'DCK834', mileage: 42000, saleDate: '2023-11-20', plan: 'tren_motriz' },
  { id: 'REL-1004', cedula: '1015432198', nombre: 'Andrés Pardo', telefono: '3157778899', vin: 'KMHCT41DBMU400004', plate: 'APQ119', mileage: 75400, saleDate: '2022-05-09', plan: 'todo' },
  { id: 'REL-1005', cedula: '39765432', nombre: 'Marta Gil', telefono: '3009998877', vin: '9FBHJD204LM500005', plate: 'MGL630', mileage: 98000, saleDate: '2020-02-17', plan: 'todo' },
  { id: 'REL-1006', cedula: '1032456789', nombre: 'Julián Ortiz', telefono: '3186665544', vin: '3MZBP2SM1SM600006', plate: 'JOT741', mileage: 6100, saleDate: '2026-01-25', plan: 'todo' },
  { id: 'REL-1007', cedula: '79456123', nombre: 'Ricardo Peña', telefono: '3113332211', vin: '9BWAG45U0PT700007', plate: 'RPN908', mileage: 22800, saleDate: '2024-10-30', plan: 'tren_motriz' },
  { id: 'REL-1008', cedula: '1098765432', nombre: 'Sofía Vargas', telefono: '3054443322', vin: 'KMHCT41DBRU800008', plate: 'SVG275', mileage: 12900, saleDate: '2025-07-01', plan: 'todo' },
];
