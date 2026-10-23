/**
 * Respuestas inmediatas para saludos, agradecimientos y despedidas (decisión 125). No llaman al modelo ni a
 * ninguna tool: con gpt-oss:20b un «hola» tardaba varios segundos y a veces terminaba buscando vehículos.
 * Solo se usan si el mensaje COMPLETO es una de estas fórmulas; cualquier pregunta real sigue al modelo.
 */

export const GREETING_REPLY =
  '¡Hola! Soy el asistente de AutoMax. ¿En qué te puedo colaborar? Puedo buscarte carros por marca o presupuesto, compararlos, simular un crédito o prepararte un test-drive.';
export const THANKS_REPLY = '¡Con mucho gusto! ¿Te ayudo con algo más?';
export const GOODBYE_REPLY = '¡Gracias por escribirnos! Cuando quieras, aquí estoy para ayudarte a encontrar tu próximo carro.';

const MAX_QUICK_CHARS = 60;

const GREETING = /^(hola+|holi+s?|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|ey|saludos|que mas|quiubo|hello|hi)( (hola|buenas|como (estas|esta|va|vas)|que tal|que mas|bot|asistente|automax|amigo|parce))*$/;
const THANKS = /^((muchas|mil|ok|vale|listo|bueno) )?(gracias|grax|thanks)( (muchas|mil|por todo|por la ayuda))?$/;
const GOODBYE = /^(chao+|chau|adios|bye|hasta luego|hasta pronto|nos vemos)( (gracias|muchas gracias))?$/;

/** Minúsculas, sin tildes, sin signos ni emojis y con un solo espacio entre palabras. */
export function normalizeQuick(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Respuesta fija si el mensaje es solo un saludo, un agradecimiento o una despedida; si no, null. */
export function quickReply(message: string): string | null {
  if (message.length > MAX_QUICK_CHARS) return null;
  const text = normalizeQuick(message);
  if (!text) return null;
  if (GREETING.test(text)) return GREETING_REPLY;
  if (THANKS.test(text)) return THANKS_REPLY;
  if (GOODBYE.test(text)) return GOODBYE_REPLY;
  return null;
}
