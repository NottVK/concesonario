import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Appointment } from '../src/citas/entities/appointment.entity.js';
import { Customer } from '../src/clientes/entities/customer.entity.js';
import { Brand } from '../src/marcas/entities/brand.entity.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { FuelType, Transmission, Vehicle, VehicleStatus } from '../src/vehiculos/entities/vehicle.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';
import { bogotaSlot, TUESDAY } from './helpers/dates.js';

/**
 * Fuzzing de entradas: ningún número enorme, texto raro o tipo equivocado puede producir un 5xx.
 * Un 4xx (400, 401, 403, 404, 409, 413, 429) es una respuesta correcta; un 500 es un bug.
 */
const GARBAGE = [
  '0', '-1', '-0', '1.5', '1e3', '1e20', '1E400', '99999999999999999999', '9223372036854775807',
  '9223372036854775808', '2147483647', '2147483648', '4294967296', 'NaN', 'Infinity', '-Infinity',
  'abc', ' ', '%00', '１２３', '0x10', 'null', 'undefined', 'true', '[]', '{}', '1,2', "1'--", ' 12 ',
  '9'.repeat(400), '-'.repeat(60),
];

/** Valores que nunca equivalen a un id existente (1..n): se usan en rutas que modifican o borran. */
const SAFE_IDS = ['99999999999999999999', '9223372036854775808', '2147483648', '4294967296', 'abc', '-1', '0', 'NaN', 'Infinity', '%00', '１２３', "9'--", ' ', '9'.repeat(400)];

describe('Entradas extremas: nunca un 5xx (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let sellerToken: string;
  let vehicleId: number;
  let brandId: number;
  let customerId: number;
  const failures: string[] = [];
  let appointmentId: number;
  interface DocParam { name: string; in: 'query' | 'path' | 'header' }
  interface DocOp { parameters?: DocParam[]; security?: unknown[]; requestBody?: unknown }
  let doc: { paths: Record<string, Record<string, DocOp>> };
  const operations = (): { method: string; path: string; op: DocOp }[] =>
    Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => ({ method: m.toUpperCase(), path, op })));
  /** Un id que sí existe, según la ruta, para no frenar la prueba en un 404 antes de llegar al parámetro. */
  const realId = (path: string): number =>
    path.includes('/citas') ? appointmentId : path.includes('/clientes') ? customerId : path.includes('/marcas') ? brandId : vehicleId;
  const bodyForPathFuzz = (method: string, path: string): unknown => {
    if (path.includes('/citas/{id}/estado')) return { status: 'cancelada' };
    if (path.includes('/vehiculos/{id}')) return validVehicle();
    if (path.includes('/marcas/{id}')) return { name: 'X', country: 'Y' };
    if (path.includes('/clientes/{id}')) return { name: 'Ana', email: 'a@b.co' };
    return method === 'POST' ? {} : undefined;
  };

  /** `tolerateReset`: Node corta la conexión (cabeceras de más de 16 KB); eso no es un 500 de la aplicación. */
  const check = async (label: string, send: () => request.Test, tolerateReset = false): Promise<void> => {
    try {
      const res = await send();
      if (res.status >= 500) failures.push(`${label} -> ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (tolerateReset && (code === 'ECONNRESET' || code === 'EPIPE')) return;
      failures.push(`${label} -> la petición falló: ${(error as Error).message.slice(0, 80)}`);
    }
  };
  /** Ejecuta en tandas para no saturar el servidor de pruebas. */
  const runAll = async (tasks: (() => Promise<void>)[], batch = 20): Promise<void> => {
    for (let i = 0; i < tasks.length; i += batch) await Promise.all(tasks.slice(i, i + batch).map((task) => task()));
  };
  const expectNoFailures = (): void => {
    expect(failures, `Respuestas 5xx:\n${failures.join('\n')}`).toEqual([]);
    failures.length = 0;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    const brand = await ctx.dataSource.getRepository(Brand).save({ name: 'Mazda', country: 'Japón', logoUrl: null });
    brandId = brand.id;
    const vehicles = ctx.dataSource.getRepository(Vehicle);
    const car = await vehicles.save(vehicles.create({
      brandId, model: 'Mazda 3', year: 2024, version: 'Base', price: '100000000', mileage: 0, fuel: FuelType.GASOLINE,
      transmission: Transmission.AUTOMATIC, color: 'Rojo', status: VehicleStatus.NEW, description: null, images: [],
    }));
    vehicleId = car.id;
    const customers = ctx.dataSource.getRepository(Customer);
    const customer = await customers.save(customers.create({ name: 'Ana', email: 'ana@correo.co', phone: null }));
    customerId = customer.id;
    const appointments = ctx.dataSource.getRepository(Appointment);
    const appointment = await appointments.save(appointments.create({ vehicleId, customerId, scheduledAt: new Date(bogotaSlot(TUESDAY, 10)), durationMin: 60 }));
    appointmentId = appointment.id;
    doc = (await request(ctx.server).get('/api/docs-json').expect(200)).body;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('parámetros de consulta', () => {
    // Parámetros de consulta y de ruta de TODOS los endpoints, tomados de Swagger: un endpoint nuevo entra solo.
    it('cada parámetro de consulta y de ruta documentado, lleno de basura', async () => {
      const tasks: (() => Promise<void>)[] = [];
      for (const { method, path, op } of operations()) {
        const token = op.security ? adminToken : undefined;
        const params = op.parameters ?? [];
        const withReal = (template: string): string => template.replace(/\{\w+\}/g, String(realId(path)));
        const send = (verb: string, url: string): request.Test => {
          const req = (request(ctx.server) as unknown as Record<string, (u: string) => request.Test>)[verb](url);
          if (token) req.set(auth(token));
          return ['post', 'put', 'patch'].includes(verb) ? req.send(bodyForPathFuzz(method, path) as object) : req;
        };
        for (const param of params.filter((x) => x.in === 'query')) {
          for (const value of GARBAGE) {
            const url = `${withReal(path)}?${param.name}=${encodeURIComponent(value)}`;
            tasks.push(() => check(`${method} ${url.slice(0, 90)}`, () => send(method.toLowerCase(), url)));
          }
          for (const odd of [`${param.name}=1&${param.name}=2`, `${param.name}[]=1`, `${param.name}[a]=1`, `${param.name}[a][b]=1`, `${param.name}=`]) {
            tasks.push(() => check(`${method} ${withReal(path)}?${odd}`, () => send(method.toLowerCase(), `${withReal(path)}?${odd}`)));
          }
        }
        for (const param of params.filter((x) => x.in === 'path')) {
          // En rutas que modifican o borran solo valores que nunca equivalen a un id existente.
          const values = method === 'GET' ? GARBAGE : SAFE_IDS;
          for (const value of values) {
            const url = path.replace(`{${param.name}}`, encodeURIComponent(value)).replace(/\{\w+\}/g, String(realId(path)));
            tasks.push(() => check(`${method} ${url.slice(0, 90)}`, () => send(method.toLowerCase(), url)));
          }
        }
      }
      expect(tasks.length, 'Swagger no devolvió operaciones con parámetros').toBeGreaterThan(500);
      await runAll(tasks);
      expectNoFailures();
    }, 240_000);


    it('comparar: pares de ids con basura', async () => {
      const tasks = GARBAGE.flatMap((value) => [`${vehicleId},${value}`, `${value},${vehicleId}`, `${value},${value}`, `${vehicleId},${vehicleId},${value}`].map((ids) => () => {
        const url = `/api/vehiculos/comparar?ids=${encodeURIComponent(ids)}`;
        return check(`GET ${url.slice(0, 100)}`, () => request(ctx.server).get(url));
      }));
      await runAll(tasks);
      expectNoFailures();
    });

    it('disponibilidad: from y to con basura', async () => {
      const tasks: (() => Promise<void>)[] = [];
      for (const param of ['from', 'to']) {
        for (const value of [...GARBAGE, '2026-11-02T00:00:00-05:00', '9999-12-31T23:59:59+23:59', '0000-01-01T00:00:00Z', '275760-09-13T00:00:00Z', '2026-11-02T00:00:00-99:99']) {
          const url = `/api/vehiculos/${vehicleId}/disponibilidad?${param}=${encodeURIComponent(value)}`;
          tasks.push(() => check(`GET ${url.slice(0, 100)}`, () => request(ctx.server).get(url)));
        }
      }
      await runAll(tasks);
      expectNoFailures();
    });

    it('búsqueda por cliente en citas: texto hostil nunca da 5xx', async () => {
      const hostile = [
        ...GARBAGE, '%00%00%00', '\u0000\u0000\u0000', '😀😀😀', 'ñññ', 'ÁÉÍ', '%E0%A4%A', '%', '%%%', '___', '\\\\\\', "'; DROP TABLE citas;--",
        '" OR 1=1 --', '${7*7}', '{{7*7}}', '<script>alert(1)</script>', 'a'.repeat(120), 'a'.repeat(121), 'a'.repeat(5000), ' abc ', '\t\t\t\t', '\n\n\n\n',
      ];
      const raw = ['customer=%', 'customer=%E0%A4%A', 'customer=%ZZ%ZZ', 'customer=%00abc', 'customer', 'customer=&customer=', 'customer[]=abc', 'customer[a]=abc', 'customer[$ne]=abc', 'customer=abc&customer=def'];
      const tasks = [
        ...hostile.map((value) => () => check(`GET /citas?customer=${value.slice(0, 30)}`, () =>
          request(ctx.server).get(`/api/citas?customer=${encodeURIComponent(value)}`).set(auth(sellerToken)))),
        ...raw.map((query) => () => check(`GET /citas?${query}`, () => request(ctx.server).get(`/api/citas?${query}`).set(auth(sellerToken)))),
      ];
      await runAll(tasks);
      expectNoFailures();
    });

    it('rangos de fechas extremos en el listado de citas', async () => {
      const dates = ['0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z', '275760-09-13T00:00:00.000Z', '-271821-04-20T00:00:00Z', '2026-02-30T00:00:00Z'];
      const tasks = dates.flatMap((from) => dates.map((to) => () =>
        check(`GET /api/citas?from=${from}&to=${to}`, () => request(ctx.server).get(`/api/citas?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set(auth(sellerToken)))));
      await runAll(tasks);
      expectNoFailures();
    });
  });

  /** Cuerpos JSON: cada campo recibe cada valor extremo (como texto, como número, nulo, lista y objeto). */
  const jsonVariants = (value: string): unknown[] => {
    const asNumber = Number(value);
    return [value, Number.isFinite(asNumber) ? asNumber : value, null, [], {}, true, [value], { a: value }];
  };
  const validVehicle = () => ({
    brandId, model: 'Prueba', year: 2024, version: 'V', price: '90000000', mileage: 0, fuel: 'gasolina',
    transmission: 'manual', color: 'Gris', status: 'nuevo',
  });
  const bodyTasks = (
    label: string, base: Record<string, unknown>, fields: string[],
    send: (body: unknown) => request.Test, values: string[] = GARBAGE,
  ): (() => Promise<void>)[] =>
    fields.flatMap((field) => values.flatMap((value) => jsonVariants(value).map((variant) => () =>
      check(`${label} ${field}=${JSON.stringify(variant)?.slice(0, 40)}`, () => send({ ...base, [field]: variant })))));

  describe('cuerpos JSON', () => {
    it('POST /citas (público)', async () => {
      const base = { vehicleId, scheduledAt: bogotaSlot(TUESDAY, 15), customer: { name: 'Luis', email: 'luis@correo.co', phone: '3001234567' } };
      const tasks = [
        ...bodyTasks('POST /citas', base, ['vehicleId', 'scheduledAt', 'customer'], (body) => request(ctx.server).post('/api/citas').send(body as object)),
        ...['name', 'email', 'phone'].flatMap((field) => GARBAGE.map((value) => () =>
          check(`POST /citas customer.${field}=${value.slice(0, 30)}`, () =>
            request(ctx.server).post('/api/citas').send({ ...base, customer: { ...base.customer, [field]: value } })))),
      ];
      await runAll(tasks);
      expectNoFailures();
    }, 120_000);

    it('POST /financiacion/simular y POST /clientes (públicos)', async () => {
      const sim = { amount: '100000000', downPayment: '20000000', months: 60, annualRate: 0.18 };
      const cus = { name: 'Ana', email: 'nueva@correo.co', phone: '3001234567' };
      const tasks = [
        ...bodyTasks('POST /simular', sim, ['amount', 'downPayment', 'months', 'annualRate'], (body) => request(ctx.server).post('/api/financiacion/simular').send(body as object)),
        ...bodyTasks('POST /clientes', cus, ['name', 'email', 'phone'], (body) => request(ctx.server).post('/api/clientes').send(body as object)),
      ];
      await runAll(tasks);
      expectNoFailures();
    }, 120_000);

    it('POST /vehiculos y POST /marcas (admin)', async () => {
      const tasks = [
        ...bodyTasks('POST /vehiculos', validVehicle(), ['brandId', 'model', 'year', 'version', 'price', 'mileage', 'fuel', 'transmission', 'color', 'status', 'description', 'images'],
          (body) => request(ctx.server).post('/api/vehiculos').set(auth(adminToken)).send(body as object)),
        ...bodyTasks('POST /marcas', { name: 'Marca', country: 'País' }, ['name', 'country', 'logoUrl'],
          (body) => request(ctx.server).post('/api/marcas').set(auth(adminToken)).send(body as object)),
      ];
      await runAll(tasks);
      expectNoFailures();
    }, 180_000);

    it('PUT de vehículo, marca y cliente y PATCH de cita (sobre filas reales)', async () => {
      const tasks = [
        ...bodyTasks('PUT /vehiculos/:id', validVehicle(), ['brandId', 'model', 'year', 'version', 'price', 'mileage', 'fuel', 'transmission', 'color', 'status', 'description', 'images'],
          (body) => request(ctx.server).put(`/api/vehiculos/${vehicleId}`).set(auth(adminToken)).send(body as object)),
        ...bodyTasks('PUT /marcas/:id', { name: 'Marca ' + Date.now(), country: 'País' }, ['name', 'country', 'logoUrl'],
          (body) => request(ctx.server).put(`/api/marcas/${brandId}`).set(auth(adminToken)).send(body as object)),
        ...bodyTasks('PUT /clientes/:id', { name: 'Ana', email: 'ana@correo.co', phone: '3001234567' }, ['name', 'email', 'phone'],
          (body) => request(ctx.server).put(`/api/clientes/${customerId}`).set(auth(sellerToken)).send(body as object)),
        ...bodyTasks('PATCH /citas/:id/estado', { status: 'confirmada' }, ['status'],
          (body) => request(ctx.server).patch(`/api/citas/${appointmentId}/estado`).set(auth(sellerToken)).send(body as object)),
      ];
      await runAll(tasks);
      expectNoFailures();
    }, 180_000);

    it('POST /auth/login (limitado a 5 por minuto: pasado el límite responde 429, que tampoco es un 5xx)', async () => {
      const tasks = bodyTasks('POST /auth/login', { email: 'x@y.co', password: 'una-clave-valida' }, ['email', 'password'],
        (body) => request(ctx.server).post('/api/auth/login').send(body as object), GARBAGE.slice(0, 6));
      await runAll(tasks, 5);
      expectNoFailures();
    }, 120_000);

    // Si se agrega un endpoint con cuerpo, esta prueba falla hasta que se añada al fuzzing de cuerpos de arriba.
    it('todo endpoint con cuerpo está cubierto por el fuzzing de cuerpos', () => {
      const covered = new Set([
        'POST /api/citas', 'POST /api/financiacion/simular', 'POST /api/clientes', 'POST /api/vehiculos', 'POST /api/marcas',
        'POST /api/ventas', 'POST /api/auth/login', 'PUT /api/vehiculos/{id}', 'PUT /api/marcas/{id}', 'PUT /api/clientes/{id}',
        'PATCH /api/citas/{id}/estado',
      ]);
      const withBody = operations().filter(({ op }) => op.requestBody).map(({ method, path }) => `${method} ${path}`);
      const missing = withBody.filter((key) => !covered.has(key));
      expect(missing, `Endpoints con cuerpo sin fuzzing (agrégalos a esta prueba):\n${missing.join('\n')}`).toEqual([]);
      expect(withBody.length).toBeGreaterThanOrEqual(covered.size);
    });

    it('POST /ventas (vendedor)', async () => {
      const base = { vehicleId, customerId, finalPrice: '90000000', payment: 'contado' };
      await runAll(bodyTasks('POST /ventas', base, ['vehicleId', 'customerId', 'finalPrice', 'payment'], (body) => request(ctx.server).post('/api/ventas').set(auth(sellerToken)).send(body as object)));
      expectNoFailures();
    }, 120_000);

    it('cuerpos enormes, mal formados o con tipo de contenido raro', async () => {
      const big = 'x'.repeat(2_000_000);
      const tasks = [
        () => check('POST /citas 2 MB', () => request(ctx.server).post('/api/citas').send({ customer: { name: big } })),
        () => check('POST /clientes JSON roto', () => request(ctx.server).post('/api/clientes').set('Content-Type', 'application/json').send('{"name": ')),
        () => check('POST /clientes texto plano', () => request(ctx.server).post('/api/clientes').set('Content-Type', 'text/plain').send('hola')),
        () => check('POST /clientes sin cuerpo', () => request(ctx.server).post('/api/clientes')),
        () => check('POST /clientes array', () => request(ctx.server).post('/api/clientes').send([1, 2, 3])),
        () => check('POST /clientes null', () => request(ctx.server).post('/api/clientes').set('Content-Type', 'application/json').send('null')),
        () => check('POST /clientes anidado profundo', () => request(ctx.server).post('/api/clientes').set('Content-Type', 'application/json').send(`${'['.repeat(5000)}${']'.repeat(5000)}`)),
        () => check('POST /clientes __proto__', () => request(ctx.server).post('/api/clientes').set('Content-Type', 'application/json').send('{"__proto__":{"admin":true},"constructor":{"x":1},"name":"A","email":"p@q.co"}')),
        () => check('POST /financiacion/simular urlencoded', () => request(ctx.server).post('/api/financiacion/simular').type('form').send('amount=1&downPayment=0&months=60')),
        () => check('GET con URL de 12 KB', () => request(ctx.server).get(`/api/vehiculos?model=${'a'.repeat(12_000)}`)),
        () => check('GET con URL de 100 KB (Node corta la conexión)', () => request(ctx.server).get(`/api/vehiculos?model=${'a'.repeat(100_000)}`), true),
        () => check('GET con 5000 parámetros', () => request(ctx.server).get(`/api/vehiculos?${Array.from({ length: 5000 }, (_, i) => `p${i}=1`).join('&')}`)),
        () => check('GET con 5000 ids', () => request(ctx.server).get(`/api/vehiculos/comparar?ids=${Array.from({ length: 5000 }, (_, i) => i + 1).join(',')}`)),
        () => check('login con 2 MB', () => request(ctx.server).post('/api/auth/login').send({ email: big, password: big })),
      ];
      await runAll(tasks, 5);
      expectNoFailures();
    }, 120_000);
  });
});
