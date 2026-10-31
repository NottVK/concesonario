import { parseArgs } from './args.js';
import { toolError } from './tool-types.js';
import type { ChatTool, ToolResult } from './tool-types.js';
import type { WarrantyView } from './warranty.js';

const UNAVAILABLE = 'El flujo de garantías no está disponible en este momento.';

/** El modelo ve el estado y el texto ya armado por el servidor; la decisión de la garantía nunca es suya. */
function viewData(view: WarrantyView): ToolResult {
  return {
    data: {
      estado: view.state,
      mensaje_para_cliente: view.message,
      ...(view.reason ? { motivo: view.reason } : {}),
      ...(view.parts ? { repuestos: view.parts } : {}),
      ...(view.canRequestReview ? { puede_pedir_revision: true } : {}),
    },
  };
}

/** El caso sale de la SESIÓN (ya identificada por formulario); el modelo solo aporta la descripción de la falla. */
export const reportarFallaGarantia: ChatTool = {
  name: 'reportar_falla_garantia',
  definition: {
    name: 'reportar_falla_garantia',
    description:
      'Registra la falla que cuenta el cliente y evalúa su garantía (lo decide el sistema, no tú). Pasa la descripción de la falla en ' +
      'una frase. Usa pedir_revision "si" solo cuando la garantía salió vencida y el cliente quiere que una persona la revise.',
    parameters: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Falla del vehículo, con las palabras del cliente' },
        pedir_revision: { type: 'string', enum: ['si', 'no'] },
      },
      required: ['descripcion'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, { descripcion: { kind: 'str', max: 500, required: true }, pedir_revision: { kind: 'enum', values: ['si', 'no'] } });
    if (!parsed.ok) return toolError(parsed.error);
    if (!ctx.warranty) return toolError(UNAVAILABLE);
    const { descripcion, pedir_revision } = parsed.value as { descripcion: string; pedir_revision?: string };
    return viewData(await ctx.warranty.report(ctx.sessionId, descripcion, pedir_revision === 'si'));
  },
};

export const consultarEstadoGarantia: ChatTool = {
  name: 'consultar_estado_garantia',
  definition: {
    name: 'consultar_estado_garantia',
    description: 'Consulta cómo va el caso de garantía de esta conversación (pendiente, aceptado con repuestos, rechazado con motivo).',
    parameters: { type: 'object', properties: {} },
  },
  async run(_raw, ctx) {
    if (!ctx.warranty) return toolError(UNAVAILABLE);
    return viewData(await ctx.warranty.status(ctx.sessionId));
  },
};
