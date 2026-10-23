import { describe, expect, it } from 'vitest';
import type { ReadOnlyApi } from '../api/public-api.client.js';
import type { ToolContext } from './tool-types.js';
import { buscarVehiculos, normalizeColor } from './vehicle-tools.js';

function contextWith(calls: { path: string; params?: Record<string, string | number | undefined> }[]): ToolContext {
  const api: ReadOnlyApi = {
    get: (path, params) => {
      calls.push({ path, params });
      return Promise.resolve({ status: 200, data: { data: [], meta: { total: 0 } } as never });
    },
    post: () => Promise.resolve({ status: 200, data: {} as never }),
  };
  return { api, sessionId: 's', seen: new Set(), now: new Date(), createProposal: () => Promise.reject(new Error('no')), otherBots: null };
}

describe('buscar_vehiculos por color', () => {
  it('normaliza el color al masculino singular del catálogo', () => {
    expect(normalizeColor('Roja')).toBe('rojo');
    expect(normalizeColor(' plateado ')).toBe('plata');
    expect(normalizeColor('Azules')).toBe('azul');
    expect(normalizeColor('verde lima')).toBe('verde lima');
  });

  it('manda el color como filtro duro a GET /vehiculos (sin búsqueda semántica)', async () => {
    const calls: { path: string; params?: Record<string, string | number | undefined> }[] = [];
    await buscarVehiculos.run({ color: 'roja', query: 'carro rojo' }, contextWith(calls));
    const list = calls.find((call) => call.path === '/vehiculos');
    expect(list?.params).toMatchObject({ color: 'rojo' });
  });

  it('ofrece el parámetro color al modelo', () => {
    const properties = buscarVehiculos.definition.parameters.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('color');
  });
});
