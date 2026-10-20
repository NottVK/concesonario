import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INTERNAL_HEADER, InternalSecret } from '../security/internal-secret.js';
import { ALLOWED_ROUTES, ApiUnreachableError, baseUrl, PublicApiClient, RouteNotAllowedError } from './public-api.client.js';

let server: Server;
let seen: { method: string; url: string; headers: IncomingHttpHeaders }[] = [];
let status = 200;
let location: string | null = null;
const secret = new InternalSecret();
let client: PublicApiClient;

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    res.writeHead(status, { 'content-type': 'application/json', ...(location ? { location } : {}) });
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.INTERNAL_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  client = new PublicApiClient(secret);
});

afterAll(async () => {
  delete process.env.INTERNAL_API_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
  status = 200;
  location = null;
});

describe('PublicApiClient: lista blanca', () => {
  it('permite exactamente las rutas del plan y manda el secreto interno', async () => {
    await client.get('/marcas');
    await client.get('/vehiculos', { limit: 5 });
    await client.get('/vehiculos/comparar', { ids: '1,2' });
    await client.get('/vehiculos/buscar', { q: 'suv' });
    await client.get('/vehiculos/12');
    await client.get('/vehiculos/12/disponibilidad');
    await client.post('/financiacion/simular', { amount: '1', downPayment: '0', months: 12 });
    expect(seen).toHaveLength(7);
    for (const request of seen) expect(request.headers[INTERNAL_HEADER]).toBe(secret.header());
    expect(seen[1]!.url).toBe('/api/vehiculos?limit=5');
  });

  it.each([
    ['GET', '/clientes'],
    ['GET', '/clientes/1'],
    ['POST', '/clientes'],
    ['GET', '/citas'],
    ['GET', '/citas/1'],
    ['POST', '/citas'],
    ['PATCH', '/citas/1/estado'],
    ['GET', '/ventas'],
    ['POST', '/ventas'],
    ['GET', '/admin/vehiculos'],
    ['GET', '/admin/metricas/resumen'],
    ['POST', '/auth/login'],
    ['GET', '/auth/me'],
    ['POST', '/vehiculos'],
    ['PUT', '/vehiculos/1'],
    ['DELETE', '/vehiculos/1'],
    ['POST', '/marcas'],
    ['GET', '/vehiculos/1/../clientes'],
    ['GET', '/vehiculos/1?x=1'],
    ['GET', '/vehiculos/1%2f..%2fclientes'],
    ['GET', '//clientes'],
    ['GET', '/chat/estado'],
    ['GET', 'http://evil.example/vehiculos'],
  ])('rechaza %s %s ANTES de la red', async (method, path) => {
    const attempt = method === 'GET' ? client.get(path) : client.post(path, {});
    await expect(attempt).rejects.toBeInstanceOf(RouteNotAllowedError);
    expect(seen).toHaveLength(0);
  });

  it('la lista blanca no contiene POST /citas (solo createAppointment lo usa)', () => {
    expect(ALLOWED_ROUTES.some((r) => r.method === 'POST' && r.path.test('/citas'))).toBe(false);
    expect(ALLOWED_ROUTES.some((r) => r.path.test('/clientes') || r.path.test('/ventas') || r.path.test('/admin/vehiculos'))).toBe(false);
  });

  it('createAppointment es el único camino hacia POST /citas', async () => {
    await client.createAppointment({ vehicleId: 1 });
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url).toBe('/api/citas');
  });
});

describe('PublicApiClient: robustez', () => {
  it('devuelve los errores HTTP sin lanzar y no sigue redirecciones', async () => {
    status = 404;
    expect((await client.get('/vehiculos/999')).status).toBe(404);
    status = 302;
    location = 'http://127.0.0.1:1/robado';
    const result = await client.get('/vehiculos/1');
    expect(result.status).toBe(302);
    expect(seen).toHaveLength(2);
  });

  it('sin servidor lanza ApiUnreachableError y el error no contiene el secreto', async () => {
    const previous = process.env.INTERNAL_API_URL;
    process.env.INTERNAL_API_URL = 'http://127.0.0.1:1/api';
    const error = await client.get('/marcas').catch((e: unknown) => e);
    process.env.INTERNAL_API_URL = previous;
    expect(error).toBeInstanceOf(ApiUnreachableError);
    expect(`${(error as Error).message} ${(error as Error).stack ?? ''} ${JSON.stringify(error)}`).not.toContain(secret.header());
  });

  it('INTERNAL_API_URL solo acepta loopback (el secreto nunca sale de la máquina)', () => {
    const previous = process.env.INTERNAL_API_URL;
    process.env.INTERNAL_API_URL = 'http://api.ejemplo.com/api';
    expect(() => baseUrl()).toThrow(/misma máquina/);
    process.env.INTERNAL_API_URL = previous;
  });
});
