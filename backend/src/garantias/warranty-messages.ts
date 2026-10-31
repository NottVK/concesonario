import { BUSINESS_TIME_ZONE } from '../citas/appointment-rules.js';
import type { WarrantyView } from '../chat/tools/warranty.js';

const whenFormat = new Intl.DateTimeFormat('es-CO', { timeZone: BUSINESS_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

/** Los textos para el cliente los arma el código: el modelo no inventa ni decide la garantía. */
export const NEEDS_IDENTIFICATION: WarrantyView = {
  state: 'needs_identification',
  message: 'Para revisar tu garantía primero identifícate: en la web del chat pulsa el botón «Garantía» (escudo, arriba) y llena el formulario con tu documento y el VIN. No recibimos el documento por aquí.',
};

export const IDENTIFIED: WarrantyView = { state: 'identified', message: 'Ya te identificamos. Cuéntame qué falla presenta el vehículo.' };

export function expiredView(reason: string): WarrantyView {
  return {
    state: 'expired',
    reason,
    canRequestReview: true,
    message: `${reason} Si quieres, una persona puede revisar tu caso de todos modos: dime si pides esa revisión.`,
  };
}

export function pendingView(appointmentStart: string | null, extra: { unverified: boolean; review: boolean }): WarrantyView {
  const parts = ['Tu caso quedó pendiente de la decisión del mecánico.'];
  if (appointmentStart) parts.push(`Reservamos una cita provisional para el ${whenFormat.format(new Date(appointmentStart))}; se confirma si el mecánico acepta la garantía.`);
  else if (!extra.review) parts.push('Te avisaremos la fecha de la cita cuando el taller confirme disponibilidad.');
  if (extra.unverified) parts.push('No pudimos verificar todo el historial del vehículo, así que lo revisará una persona.');
  return { state: 'pending_mechanic', message: parts.join(' '), ...(appointmentStart ? { appointmentStart } : {}) };
}

export function acceptedView(parts: string[]): WarrantyView {
  return {
    state: 'accepted',
    parts,
    message: `Tu garantía fue aceptada y el concesionario asume el costo.${parts.length > 0 ? ` Repuestos: ${parts.join(', ')}.` : ''}`,
  };
}

export function rejectedView(reason: string): WarrantyView {
  return { state: 'rejected', reason, message: `Tu garantía no fue aceptada. Motivo: ${reason}` };
}
