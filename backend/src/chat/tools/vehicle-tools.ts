import { moneyToCents } from '../../common/money.js';
import { parseArgs } from './args.js';
import type { Spec } from './args.js';
import { apiMessage, priceDifference, vehicleCard, vehicleForModel, vehicleTitle } from './format.js';
import type { ApiVehicle } from './format.js';
import { toolError } from './tool-types.js';
import type { ChatTool, ToolContext, ToolResult } from './tool-types.js';

const RESULT_LIMIT = 5;
const FUELS = ['gasolina', 'diesel', 'hibrido', 'electrico'] as const;
const TRANSMISSIONS = ['manual', 'automatica'] as const;
const SORTS = ['newest', 'price_asc', 'price_desc', 'year_desc', 'year_asc'] as const;
const VEHICLE_ID_HINT = 'Ese id no salió de una búsqueda de esta conversación. Usa buscar_vehiculos primero.';

const SEARCH_SPEC: Record<string, Spec> = {
  query: { kind: 'str', max: 200 },
  brand: { kind: 'str', max: 60 },
  model: { kind: 'str', max: 80 },
  yearMin: { kind: 'int', min: 1990, max: 2100 },
  yearMax: { kind: 'int', min: 1990, max: 2100 },
  priceMin: { kind: 'money' },
  priceMax: { kind: 'money' },
  fuel: { kind: 'enum', values: FUELS },
  transmission: { kind: 'enum', values: TRANSMISSIONS },
  status: { kind: 'enum', values: ['nuevo', 'usado'] },
  sort: { kind: 'enum', values: SORTS },
};

const HARD_FILTERS = ['brand', 'model', 'yearMin', 'yearMax', 'priceMin', 'priceMax', 'fuel', 'transmission', 'status'] as const;

interface VehiclePage {
  data: ApiVehicle[];
  meta: { total: number };
}

/** Orden semántico de la búsqueda inteligente; si no está disponible (503) se sigue sin ella. */
async function semanticOrder(ctx: ToolContext, query: string): Promise<ApiVehicle[] | null> {
  try {
    const response = await ctx.api.get<ApiVehicle[]>('/vehiculos/buscar', { q: query, limit: 10 });
    return response.status === 200 && Array.isArray(response.data) ? response.data : null;
  } catch {
    // La búsqueda semántica es opcional: si la API no responde, el bot sigue con los filtros.
    return null;
  }
}

function listResult(vehicles: ApiVehicle[], total: number | null): ToolResult {
  const shown = vehicles.slice(0, RESULT_LIMIT);
  if (shown.length === 0) {
    return { data: { total: 0, mostrando: 0, vehiculos: [], mensaje: 'No hay vehículos disponibles con esos criterios.' } };
  }
  return {
    data: { ...(total === null ? {} : { total }), mostrando: shown.length, vehiculos: shown.map(vehicleForModel) },
    cards: shown.map(vehicleCard),
    seen: shown.map((v) => v.id),
  };
}

export const buscarVehiculos: ChatTool = {
  name: 'buscar_vehiculos',
  definition: {
    name: 'buscar_vehiculos',
    description:
      'Busca vehículos DISPONIBLES del catálogo por marca, modelo, año, precio, combustible o transmisión. ' +
      'Úsala siempre antes de dar precios, stock o ids. Si el cliente describe lo que quiere con palabras libres, usa query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Descripción libre de lo que busca el cliente (máx. 200 caracteres)' },
        brand: { type: 'string', description: 'Marca, p. ej. Mazda' },
        model: { type: 'string', description: 'Modelo, p. ej. CX-5' },
        yearMin: { type: 'integer' },
        yearMax: { type: 'integer' },
        priceMin: { type: 'string', description: 'Precio mínimo en pesos colombianos, solo números' },
        priceMax: { type: 'string', description: 'Precio máximo en pesos colombianos, solo números' },
        fuel: { type: 'string', enum: [...FUELS] },
        transmission: { type: 'string', enum: [...TRANSMISSIONS] },
        status: { type: 'string', enum: ['nuevo', 'usado'] },
        sort: { type: 'string', enum: [...SORTS] },
      },
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, SEARCH_SPEC);
    if (!parsed.ok) return toolError(parsed.error);
    const args = parsed.value as Record<string, string | number | undefined>;
    const query = typeof args.query === 'string' && args.query ? args.query : null;

    const params: Record<string, string | number | undefined> = { limit: query ? 50 : RESULT_LIMIT, page: 1, sort: args.sort ?? 'newest' };
    const hasHardFilters = HARD_FILTERS.some((key) => args[key] !== undefined);
    for (const key of HARD_FILTERS) params[key] = args[key];

    if (query && !hasHardFilters) {
      // Solo texto libre: la semántica decide qué se muestra.
      const ranked = await semanticOrder(ctx, query);
      if (ranked) return listResult(ranked, null);
    }
    const response = await ctx.api.get<VehiclePage>('/vehiculos', params);
    if (response.status !== 200) return toolError(apiMessage(response.data, 'No pude consultar el catálogo ahora.'));
    let vehicles = response.data.data;
    if (query && hasHardFilters) {
      // Los filtros duros mandan; la semántica solo ordena lo que ya cumple.
      const ranked = await semanticOrder(ctx, query);
      if (ranked) {
        const order = new Map(ranked.map((v, index) => [v.id, index]));
        vehicles = [...vehicles].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
      }
    }
    return listResult(vehicles, response.data.meta.total);
  },
};

function isUnseen(ids: number[], ctx: ToolContext): boolean {
  return ids.some((id) => !ctx.seen.has(id));
}

export const detalleVehiculo: ChatTool = {
  name: 'detalle_vehiculo',
  definition: {
    name: 'detalle_vehiculo',
    description: 'Da la ficha de un vehículo (precio, año, km, versión) por su id. El id debe venir de buscar_vehiculos.',
    parameters: {
      type: 'object',
      properties: { vehicleId: { type: 'integer', minimum: 1, description: 'Id que devolvió buscar_vehiculos' } },
      required: ['vehicleId'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, { vehicleId: { kind: 'int', min: 1, max: 2_147_483_647, required: true } });
    if (!parsed.ok) return toolError(parsed.error);
    const id = parsed.value.vehicleId as number;
    if (isUnseen([id], ctx)) return toolError(VEHICLE_ID_HINT);
    const response = await ctx.api.get<ApiVehicle>(`/vehiculos/${id}`);
    if (response.status === 404) return toolError('Ese vehículo no existe.');
    if (response.status !== 200) return toolError(apiMessage(response.data, 'No pude consultar el vehículo ahora.'));
    if (response.data.status === 'vendido') return toolError('Ese vehículo ya fue vendido y no está disponible.');
    return { data: { vehiculo: vehicleForModel(response.data) }, cards: [vehicleCard(response.data)], seen: [id] };
  },
};

export const compararVehiculos: ChatTool = {
  name: 'comparar_vehiculos',
  definition: {
    name: 'comparar_vehiculos',
    description: 'Compara de 2 a 3 vehículos por sus ids (que deben venir de buscar_vehiculos). Las diferencias de precio las calcula el sistema.',
    parameters: {
      type: 'object',
      properties: { vehicleIds: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 2, maxItems: 3 } },
      required: ['vehicleIds'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, { vehicleIds: { kind: 'intArray', min: 1, max: 2_147_483_647, minItems: 2, maxItems: 3, required: true } });
    if (!parsed.ok) return toolError(parsed.error);
    const ids = parsed.value.vehicleIds as number[];
    if (isUnseen(ids, ctx)) return toolError(VEHICLE_ID_HINT);
    const response = await ctx.api.get<ApiVehicle[]>('/vehiculos/comparar', { ids: ids.join(',') });
    if (response.status !== 200) return toolError(apiMessage(response.data, 'No pude comparar esos vehículos.'));
    if (response.data.some((v) => v.status === 'vendido')) return toolError('Alguno de esos vehículos ya fue vendido.');
    return { data: { vehiculos: response.data.map(vehicleForModel), diferencias: differences(response.data) }, cards: response.data.map(vehicleCard), seen: ids };
  },
};

/** Cálculos de la comparación hechos por el código (el modelo no resta precios). */
function differences(vehicles: ApiVehicle[]): Record<string, unknown> {
  const byPrice = [...vehicles].sort((a, b) => Number(moneyToCents(a.price) - moneyToCents(b.price)));
  const cheapest = byPrice[0]!;
  const priciest = byPrice[byPrice.length - 1]!;
  const years = vehicles.map((v) => v.year);
  return {
    mas_economico: vehicleTitle(cheapest),
    mas_caro: vehicleTitle(priciest),
    diferencia_precio: priceDifference(priciest.price, cheapest.price),
    anio_mas_reciente: Math.max(...years),
    anio_mas_antiguo: Math.min(...years),
  };
}
