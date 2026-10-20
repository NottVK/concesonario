import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BodyShapePipe } from './common/body-shape.pipe.js';
import { DbExceptionFilter } from './common/db-exception.filter.js';
import { applyMcpHttpRules } from './mcp/mcp-http.js';

/** Ruta de la documentación interactiva; el JSON queda en `${DOCS_PATH}-json`. */
export const DOCS_PATH = 'api/docs';

function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('AutoMax API')
    .setDescription(
      'API del concesionario. Los nombres de campos y parámetros van en inglés; los valores de los enums ' +
        '(estados, combustibles…) y los mensajes de error van en español. Dinero: string en COP con hasta 2 decimales.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(DOCS_PATH, app, SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}

/** Rutas que quedan FUERA del prefijo `api` (decisión 111): la tarjeta pública y las tareas de otros bots. */
export const API_PREFIX_EXCLUDE = ['.well-known/agent.json', 'a2a/tasks'];

/** Configuración compartida entre main.ts y las pruebas e2e. */
export function configureApp(app: INestApplication): void {
  // La tarjeta y las tareas A2A quedan FUERA del prefijo `api` (decisión 111).
  // Sin `X-Powered-By: Express`: no hay por qué anunciar el servidor (ni en la tarjeta, ni en los 401 de los bots).
  (app as NestExpressApplication).disable('x-powered-by');
  app.setGlobalPrefix('api', { exclude: API_PREFIX_EXCLUDE });
  // Antes que cualquier parser: el cuerpo del MCP lo lee su propio servidor, con tope, después de autenticar.
  applyMcpHttpRules(app);
  app.useGlobalPipes(
    new BodyShapePipe(),
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new DbExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', exposedHeaders: ['Retry-After'] });
  setupSwagger(app);
}
