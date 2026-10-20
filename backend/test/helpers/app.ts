import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import type { Server } from 'node:http';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../../src/usuarios/entities/user.entity.js';

export const DEMO_PASSWORD = 'ClaveDePrueba123';

export interface TestContext {
  app: INestApplication;
  server: Server;
  dataSource: DataSource;
  /** Token JWT firmado directamente, para no gastar el límite de intentos del login. */
  tokenFor(user: User): Promise<string>;
}

/** Levanta la app completa contra la BD de pruebas (setup-env.ts ya fijó las variables). */
export async function createTestContext(options: { listen?: boolean } = {}): Promise<TestContext> {
  // Import dinámico: AppModule lee el entorno al cargarse.
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  if (options.listen) {
    // El bot llama a la propia API por HTTP: hace falta un puerto real (efímero) y decirle cuál es.
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    process.env.INTERNAL_API_URL = `http://127.0.0.1:${address.port}/api`;
  }

  const jwt = app.get(JwtService);
  return {
    app,
    server: app.getHttpServer() as Server,
    dataSource: app.get(DataSource),
    tokenFor: (user) => jwt.signAsync({ sub: user.id, role: user.role }),
  };
}

/** Deja todas las tablas vacías y reinicia los ids. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE TABLE intercambios_bots, bots_externos, conversaciones, chat_propuestas_cita, chat_sesiones, ventas, citas,
     vehiculos, marcas, clientes, usuarios RESTART IDENTITY CASCADE`,
  );
}

export async function createUser(
  dataSource: DataSource,
  role: UserRole,
  email = `${role}@prueba.co`,
): Promise<User> {
  const repo = dataSource.getRepository(User);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4);
  return repo.save(repo.create({ name: `Usuario ${role}`, email, passwordHash, role }));
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
