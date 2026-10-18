import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User, UserRole } from '../src/usuarios/entities/user.entity.js';
import {
  auth,
  createTestContext,
  createUser,
  DEMO_PASSWORD,
  resetDatabase,
  type TestContext,
} from './helpers/app.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.dataSource);
    await createUser(ctx.dataSource, UserRole.SELLER, 'vendedor@prueba.co');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('login correcto devuelve token y usuario sin hash', async () => {
    const res = await request(ctx.server)
      .post('/api/auth/login')
      .send({ email: 'VENDEDOR@prueba.co', password: DEMO_PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'vendedor@prueba.co', role: 'vendedor' });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2[aby]\$/i);
  });

  it('contraseña incorrecta y correo inexistente dan el mismo 401 genérico', async () => {
    const wrongPassword = await request(ctx.server)
      .post('/api/auth/login')
      .send({ email: 'vendedor@prueba.co', password: 'otra-clave-123' })
      .expect(401);
    const unknownEmail = await request(ctx.server)
      .post('/api/auth/login')
      .send({ email: 'nadie@prueba.co', password: 'otra-clave-123' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('rechaza un cuerpo inválido con 400', async () => {
    const res = await request(ctx.server)
      .post('/api/auth/login')
      .send({ email: 'no-es-correo', password: '123', extra: 'x' })
      .expect(400);
    expect(res.body.message).toEqual(expect.any(Array));
  });

  it('GET /auth/me exige token y devuelve el usuario con uno válido', async () => {
    await request(ctx.server).get('/api/auth/me').expect(401);
    await request(ctx.server).get('/api/auth/me').set(auth('token.invalido.x')).expect(401);

    const user = await ctx.dataSource.getRepository(User).findOneByOrFail({ email: 'vendedor@prueba.co' });
    const token = await ctx.tokenFor(user);
    const res = await request(ctx.server).get('/api/auth/me').set(auth(token)).expect(200);
    expect(res.body).toMatchObject({ email: 'vendedor@prueba.co' });
  });

  it('limita el login a 5 intentos por minuto (429)', async () => {
    // Ya se gastaron 4 intentos en las pruebas anteriores: el 5.º pasa y el 6.º se bloquea.
    const attempt = () =>
      request(ctx.server).post('/api/auth/login').send({ email: 'x@prueba.co', password: 'otra-clave-123' });
    await attempt().expect(401);
    await attempt().expect(429);
  });
});
