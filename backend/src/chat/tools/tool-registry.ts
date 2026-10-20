import { Logger } from '@nestjs/common';
import { ApiUnreachableError, RouteNotAllowedError } from '../api/public-api.client.js';
import type { ToolCall, ToolDefinition } from '../model/model-provider.js';
import { agendarCita } from './appointment-tool.js';
import { simularCredito } from './credit-tool.js';
import { otherBotDefinition, preguntarAOtroBot } from './other-bot-tool.js';
import { toolError } from './tool-types.js';
import type { ChatTool, ToolContext, ToolResult } from './tool-types.js';
import { buscarVehiculos, compararVehiculos, detalleVehiculo } from './vehicle-tools.js';

/**
 * Tools registradas. `consultar_cita` queda diferida (el bot solo confirma las citas de la sesión actual).
 * `preguntar_a_otro_bot` está registrada pero SOLO se ofrece al modelo en los turnos en que hay bots activos.
 */
export const TOOLS: readonly ChatTool[] = [buscarVehiculos, detalleVehiculo, compararVehiculos, simularCredito, agendarCita, preguntarAOtroBot];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
const logger = new Logger('ChatTools');

/** Definiciones que se le ofrecen al modelo en este turno: la de otros bots lleva como enum los bots activos, y falta si no hay ninguno. */
export function toolDefinitions(context?: Pick<ToolContext, 'otherBots'>): ToolDefinition[] {
  const offered = context?.otherBots?.offered ?? [];
  return TOOLS.flatMap((tool) => {
    if (tool.name !== preguntarAOtroBot.name) return [tool.definition];
    return offered.length > 0 ? [otherBotDefinition(offered)] : [];
  });
}

/**
 * Ejecuta una llamada del modelo. Nada de lo que escribe el modelo se ejecuta tal cual: el nombre debe estar
 * registrado y los argumentos pasan por validación estricta dentro de la tool. Los fallos vuelven al modelo
 * como un resultado de error legible, no como excepción.
 */
export async function executeTool(call: ToolCall, context: ToolContext): Promise<ToolResult> {
  const tool = BY_NAME.get(call.name);
  if (!tool) return toolError(`La herramienta "${call.name.slice(0, 40)}" no existe. Disponibles: ${[...BY_NAME.keys()].join(', ')}`);
  if (call.invalidArguments) return toolError('Los argumentos no eran un objeto JSON válido. Vuelve a intentarlo.');
  try {
    return await tool.run(call.arguments, context);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return toolError('No pude consultar el sistema en este momento.');
    if (error instanceof RouteNotAllowedError) {
      logger.error(`Ruta bloqueada por la lista blanca: ${error.message}`);
      return toolError('Esa consulta no está permitida.');
    }
    logger.error(`Fallo inesperado en ${tool.name}: ${error instanceof Error ? error.message : 'desconocido'}`);
    return toolError('Ocurrió un error inesperado con esa herramienta.');
  }
}
