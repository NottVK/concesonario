import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/common/decorators.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

/**
 * Autorización de TODAS las rutas, descubiertas desde los controladores reales (no hay lista escrita a mano:
 * una ruta nueva entra sola). Reparto vigente:
 *   - público: catálogo, marcas, disponibilidad, simulador, agendar cita, registrar cliente, login.
 *   - personal (admin y vendedor): citas, clientes y REGISTRAR ventas.
 *   - solo admin: todo lo demás (inventario, marcas, métricas, listado y consulta de ventas).
 *   - cualquier usuario con sesión: únicamente GET /auth/me.
 */
interface RouteInfo {
  method: string;
  path: string; // con :params
  label: string; // "GET /api/citas/:id"
  roles: UserRole[] | undefined;
  isPublic: boolean;
}

const AUTHENTICATED_ONLY_ALLOWED = ['GET /api/auth/me'];

const STAFF_ROUTES = [
  'GET /api/citas', 'GET /api/citas/:id', 'PATCH /api/citas/:id/estado',
  'GET /api/clientes', 'GET /api/clientes/:id', 'PUT /api/clientes/:id',
  'POST /api/ventas',
];

const clean = (value: string | undefined): string => (value ?? '').replace(/^\/+|\/+$/g, '');

function discoverRoutes(ctx: TestContext): RouteInfo[] {
  const container = ctx.app.get(ModulesContainer);
  const reflector = new Reflector();
  const routes: RouteInfo[] = [];
  for (const module of container.values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!type) continue;
      const base = clean(Reflect.getMetadata(PATH_METADATA, type) as string | undefined);
      for (const name of Object.getOwnPropertyNames(type.prototype)) {
        const handler = (type.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const sub = clean(Reflect.getMetadata(PATH_METADATA, handler) as string | undefined);
        const path = '/api/' + [base, sub].filter(Boolean).join('/');
        const targets = [handler, type];
        routes.push({
          method: RequestMethod[method],
          path,
          label: `${RequestMethod[method]} ${path}`,
          roles: reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets),
          isPublic: !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets),
        });
      }
    }
  }
  return routes.sort((a, b) => a.label.localeCompare(b.label));
}

describe('Autorización de todas las rutas (e2e)', () => {
  let ctx: TestContext;
  let routes: RouteInfo[];
  let adminToken: string;
  let sellerToken: string;
  let customerToken: string;

  const call = (route: RouteInfo, token?: string) => {
    const url = route.path.replace(/:\w+/g, '1');
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const req = request(ctx.server)[method](url);
    if (token) req.set(auth(token));
    return ['post', 'put', 'patch'].includes(method) ? req.send({}) : req;
  };

  const adminOnly = () => routes.filter((r) => !r.isPublic && r.roles?.length === 1 && r.roles[0] === UserRole.ADMIN);
  const staff = () =>
    routes.filter((r) => !r.isPublic && r.roles?.length === 2 && r.roles.includes(UserRole.ADMIN) && r.roles.includes(UserRole.SELLER));
  const authenticatedOnly = () => routes.filter((r) => !r.isPublic && (!r.roles || r.roles.length === 0));

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    adminToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN));
    sellerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.SELLER));
    customerToken = await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.CUSTOMER));
    routes = discoverRoutes(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('el descubrimiento ve exactamente las mismas rutas que documenta Swagger (no se escapa ninguna)', async () => {
    const doc = (await request(ctx.server).get('/api/docs-json').expect(200)).body as { paths: Record<string, Record<string, unknown>> };
    const documented = Object.entries(doc.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`))
      .sort();
    expect(routes.map((r) => r.label)).toEqual(documented);
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it('ninguna ruta privada queda abierta a "cualquier usuario con sesión" salvo GET /auth/me', () => {
    // Si alguien olvida @Roles() en una ruta nueva, aparece aquí (un usuario con rol cliente podría usarla).
    expect(authenticatedOnly().map((r) => r.label)).toEqual(AUTHENTICATED_ONLY_ALLOWED);
  });

  it('el personal (admin y vendedor) accede exactamente a citas, clientes y registrar ventas', () => {
    expect(staff().map((r) => r.label)).toEqual([...STAFF_ROUTES].sort());
  });

  it('todo lo demás privado es solo de admin, e incluye inventario, marcas, métricas y consulta de ventas', () => {
    const labels = adminOnly().map((r) => r.label);
    for (const expected of [
      'POST /api/vehiculos', 'PUT /api/vehiculos/:id', 'DELETE /api/vehiculos/:id',
      'POST /api/marcas', 'PUT /api/marcas/:id', 'DELETE /api/marcas/:id',
      'GET /api/admin/vehiculos', 'GET /api/admin/metricas/resumen', 'GET /api/admin/metricas/ventas-por-mes',
      'GET /api/admin/metricas/stock-por-marca', 'GET /api/ventas', 'GET /api/ventas/:id',
    ]) {
      expect(labels, `falta ${expected} como solo-admin`).toContain(expected);
    }
    // Cada ruta privada es una y solo una de: personal, solo admin o GET /auth/me.
    const privateRoutes = routes.filter((r) => !r.isPublic).map((r) => r.label).sort();
    expect([...adminOnly(), ...staff(), ...authenticatedOnly()].map((r) => r.label).sort()).toEqual(privateRoutes);
  });

  describe('rutas solo de admin', () => {
    it('sin token: 401 en cada una', async () => {
      for (const route of adminOnly()) expect((await call(route)).status, route.label).toBe(401);
    });
    it('con token de VENDEDOR: 403 en cada una', async () => {
      for (const route of adminOnly()) expect((await call(route, sellerToken)).status, route.label).toBe(403);
    });
    it('con token de CLIENTE: 403 en cada una', async () => {
      for (const route of adminOnly()) expect((await call(route, customerToken)).status, route.label).toBe(403);
    });
    it('con token de admin pasan la autorización (la respuesta ya no es 401 ni 403)', async () => {
      for (const route of adminOnly()) {
        const status = (await call(route, adminToken)).status;
        expect([401, 403], `${route.label} -> ${status}`).not.toContain(status);
      }
    });
  });

  describe('rutas del personal', () => {
    it('sin token: 401; con token de CLIENTE: 403', async () => {
      for (const route of staff()) {
        expect((await call(route)).status, `${route.label} sin token`).toBe(401);
        expect((await call(route, customerToken)).status, `${route.label} cliente`).toBe(403);
      }
    });
    it('vendedor y admin pasan la autorización', async () => {
      for (const route of staff()) {
        for (const token of [sellerToken, adminToken]) {
          const status = (await call(route, token)).status;
          expect([401, 403], `${route.label} -> ${status}`).not.toContain(status);
        }
      }
    });
  });

  describe('rutas públicas', () => {
    it('no piden token (excepto el login, que responde 401 por credenciales)', async () => {
      for (const route of routes.filter((r) => r.isPublic && r.label !== 'POST /api/auth/login')) {
        const status = (await call(route)).status;
        expect([401, 403], `${route.label} -> ${status}`).not.toContain(status);
      }
    });
    it('el reparto público es el esperado', () => {
      expect(routes.filter((r) => r.isPublic).map((r) => r.label)).toEqual([
        'GET /api/marcas', 'GET /api/marcas/:id', 'GET /api/vehiculos', 'GET /api/vehiculos/:id',
        'GET /api/vehiculos/:id/disponibilidad', 'GET /api/vehiculos/comparar', 'GET /api/vehiculos/buscar', 'POST /api/auth/login',
        'POST /api/citas', 'POST /api/clientes', 'POST /api/financiacion/simular',
        'POST /api/chat', 'POST /api/chat/citas/confirmar', 'DELETE /api/chat/sesion', 'GET /api/chat/estado',
      ].sort());
    });
  });

  it('toda ruta de la lista blanca del bot es pública en la app en marcha (si no, el bot no podría usarla)', () => {
    const samples: [string, string][] = [
      ['GET', '/api/marcas'], ['GET', '/api/vehiculos'], ['GET', '/api/vehiculos/comparar'], ['GET', '/api/vehiculos/buscar'],
      ['GET', '/api/vehiculos/:id'], ['GET', '/api/vehiculos/:id/disponibilidad'], ['POST', '/api/financiacion/simular'],
      ['POST', '/api/citas'],
    ];
    for (const [method, path] of samples) {
      const route = routes.find((r) => r.method === method && r.path === path);
      expect(route?.isPublic, `${method} ${path} debe ser @Public`).toBe(true);
    }
  });

  it('un token manipulado o de otro firmante no da acceso a ninguna ruta privada', async () => {
    const forged = `${adminToken.slice(0, -4)}AAAA`;
    for (const route of routes.filter((r) => !r.isPublic)) {
      expect((await call(route, forged)).status, route.label).toBe(401);
    }
  });
});
