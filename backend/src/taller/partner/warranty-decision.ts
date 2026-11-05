import { sanitizeText } from '../../common/text.js';
import type { WarrantyServiceInput } from '../../mcp/tools/partner.js';
import type { Warranty } from '../../relaciones/warranty.js';
import type { WarrantyLineResult } from '../entities/warranty-validation.entity.js';
import type { Tampering } from '../workshop.types.js';
import type { PartsCheck } from './parts-store.js';

/**
 * Cómo valida AutoMax la garantía de cada servicio del diagnóstico del taller (decisiones 134 y 135). Reglas fijas, sin
 * modelo, en este orden (la primera que falla deja la línea como NO válida):
 * 1. La garantía del vehículo está vigente (fecha de venta y kilometraje: `warrantyOf`).
 * 2. El plan cubre la especialidad del servicio (el mantenimiento general nunca la cubre).
 * 3. El componente NO fue manipulado antes (reparación, cambio de repuesto, manipulación del cliente u otro taller),
 *    según el bot del taller. Si el taller no responde, no se puede verificar y no hay garantía.
 * 4. Para ese VIN no se compró un repuesto del componente en la tienda. Si la tienda no está conectada, se omite y se
 *    anota; si está conectada y no responde, no hay garantía.
 * 5. El mecánico dictamina que aplica, y la causa la paga otro (fabricante, tienda o taller).
 * Cada motivo es un texto fijo de AutoMax: no repite lo que escribieron el mecánico, el taller ni la tienda.
 */
const COVERED_CAUSES: Record<string, string> = {
  defecto_fabrica: 'defecto de fábrica',
  repuesto_defectuoso: 'repuesto defectuoso',
  mala_instalacion_taller: 'mala instalación de un taller',
};

const UNCOVERED_CAUSES: Record<string, string> = {
  desgaste_normal: 'desgaste normal',
  manipulacion_cliente: 'manipulación del cliente',
};

const SPECIALTY_NAMES: Record<string, string> = {
  frenos: 'frenos', suspension: 'suspensión', motor: 'motor', electrico: 'sistema eléctrico', transmision: 'transmisión', mantenimiento_general: 'mantenimiento general',
};

const TAMPERING_KINDS: Record<string, string> = {
  reparacion: 'una reparación', cambio_repuesto: 'un cambio de repuesto', manipulacion_cliente: 'manipulación del cliente', otro_taller: 'un trabajo en otro taller',
};

export const STORE_PENDING_NOTE = ' (falta verificar con la tienda de repuestos: aún no está conectada)';

const specialtyName = (value: string): string => SPECIALTY_NAMES[value] ?? sanitizeText(value.replace(/_/g, ' '), 40);
const isoDate = (value: string | undefined): string | null => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

function line(service: WarrantyServiceInput, valida: boolean, motivo: string): WarrantyLineResult {
  return { tarea_id: service.tarea_id, valida, motivo };
}

/** Reglas 1 y 2: la línea NO válida si la garantía no está vigente o el plan no cubre el componente; null si pasa. */
export function eligibility(warranty: Warranty, service: WarrantyServiceInput): WarrantyLineResult | null {
  if (!warranty.vigente) return line(service, false, warranty.motivo ?? `La garantía venció el ${warranty.vence}`);
  const area = service.especialidad;
  if (area === 'mantenimiento_general') return line(service, false, 'El mantenimiento general no lo cubre la garantía');
  if (!warranty.cubre.includes(area)) return line(service, false, `El plan de garantía del vehículo no cubre ${specialtyName(area)}`);
  return null;
}

/** Regla 3 con la respuesta del taller (o `null` si no respondió): la línea NO válida, o null si no fue manipulado. */
export function tamperingVerdict(service: WarrantyServiceInput, tampering: Tampering | null): WarrantyLineResult | null {
  if (!tampering) return line(service, false, 'No se pudo verificar con el taller si el componente fue manipulado: vuelve a pedir la validación');
  if (!tampering.manipulado) return null;
  const event = tampering.eventos[0];
  const kind = event ? (TAMPERING_KINDS[event.tipo] ?? 'una intervención') : 'una intervención';
  const date = isoDate(event?.fecha);
  return line(service, false, `El componente de ${specialtyName(service.especialidad)} ya tuvo ${kind}${date ? ` el ${date}` : ''}: la garantía no lo cubre`);
}

/**
 * Regla 4 con la respuesta de la tienda (o `null` si está conectada y no respondió). Una compra hecha para la MISMA
 * orden que se valida no cuenta: es el repuesto de esta reparación. Las de mostrador y las de otras órdenes sí cuentan.
 */
export function storeVerdict(service: WarrantyServiceInput, check: PartsCheck | null, currentOrder?: string): WarrantyLineResult | null {
  if (!check) return line(service, false, 'No se pudo verificar con la tienda de repuestos si se compró un repuesto de ese componente: vuelve a pedir la validación');
  if (!check.conectada) return null;
  const counted = check.compras.filter((purchase) => !currentOrder || purchase.codigo_orden !== currentOrder);
  if (counted.length === 0) return null;
  const date = isoDate(counted[0]?.fecha);
  return line(service, false, `Se registró la compra de un repuesto de ${specialtyName(service.especialidad)} para este vehículo${date ? ` el ${date}` : ''}: la garantía no lo cubre`);
}

/** Regla 5: el dictamen del mecánico y la causa. */
export function verdict(warranty: Warranty, service: WarrantyServiceInput): WarrantyLineResult {
  const cause = service.causa ?? '';
  if (UNCOVERED_CAUSES[cause]) return line(service, false, `Según el diagnóstico es ${UNCOVERED_CAUSES[cause]}: la garantía no lo cubre`);
  if (!service.aplica) return line(service, false, 'El mecánico dictaminó que la garantía no aplica');
  if (!COVERED_CAUSES[cause]) return line(service, false, 'Falta una causa que cubra la garantía (defecto de fábrica, repuesto defectuoso o mala instalación)');
  return line(service, true, `Garantía vigente hasta ${warranty.vence}: cubre ${specialtyName(service.especialidad)} y la causa es ${COVERED_CAUSES[cause]}`);
}

/** Reglas 1, 2 y 5 (sin las verificaciones externas): para probar la regla sola. */
export function decideService(warranty: Warranty, service: WarrantyServiceInput): WarrantyLineResult {
  return eligibility(warranty, service) ?? verdict(warranty, service);
}

/** Si el VIN que manda el taller no es el de la relación, ninguna línea es válida. */
export function mismatch(services: WarrantyServiceInput[]): WarrantyLineResult[] {
  return services.map((service) => line(service, false, 'El VIN no corresponde a la relación registrada en el concesionario'));
}
