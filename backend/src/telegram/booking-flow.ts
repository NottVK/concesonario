import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CustomerDto } from '../clientes/dto/customer.dto.js';
import { sanitizeText } from '../common/text.js';
import { BUTTON_CANCEL, BUTTON_CONFIRM, keyboard } from './telegram-format.js';
import type { OutgoingMessage } from './telegram-format.js';

/**
 * Cita que se está agendando desde Telegram. La lleva el código, no el modelo: el nombre y el correo viven solo
 * en memoria hasta confirmar, van directo a `POST /citas` y nunca entran al modelo ni al historial del chat.
 */
export interface Booking {
  proposalId: string;
  step: 'name' | 'email' | 'confirm';
  name?: string;
  email?: string;
}

export interface BookingStep {
  booking: Booking;
  message: OutgoingMessage;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASK_NAME = '¿A nombre de quién agendo la cita? Escribe tu nombre completo. (Con /cancelar no se agenda nada.)';
const ASK_EMAIL = 'Gracias. ¿Cuál es tu correo? El asesor lo usa para contactarte.';
const BAD_NAME = 'El nombre debe tener entre 2 y 120 caracteres. Escríbelo de nuevo.';
const BAD_EMAIL = 'Ese correo no parece válido. Escríbelo de nuevo (por ejemplo: ana@correo.co).';
const USE_BUTTONS = 'Usa los botones Confirmar o Cancelar del mensaje anterior, o escribe /cancelar.';

/** Empieza a pedir los datos; null si el id no es un uuid (los datos de un botón vienen de afuera). */
export function startBooking(proposalId: string): BookingStep | null {
  if (!UUID.test(proposalId)) return null;
  return { booking: { proposalId, step: 'name' }, message: { text: ASK_NAME } };
}

/** Avanza un paso con lo que escribió la persona; valida con las mismas reglas que `POST /citas`. */
export function nextBookingStep(booking: Booking, input: string): BookingStep {
  const text = sanitizeText(input, 200);
  if (booking.step === 'name') {
    const name = validField('name', { name: text });
    return name ? { booking: { ...booking, step: 'email', name }, message: { text: ASK_EMAIL } } : { booking, message: { text: BAD_NAME } };
  }
  if (booking.step === 'email') {
    const email = validField('email', { name: booking.name, email: text })?.toLowerCase();
    return email ? { booking: { ...booking, step: 'confirm', email }, message: review(booking.name ?? '', email) } : { booking, message: { text: BAD_EMAIL } };
  }
  return { booking, message: { text: USE_BUTTONS } };
}

/** Datos listos para confirmar, o null si todavía falta alguno. */
export function readyCustomer(booking: Booking | null): { proposalId: string; name: string; email: string } | null {
  if (!booking || booking.step !== 'confirm' || !booking.name || !booking.email) return null;
  return { proposalId: booking.proposalId, name: booking.name, email: booking.email };
}

function review(name: string, email: string): OutgoingMessage {
  return {
    text: `Revisa tus datos:\nNombre: ${name}\nCorreo: ${email}\n\n¿Confirmo la cita?`,
    keyboard: keyboard([
      ['Confirmar', BUTTON_CONFIRM],
      ['Cancelar', BUTTON_CANCEL],
    ]),
  };
}

/** El valor ya recortado si ese campo cumple las reglas de `CustomerDto`; null si no. */
function validField(field: 'name' | 'email', values: Record<string, unknown>): string | null {
  const customer = plainToInstance(CustomerDto, values);
  const errors = validateSync(customer).filter((error) => error.property === field);
  const value = customer[field];
  return errors.length === 0 && typeof value === 'string' ? value : null;
}
