import { CHAT_MESSAGE_MAX_CHARS } from '../chat/chat.config.js';
import type { ChatReplyDto, ProposalViewDto, VehicleCardDto } from '../chat/dto/chat.dto.js';
import { truncate } from '../common/text.js';
import { TELEGRAM_MESSAGE_MAX_CHARS } from './telegram.config.js';
import type { InlineKeyboard } from './telegram.types.js';

/** Datos de los botones (máximo 64 bytes cada uno; el id de la propuesta es un uuid de 36). */
export const BUTTON_BOOK = 'cita:si:';
export const BUTTON_SKIP = 'cita:no:';
export const BUTTON_CONFIRM = 'datos:si';
export const BUTTON_CANCEL = 'datos:no';

export const TEXTS = {
  welcome:
    'Hola, soy el asistente de AutoMax. Te ayudo con los carros disponibles, precios, financiación y test-drives. ¿Qué estás buscando?\n\n' +
    'Comandos: /borrar borra esta conversación y /cancelar cancela una cita que estés agendando.',
  onlyText: 'Por ahora solo entiendo mensajes de texto. Escríbeme qué carro buscas.',
  tooLong: `Tu mensaje es muy largo. Escríbelo en menos de ${CHAT_MESSAGE_MAX_CHARS} caracteres.`,
  busy: 'Todavía estoy respondiendo tus mensajes anteriores. Espera un momento antes de escribir otro.',
  forgotten: 'Listo: borré esta conversación. Cuando quieras empezamos de nuevo.',
  skipped: 'Listo, no agendo nada. Si cambias de opinión, pídeme la cita otra vez.',
  cancelled: 'Listo, no agendé nada.',
  nothingToCancel: 'No hay ninguna cita en curso.',
  noPendingBooking: 'No hay ninguna cita pendiente de confirmar. Pídele al asistente una nueva.',
  expired: 'Esa propuesta ya venció o es de una conversación anterior. Pídele al asistente una nueva.',
  failed: 'Tuve un problema para responder. Intenta de nuevo en un momento.',
} as const;

export interface OutgoingMessage {
  text: string;
  keyboard?: InlineKeyboard;
}

const LABELS: Record<string, string> = {
  gasolina: 'Gasolina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  manual: 'Manual',
  automatica: 'Automática',
};

/**
 * Un turno del chat convertido en mensajes de Telegram, en TEXTO PLANO: la respuesta con las fichas, la
 * respuesta de otro bot (aparte y marcada como no verificada) y la propuesta de cita con sus botones.
 */
export function replyToMessages(reply: ChatReplyDto): OutgoingMessage[] {
  const cards = reply.cards.map(cardLine);
  const messages: OutgoingMessage[] = [{ text: fit([reply.reply, ...(cards.length ? ['', ...cards] : [])].join('\n')) }];
  if (reply.thirdParty) {
    messages.push({ text: fit(`Respuesta de ${reply.thirdParty.botName} (otro servicio, no verificado por AutoMax):\n${reply.thirdParty.text}`) });
  }
  if (reply.proposal) messages.push(proposalMessage(reply.proposal));
  return messages;
}

export function cardLine(card: VehicleCardDto): string {
  const km = `${new Intl.NumberFormat('es-CO').format(card.mileage)} km`;
  return `• ${card.title} ${card.year}: ${card.priceText} · ${km} · ${label(card.fuel)} · ${label(card.transmission)}`;
}

export function proposalMessage(proposal: ProposalViewDto): OutgoingMessage {
  return {
    text: `Propuesta de cita: ${proposal.summary}.\nLa cita solo queda registrada si la confirmas con tu nombre y correo. La propuesta vence en 10 minutos.`,
    keyboard: keyboard([
      ['Agendar', `${BUTTON_BOOK}${proposal.id}`],
      ['No, gracias', `${BUTTON_SKIP}${proposal.id}`],
    ]),
  };
}

export function keyboard(buttons: [text: string, data: string][]): InlineKeyboard {
  return { inline_keyboard: [buttons.map(([text, callback_data]) => ({ text, callback_data }))] };
}

function label(value: string): string {
  return LABELS[value] ?? value;
}

function fit(text: string): string {
  return truncate(text, TELEGRAM_MESSAGE_MAX_CHARS);
}
