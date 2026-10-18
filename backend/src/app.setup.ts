import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DbExceptionFilter } from './common/db-exception.filter.js';

/** Configuración compartida entre main.ts y las pruebas e2e. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new DbExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' });
}
