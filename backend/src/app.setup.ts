import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
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

/** Configuración compartida entre main.ts y las pruebas e2e. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
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
