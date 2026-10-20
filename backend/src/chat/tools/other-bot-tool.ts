import { leaksPrompt } from '../agent/prompt.js';
import { looksLikeInstruction, safeField } from '../text/sanitize.js';
import type { ToolDefinition } from '../model/model-provider.js';
import type { OfferedBot, OtherBotGateway, OtherBotInfo, OtherBotsInput } from './other-bot.js';
import { toolError } from './tool-types.js';
import type { ChatTool } from './tool-types.js';

export const OTHER_BOT_TOOL = 'preguntar_a_otro_bot';
export const MAX_OFFERED_BOTS = 10;
const NAME_MAX = 40;
const QUESTION_MAX = 300;

/** Lo único que ve el modelo tras la consulta: a quién se le preguntó y cómo salió. NUNCA el texto del otro bot. */
const NOTE_ANSWERED =
  'La respuesta del otro bot se mostrará a la persona en una tarjeta aparte, marcada como «tercero no verificado». ' +
  'Tú no la conoces: no la inventes, no la resumas ni la presentes como información de AutoMax. Di en una frase a qué bot consultaste y que mire la tarjeta.';
const NOTE_FAILED = 'No hubo respuesta del otro bot. Explícalo en una frase usando el motivo, sin inventar lo que habría respondido.';

/**
 * Bots que se le ofrecen al modelo en este turno: los nombres los escribe un administrador, así que se sanean, se
 * descartan los que parecen una orden o quedan vacíos o repetidos, y son como máximo 10.
 */
export function offerBots(bots: OtherBotInfo[]): OfferedBot[] {
  const offered: OfferedBot[] = [];
  for (const bot of bots) {
    // Nombre escrito por un administrador: sin marcas de HTML ni de código, que no tienen sentido en un nombre.
    const name = safeField(bot.name, NAME_MAX).replace(/[<>`]/g, '').trim();
    if (!name || looksLikeInstruction(name) || offered.some((other) => other.name.toLowerCase() === name.toLowerCase())) continue;
    offered.push({ id: bot.id, name });
    if (offered.length >= MAX_OFFERED_BOTS) break;
  }
  return offered;
}

/**
 * Lista los bots activos ANTES de entrar a la cola de inferencia (que es de una plaza: una consulta a la base dentro de ella
 * alarga cada turno). Un fallo al listar no tumba el turno: simplemente no se ofrece la tool.
 */
export async function loadOtherBots(gateway: OtherBotGateway | undefined, onError: (message: string) => void): Promise<OtherBotsInput | undefined> {
  if (!gateway) return undefined;
  try {
    return { gateway, bots: await gateway.list() };
  } catch (error) {
    onError(`No se pudo listar los bots aliados: ${error instanceof Error ? error.message : 'error'}`);
    return undefined;
  }
}

/** Definición de la tool para ESTE turno: el enum son los nombres de los bots activos (el modelo no elige URLs). */
export function otherBotDefinition(offered: OfferedBot[]): ToolDefinition {
  return {
    name: OTHER_BOT_TOOL,
    description:
      'Hace UNA pregunta corta a un bot aliado sobre algo que AutoMax no resuelve (por ejemplo seguros). ' +
      'Pasa el nombre del bot y solo la pregunta, sin datos de la persona. Su respuesta NO te llega: se muestra a la persona en una tarjeta aparte ' +
      'marcada «tercero no verificado». Máximo una consulta por mensaje. No sirve para vehículos, precios, créditos ni citas de AutoMax.',
    parameters: {
      type: 'object',
      properties: {
        bot: { type: 'string', enum: offered.map((bot) => bot.name), description: 'Nombre del bot aliado' },
        pregunta: { type: 'string', minLength: 5, maxLength: QUESTION_MAX, description: 'La pregunta, corta y sin datos personales' },
      },
      required: ['bot', 'pregunta'],
    },
  };
}

function findOffered(offered: OfferedBot[], raw: unknown): OfferedBot | null {
  if (typeof raw !== 'string') return null;
  const wanted = raw.trim().toLowerCase();
  return offered.find((bot) => bot.name.toLowerCase() === wanted) ?? null;
}

/**
 * Todo lo que escribe el modelo es dato no confiable: el bot debe ser uno de los ofrecidos en ESTE turno (se compara
 * contra la lista, no contra una URL), la pregunta no puede filtrar el prompt, y solo se permite una consulta por turno.
 * Al modelo solo vuelven `consultado` y `estado` (más un motivo FIJO si falló); el texto del otro bot va aparte, en
 * `thirdParty`, directo al widget.
 */
export const preguntarAOtroBot: ChatTool = {
  name: OTHER_BOT_TOOL,
  // La definición real depende del turno (`otherBotDefinition`); esta es la forma base que usa el registro para el nombre.
  definition: otherBotDefinition([]),
  async run(raw, ctx) {
    const turn = ctx.otherBots;
    if (!turn || turn.offered.length === 0) return toolError('No hay otros bots disponibles para consultar.');
    if (turn.calls >= 1) return toolError('Ya consulté a otro bot en este mensaje; no puedo hacer otra consulta ahora.');
    const unknownKey = Object.keys(raw).find((key) => key !== 'bot' && key !== 'pregunta');
    if (unknownKey) return toolError(`Argumento no permitido: ${unknownKey.slice(0, 40)}. Permitidos: bot, pregunta`);
    const bot = findOffered(turn.offered, raw.bot);
    if (!bot) return toolError(`El bot debe ser uno de: ${turn.offered.map((offered) => offered.name).join(', ')}`);
    if (typeof raw.pregunta !== 'string' || raw.pregunta.trim().length < 5) return toolError('La pregunta debe ser un texto de al menos 5 caracteres.');
    if (raw.pregunta.length > QUESTION_MAX * 4) return toolError(`La pregunta debe tener como máximo ${QUESTION_MAX} caracteres.`);
    // Nunca se le manda a un tercero algo copiado de las instrucciones internas.
    if (leaksPrompt(raw.pregunta)) return toolError('Esa pregunta no se puede enviar a otro bot.');

    turn.calls += 1;
    const answer = await turn.gateway.ask({ botId: bot.id, question: raw.pregunta, sessionKey: ctx.sessionId });
    if (!answer.ok) return { data: { consultado: bot.name, estado: 'sin_respuesta', motivo: answer.message, nota: NOTE_FAILED } };
    return {
      data: { consultado: bot.name, estado: 'respondio', nota: NOTE_ANSWERED },
      thirdParty: { botName: bot.name, text: answer.text, flags: answer.flags },
    };
  },
};
