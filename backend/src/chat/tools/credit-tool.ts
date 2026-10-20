import { parseArgs } from './args.js';
import { apiMessage, formatPesos } from './format.js';
import type { ApiVehicle } from './format.js';
import { toolError } from './tool-types.js';
import type { ChatTool } from './tool-types.js';

interface Simulation {
  amount: string;
  downPayment: string;
  financed: string;
  months: number;
  annualRate: number;
  monthlyPayment: string;
  totalPayment: string;
  totalInterest: string;
}

/**
 * La tasa NUNCA viene del modelo y el precio lo lee el servidor desde la API: el modelo solo aporta qué
 * vehículo, cuánto de cuota inicial y a cuántos meses.
 */
export const simularCredito: ChatTool = {
  name: 'simular_credito',
  definition: {
    name: 'simular_credito',
    description:
      'Calcula la cuota mensual de un crédito para un vehículo. Pasa el id del vehículo (de buscar_vehiculos), ' +
      'la cuota inicial en pesos (solo números, 0 si no hay) y los meses (12 a 84). Nunca calcules cuotas tú.',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'integer', minimum: 1 },
        downPayment: { type: 'string', description: 'Cuota inicial en pesos colombianos, solo números; "0" si no hay' },
        months: { type: 'integer', minimum: 12, maximum: 84 },
      },
      required: ['vehicleId', 'downPayment', 'months'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, {
      vehicleId: { kind: 'int', min: 1, max: 2_147_483_647, required: true },
      downPayment: { kind: 'money', required: true },
      months: { kind: 'int', min: 1, max: 1000, required: true },
    });
    if (!parsed.ok) return toolError(parsed.error);
    const { vehicleId, downPayment, months } = parsed.value as { vehicleId: number; downPayment: string; months: number };
    if (!ctx.seen.has(vehicleId)) return toolError('Ese id no salió de una búsqueda de esta conversación. Usa buscar_vehiculos primero.');
    if (months < 12 || months > 84) return toolError('El plazo debe estar entre 12 y 84 meses.');

    const vehicle = await ctx.api.get<ApiVehicle>(`/vehiculos/${vehicleId}`);
    if (vehicle.status !== 200) return toolError('No encontré ese vehículo.');
    if (vehicle.data.status === 'vendido') return toolError('Ese vehículo ya fue vendido.');

    const simulation = await ctx.api.post<Simulation>('/financiacion/simular', { amount: vehicle.data.price, downPayment, months });
    if (simulation.status !== 200) {
      return toolError(apiMessage(simulation.data, 'No pude simular ese crédito; revisa la cuota inicial y el plazo.'));
    }
    const s = simulation.data;
    return {
      data: {
        vehiculo_id: vehicleId,
        precio: s.amount,
        precio_texto: formatPesos(s.amount),
        cuota_inicial: s.downPayment,
        cuota_inicial_texto: formatPesos(s.downPayment),
        financiado: s.financed,
        financiado_texto: formatPesos(s.financed),
        meses: s.months,
        tasa_efectiva_anual_porcentaje: Math.round(s.annualRate * 10_000) / 100,
        cuota: s.monthlyPayment,
        cuota_texto: formatPesos(s.monthlyPayment),
        total_a_pagar: s.totalPayment,
        total_a_pagar_texto: formatPesos(s.totalPayment),
        intereses: s.totalInterest,
        intereses_texto: formatPesos(s.totalInterest),
      },
    };
  },
};
