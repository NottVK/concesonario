import { isValidVin, normalizeVin, VIN_INVALID_MESSAGE, VIN_NOT_FOUND_MESSAGE } from '../../fichas-vin/vin.js';
import type { FichaVinView } from '../../fichas-vin/fichas-vin.service.js';
import { AttemptLimiter } from '../security/attempt-limiter.js';
import { parseArgs } from './args.js';
import { toolError } from './tool-types.js';
import type { ChatTool } from './tool-types.js';

const VIN_RATE_MESSAGE = 'Hiciste muchas consultas de VIN seguidas. Intenta de nuevo más tarde.';

/** Tope por IP contra el recorrido de VIN uno por uno: 3 por minuto y 10 por hora. */
const perMinute = new AttemptLimiter(3, 60_000);
const perHour = new AttemptLimiter(10, 3_600_000);

/** Solo para pruebas. */
export function resetVinLimits(): void {
  perMinute.reset();
  perHour.reset();
}

/** Campos que ve el modelo: la API ya los entrega filtrados y aquí se vuelven a elegir uno por uno. */
function publicFields(f: FichaVinView): Record<string, unknown> {
  return {
    marca: f.brand,
    modelo: f.model,
    anio: f.year,
    version: f.version,
    carroceria: f.bodyType,
    puertas: f.doors,
    combustible: f.fuel,
    transmision: f.transmission,
  };
}

export const consultarFichaVin: ChatTool = {
  name: 'consultar_ficha_vin',
  definition: {
    name: 'consultar_ficha_vin',
    description:
      'Consulta la ficha pública de un vehículo por su VIN (17 caracteres, sin I, O ni Q): marca, modelo, año, versión, ' +
      'carrocería, puertas, combustible y transmisión. Pasa el VIN tal como lo escribió la persona.',
    parameters: {
      type: 'object',
      properties: {
        vin: {
          type: 'string',
          description: 'VIN de 17 caracteres tal como lo escribió la persona; puede traer espacios o guiones (se quitan). Solo el VIN, sin otros datos.',
        },
      },
      required: ['vin'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, { vin: { kind: 'str', max: 40, required: true } });
    if (!parsed.ok) return toolError(parsed.error);
    const vin = normalizeVin(String((parsed.value as { vin: string }).vin));
    if (!isValidVin(vin)) return toolError(VIN_INVALID_MESSAGE);

    const key = ctx.clientKey ?? 'anon';
    if (!perMinute.tryConsume(key) || !perHour.tryConsume(key)) return toolError(VIN_RATE_MESSAGE);

    const response = await ctx.api.get<FichaVinView>(`/fichas-vin/${vin}`);
    // Inexistente, sin ficha, vendido o cualquier otro fallo: la MISMA respuesta.
    if (response.status !== 200) return toolError(VIN_NOT_FOUND_MESSAGE);
    return { data: publicFields(response.data) };
  },
};
