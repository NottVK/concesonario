import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

describe('Clientes: edición segura (e2e)', () => {
  let ctx: TestContext;
  let sellerToken: string;
  let adminToken: string;
  let anaId: number;

  const ana = { name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' };
  const luis = { name: 'Luis Gómez', email: 'luis@correo.co' };
  const get = (id: number) => request(ctx.server).get(`/api/clientes/${id}`).set(auth(sellerToken));
  const put = (id: number, body: object, token = sellerToken) =>
    request(ctx.server).put(`/api/clientes/${id}`).set(auth(token)).send(body);

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    anaId = (await request(ctx.server).post('/api/clientes').send(ana).expect(201)).body.id;
    await request(ctx.server).post('/api/clientes').send(luis).expect(201);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('versión (control de edición simultánea)', () => {
    it('el cliente trae su versión, que empieza en 1', async () => {
      const res = await get(anaId).expect(200);
      expect(res.body.version).toBe(1);
      const list = await request(ctx.server).get('/api/clientes').set(auth(sellerToken)).expect(200);
      expect(list.body.data.every((c: { version: number }) => c.version === 1)).toBe(true);
    });

    it('editar exige la versión y la sube en uno', async () => {
      await put(anaId, ana).expect(400);
      await put(anaId, { ...ana, version: 0 }).expect(400);
      await put(anaId, { ...ana, version: 'x' }).expect(400);
      const res = await put(anaId, { ...ana, name: 'Ana P. Pérez', version: 1 }).expect(200);
      expect(res.body).toMatchObject({ name: 'Ana P. Pérez', version: 2 });
      expect((await get(anaId)).body.version).toBe(2);
    });

    it('con una versión vieja responde 409 y no cambia nada', async () => {
      const res = await put(anaId, { ...ana, name: 'Intruso', version: 1 }).expect(409);
      expect(res.body.message).toMatch(/otra persona/i);
      expect((await get(anaId)).body.name).toBe('Ana P. Pérez');
    });

    it('dos ediciones simultáneas con la misma versión: una se aplica y la otra recibe 409', async () => {
      const current = (await get(anaId)).body.version;
      const results = await Promise.all([
        put(anaId, { ...ana, name: 'Ana A', version: current }),
        put(anaId, { ...ana, name: 'Ana B', version: current }, adminToken),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect((await get(anaId)).body.version).toBe(current + 1);
    });

    it('un cliente que no existe da 404 aunque la versión sea cualquiera', async () => {
      await put(9999, { ...ana, version: 1 }).expect(404);
    });

    it('el registro público no acepta una versión', async () => {
      await request(ctx.server).post('/api/clientes').send({ ...luis, email: 'otro@correo.co', version: 5 }).expect(400);
    });
  });

  describe('correo repetido', () => {
    it('al editar con el correo de otro cliente: 409 que no revela de quién es', async () => {
      const version = (await get(anaId)).body.version;
      const res = await put(anaId, { ...ana, email: 'LUIS@correo.co', version }).expect(409);
      const text = JSON.stringify(res.body).toLowerCase();
      for (const secret of ['luis', 'gómez', 'gomez', 'correo.co']) expect(text).not.toContain(secret);
      expect((await get(anaId)).body.email).toBe('ana@correo.co');
    });

    it('conservar el propio correo, aunque cambien las mayúsculas, no es un duplicado', async () => {
      const version = (await get(anaId)).body.version;
      await put(anaId, { ...ana, email: 'ANA@correo.co', version }).expect(200);
    });
  });

  describe('formato de correo y teléfono', () => {
    it.each([
      ['correo sin arroba', { email: 'ana.correo.co' }],
      ['correo sin dominio', { email: 'ana@' }],
      ['correo con espacios', { email: 'a na@correo.co' }],
      ['correo de más de 120 caracteres', { email: `${'a'.repeat(60)}@${'b'.repeat(60)}.co` }],
      ['teléfono con letras', { phone: '300abc4567' }],
      ['teléfono solo con símbolos', { phone: '+++-----((' }],
      ['teléfono con menos de 7 dígitos', { phone: '12 34 56' }],
      ['teléfono de más de 30 caracteres', { phone: '3'.repeat(31) }],
    ])('rechaza %s', async (_label, patch) => {
      const version = (await get(anaId)).body.version;
      await put(anaId, { ...ana, ...patch, version }).expect(400);
      await request(ctx.server).post('/api/clientes').send({ ...luis, email: 'nuevo@correo.co', ...patch }).expect(400);
    });

    it.each(['3001234567', '300 123 4567', '+57 (300) 123-4567', '601 234 5678'])('acepta el teléfono %s', async (phone) => {
      const version = (await get(anaId)).body.version;
      await put(anaId, { ...ana, phone, version }).expect(200);
    });

    it('el teléfono es opcional y se puede quitar', async () => {
      const version = (await get(anaId)).body.version;
      const res = await put(anaId, { name: ana.name, email: ana.email, version }).expect(200);
      expect(res.body.phone).toBeNull();
    });
  });

  describe('sin borrado y con privacidad', () => {
    it.each(['delete', 'patch'] as const)('no existe %s sobre un cliente', async (verb) => {
      const res = await request(ctx.server)[verb](`/api/clientes/${anaId}`).set(auth(adminToken));
      expect(res.status).toBe(404);
      await get(anaId).expect(200);
    });

    it('la búsqueda exige al menos 3 caracteres, trata % y _ como texto y pagina', async () => {
      const search = (q: string) => request(ctx.server).get(`/api/clientes?q=${encodeURIComponent(q)}`).set(auth(sellerToken));
      for (const short of ['', 'a', 'an', '  a ', '   ']) await search(short).expect(400);
      await search('x'.repeat(121)).expect(400);
      expect((await search('luis@co').expect(200)).body.data).toHaveLength(1);
      for (const wild of ['%%%', '___', 'a%a']) expect((await search(wild).expect(200)).body.data, wild).toHaveLength(0);
      const page = await request(ctx.server).get('/api/clientes?limit=1&page=2').set(auth(sellerToken)).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta).toMatchObject({ total: 2, page: 2, limit: 1, pages: 2 });
    });

    it('sin sesión nada de esto responde datos', async () => {
      await request(ctx.server).put(`/api/clientes/${anaId}`).send({ ...ana, version: 1 }).expect(401);
      await request(ctx.server).get('/api/clientes?q=ana').expect(401);
    });
  });
});
