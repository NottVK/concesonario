import type { ChatReplyDto } from '../chat/dto/chat.dto.js';
import { TELEGRAM_MAX_TEXT } from './telegram.config.js';

export const WELCOME_TEXT = '¡Hola! Soy el asistente de AutoMax. Pregúntame por vehículos, precios, financiación o citas de test-drive.';
export const UNSUPPORTED_TEXT = 'Por ahora solo entiendo mensajes de texto.';
export const BUSY_TEXT = 'Estoy muy ocupado en este momento. Intenta de nuevo en un momento.';
export const ERROR_TEXT = 'No pude responder ahora mismo. Intenta de nuevo más tarde.';
export const PROPOSAL_TEXT = 'Para confirmar la cita necesito tus datos de contacto: termina el agendamiento en la página web de AutoMax.';

/** Convierte la respuesta del chat en texto plano (sin parse_mode, así nada se interpreta como HTML o Markdown). */
export function formatReply(reply: ChatReplyDto): string {
  const parts = [reply.reply];
  for (const card of reply.cards) {
    parts.push(`• ${card.title} (${card.year}) · ${card.priceText} · ${card.fuel} · ${card.transmission} · ${card.mileage.toLocaleString('es-CO')} km`);
  }
  if (reply.proposal) parts.push(`${reply.proposal.summary}\n${PROPOSAL_TEXT}`);
  if (reply.thirdParty) parts.push(`Respuesta de otro bot (${reply.thirdParty.botName}, tercero no verificado):\n${reply.thirdParty.text}`);
  return parts.join('\n\n').slice(0, TELEGRAM_MAX_TEXT);
}
