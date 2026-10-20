import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers/app.js';

interface Parameter { name: string; in: string; required?: boolean }
interface Operation {
  tags?: string[];
  summary?: string;
  parameters?: Parameter[];
  security?: unknown[];
  requestBody?: { content: Record<string, { schema: { $ref?: string } }> };
  responses: Record<string, unknown>;
}
interface Schema { properties?: Record<string, unknown>; required?: string[] }
interface OpenApiDoc {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, unknown> };
}

// Nombres del contrato anterior (en español): no deben volver a aparecer.
const OLD_SPANISH_NAMES = [
  'marca', 'modelo', 'anioMin', 'anioMax', 'precioMin', 'precioMax', 'combustible', 'transmision',
  'estado', 'orden', 'desde', 'hasta', 'vehiculoId', 'valor', 'cuotaInicial', 'plazoMeses', 'tasaEA',
  'tasaMensual', 'cuotaMensual', 'totalPagar', 'totalIntereses', 'financiado',
];

describe('Contrato OpenAPI (/api/docs)', () => {
  let ctx: TestContext;
  let doc: OpenApiDoc;
  const operation = (method: string, path: string): Operation => {
    const found = doc.paths[path]?.[method];
    if (!found) throw new Error(`Falta ${method.toUpperCase()} ${path} en la documentación`);
    return found;
  };
  const schemaOf = (name: string): Schema => doc.components.schemas[name];

  beforeAll(async () => {
    ctx = await createTestContext();
    doc = (await request(ctx.server).get('/api/docs-json').expect(200)).body as OpenApiDoc;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('la documentación es pública (UI y JSON) y declara el esquema Bearer', async () => {
    const ui = await request(ctx.server).get('/api/docs').expect(200);
    expect(ui.headers['content-type']).toMatch(/html/);
    expect(doc.components.securitySchemes).toHaveProperty('bearer');
  });

  it('documenta exactamente las 40 operaciones de la API', () => {
    const operations = Object.entries(doc.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
      .sort();
    expect(operations).toEqual([
      'DELETE /api/chat/sesion',
      'DELETE /api/marcas/{id}',
      'DELETE /api/vehiculos/{id}',
      'GET /api/admin/bots',
      'GET /api/admin/metricas/resumen',
      'GET /api/admin/metricas/stock-por-marca',
      'GET /api/admin/metricas/ventas-por-mes',
      'GET /api/admin/vehiculos',
      'GET /api/auth/me',
      'GET /api/chat/estado',
      'GET /api/citas',
      'GET /api/citas/{id}',
      'GET /api/clientes',
      'GET /api/clientes/{id}',
      'GET /api/marcas',
      'GET /api/marcas/{id}',
      'GET /api/vehiculos',
      'GET /api/vehiculos/buscar',
      'GET /api/vehiculos/comparar',
      'GET /api/vehiculos/{id}',
      'GET /api/vehiculos/{id}/disponibilidad',
      'GET /api/ventas',
      'GET /api/ventas/{id}',
      'PATCH /api/admin/bots/{id}',
      'PATCH /api/citas/{id}/estado',
      'POST /api/admin/bots',
      'POST /api/admin/bots/{id}/rotar-clave',
      'POST /api/auth/login',
      'POST /api/chat',
      'POST /api/chat/citas/confirmar',
      'POST /api/citas',
      'POST /api/clientes',
      'POST /api/financiacion/simular',
      'POST /api/marcas',
      'POST /api/mcp',
      'POST /api/vehiculos',
      'POST /api/ventas',
      'PUT /api/clientes/{id}',
      'PUT /api/marcas/{id}',
      'PUT /api/vehiculos/{id}',
    ]);
  });

  it('cada operación tiene etiqueta, resumen y al menos una respuesta', () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const label = `${method.toUpperCase()} ${path}`;
        expect(op.tags?.length, `${label} sin tags`).toBeGreaterThan(0);
        expect(op.summary, `${label} sin summary`).toBeTruthy();
        expect(Object.keys(op.responses).length, `${label} sin respuestas`).toBeGreaterThan(0);
      }
    }
  });

  it('marca como protegidas solo las rutas privadas', () => {
    const publicRoutes: [string, string][] = [
      ['post', '/api/auth/login'], ['get', '/api/marcas'], ['get', '/api/marcas/{id}'],
      ['get', '/api/vehiculos'], ['get', '/api/vehiculos/buscar'], ['get', '/api/vehiculos/comparar'], ['get', '/api/vehiculos/{id}'],
      ['post', '/api/chat'], ['post', '/api/chat/citas/confirmar'], ['delete', '/api/chat/sesion'], ['get', '/api/chat/estado'], ['post', '/api/mcp'],
      ['get', '/api/vehiculos/{id}/disponibilidad'], ['post', '/api/clientes'], ['post', '/api/citas'], ['post', '/api/financiacion/simular'],
    ];
    const privateRoutes: [string, string][] = [
      ['get', '/api/auth/me'], ['post', '/api/marcas'], ['put', '/api/marcas/{id}'],
      ['delete', '/api/marcas/{id}'], ['post', '/api/vehiculos'], ['put', '/api/vehiculos/{id}'],
      ['delete', '/api/vehiculos/{id}'], ['get', '/api/clientes'], ['get', '/api/clientes/{id}'],
      ['put', '/api/clientes/{id}'], ['get', '/api/citas'], ['get', '/api/citas/{id}'],
      ['patch', '/api/citas/{id}/estado'], ['post', '/api/ventas'], ['get', '/api/ventas'],
      ['get', '/api/ventas/{id}'], ['get', '/api/admin/metricas/resumen'],
      ['get', '/api/admin/metricas/ventas-por-mes'], ['get', '/api/admin/metricas/stock-por-marca'],
      ['get', '/api/admin/vehiculos'], ['get', '/api/admin/bots'], ['post', '/api/admin/bots'],
      ['post', '/api/admin/bots/{id}/rotar-clave'], ['patch', '/api/admin/bots/{id}'],
    ];
    for (const [method, path] of publicRoutes) expect(operation(method, path).security, `${method} ${path}`).toBeUndefined();
    for (const [method, path] of privateRoutes) expect(operation(method, path).security, `${method} ${path}`).toBeDefined();
  });

  it('GET /vehiculos documenta los filtros en inglés', () => {
    const names = (operation('get', '/api/vehiculos').parameters ?? []).map((p) => p.name).sort();
    expect(names).toEqual([
      'brand', 'brandId', 'fuel', 'limit', 'model', 'page', 'priceMax', 'priceMin',
      'sort', 'status', 'transmission', 'yearMax', 'yearMin',
    ]);
  });

  it('GET /citas, GET /clientes y GET /vehiculos/comparar documentan sus parámetros', () => {
    const names = (method: string, path: string) =>
      (operation(method, path).parameters ?? []).map((p) => p.name).sort();
    expect(names('get', '/api/citas')).toEqual(['customer', 'from', 'limit', 'page', 'status', 'to', 'vehicleId']);
    expect(names('get', '/api/clientes')).toEqual(['limit', 'page', 'q']);
    expect(names('get', '/api/vehiculos/comparar')).toEqual(['ids']);
    expect(names('get', '/api/ventas')).toEqual(['limit', 'page']);
  });

  it('GET /vehiculos/buscar documenta q y limit', () => {
    const names = (operation('get', '/api/vehiculos/buscar').parameters ?? []).map((p) => p.name).sort();
    expect(names).toEqual(['limit', 'q']);
  });

  it('documenta los parámetros de la disponibilidad y de las rutas admin', () => {
    const names = (path: string) => (operation('get', path).parameters ?? []).map((p) => p.name).sort();
    expect(names('/api/vehiculos/{id}/disponibilidad')).toEqual(['from', 'id', 'to']);
    expect(names('/api/admin/metricas/ventas-por-mes')).toEqual(['months']);
    expect(names('/api/admin/metricas/resumen')).toEqual([]);
    expect(names('/api/admin/vehiculos')).toEqual(names('/api/vehiculos'));
  });

  it('la disponibilidad solo expone inicio y fin de cada franja, sin datos del cliente', () => {
    expect(Object.keys(schemaOf('BusySlotDto').properties ?? {}).sort()).toEqual(['endsAt', 'startsAt']);
    expect(Object.keys(schemaOf('AvailabilityDto').properties ?? {}).sort()).toEqual([
      'busy', 'durationMin', 'from', 'to', 'vehicleId',
    ]);
  });

  it('las métricas documentan sus campos y el dinero como texto', () => {
    expect(Object.keys(schemaOf('SummaryDto').properties ?? {}).sort()).toEqual([
      'month', 'pendingAppointments', 'revenueThisMonth', 'salesThisMonth', 'stockValue', 'vehiclesInStock',
    ]);
    expect(Object.keys(schemaOf('SalesByMonthDto').properties ?? {}).sort()).toEqual(['count', 'month', 'total']);
    expect(Object.keys(schemaOf('StockByBrandDto').properties ?? {}).sort()).toEqual(['brand', 'brandId', 'count', 'value']);
  });

  it('el simulador documenta su petición y respuesta en inglés', () => {
    expect(Object.keys(schemaOf('SimulateFinancingDto').properties ?? {}).sort()).toEqual([
      'amount', 'annualRate', 'downPayment', 'months',
    ]);
    expect(schemaOf('SimulateFinancingDto').required?.sort()).toEqual(['amount', 'downPayment', 'months']);
    expect(Object.keys(schemaOf('FinancingSimulationDto').properties ?? {}).sort()).toEqual([
      'amount', 'annualRate', 'downPayment', 'financed', 'monthlyPayment',
      'monthlyRate', 'months', 'totalInterest', 'totalPayment',
    ]);
  });

  it('POST /citas pide el cliente dentro del cuerpo y responde sin datos del cliente', () => {
    expect(schemaOf('CreateAppointmentDto').required?.sort()).toEqual(['customer', 'scheduledAt', 'vehicleId']);
    expect(Object.keys(schemaOf('PublicAppointmentDto').properties ?? {}).sort()).toEqual([
      'endsAt', 'id', 'scheduledAt', 'status', 'vehicleId',
    ]);
    expect(Object.keys(schemaOf('CreatedIdDto').properties ?? {})).toEqual(['id']);
  });

  it('no expone campos ocultos (embedding, hash)', () => {
    expect(schemaOf('Vehicle').properties).not.toHaveProperty('embedding');
    for (const name of ['User', 'PublicUserDto']) {
      expect(Object.keys(schemaOf(name)?.properties ?? {})).not.toEqual(expect.arrayContaining(['passwordHash']));
      expect(schemaOf(name)?.properties ?? {}).not.toHaveProperty('hash');
    }
    expect(JSON.stringify(doc)).not.toMatch(/passwordHash|"embedding"/);
  });

  it('las ventas no aceptan el vendedor en el cuerpo', () => {
    expect(Object.keys(schemaOf('CreateSaleDto').properties ?? {}).sort()).toEqual([
      'customerId', 'finalPrice', 'payment', 'vehicleId',
    ]);
  });

  it('ningún parámetro ni campo del contrato usa los nombres antiguos en español', () => {
    const names = new Set<string>();
    for (const methods of Object.values(doc.paths)) {
      // Las cabeceras HTTP (X-Chat-Session) tienen su propia convención; el camelCase aplica a query, ruta y campos.
      for (const op of Object.values(methods)) (op.parameters ?? []).filter((p) => p.in !== 'header').forEach((p) => names.add(p.name));
    }
    for (const schema of Object.values(doc.components.schemas)) {
      Object.keys(schema.properties ?? {}).forEach((name) => names.add(name));
    }
    expect([...names].filter((name) => OLD_SPANISH_NAMES.includes(name))).toEqual([]);
    for (const name of names) expect(name, `nombre no camelCase: ${name}`).toMatch(/^[a-z][A-Za-z0-9]*$/);
  });
});
