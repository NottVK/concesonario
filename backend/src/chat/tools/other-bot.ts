/**
 * Contrato entre el chat y la salida A2A (decisión 119). El chat NO importa nada de `a2a/outbound`: solo conoce esta
 * interfaz, y la implementación la provee `A2aModule` (`a2a/chat-bridge`). Así el texto de otro bot no tiene ningún
 * camino hacia el prompt salvo el que este archivo describe: ninguno (el texto va en `ThirdPartyCard`, que el modelo no ve).
 */

/** Token de inyección de Nest. */
export const OTHER_BOT_GATEWAY = Symbol('OTHER_BOT_GATEWAY');

/** Un bot activo al que se puede preguntar. `name` lo escribió el administrador; el chat lo sanea antes de ofrecérselo al modelo. */
export interface OtherBotInfo {
  id: number;
  name: string;
}

export type OtherBotAnswer =
  | { ok: true; botName: string; text: string; flags: string[] }
  /** `message` es un texto FIJO de AutoMax (nunca algo que escribió el otro bot). */
  | { ok: false; message: string };

export interface OtherBotGateway {
  /** Bots activos con URL registrada (como máximo 10). */
  list(): Promise<OtherBotInfo[]>;
  /** Pregunta por el bot registrado `botId`. `question` ya pasó las validaciones de la tool; la salida la redacta y la valida otra vez. */
  ask(input: { botId: number; question: string; sessionKey: string }): Promise<OtherBotAnswer>;
}

/** Lo que recibe el agente: el gateway y los bots activos YA listados (el listado se hace antes de entrar a la cola de inferencia). */
export interface OtherBotsInput {
  gateway: OtherBotGateway;
  bots: OtherBotInfo[];
}

/** Bot ofrecido al modelo en este turno: el nombre ya está saneado y es el valor del enum de la tool. */
export interface OfferedBot {
  id: number;
  name: string;
}

/** Estado de la tool dentro de un turno. `null` en el contexto = la tool no se ofrece (no hay bots activos). */
export interface OtherBotTurn {
  gateway: OtherBotGateway;
  offered: OfferedBot[];
  /** Consultas hechas en este turno: se permite UNA (decisión 115), cuente o no como éxito. */
  calls: number;
}

/**
 * Respuesta de otro bot para el widget: texto plano ya saneado, en una tarjeta aparte marcada «tercero no verificado».
 * El modelo NUNCA la ve y no se guarda en el historial.
 */
export interface ThirdPartyCard {
  botName: string;
  text: string;
  /** Qué se quitó o tapó (nombres, nunca contenido): sirve para que la tarjeta avise. */
  flags: string[];
}
