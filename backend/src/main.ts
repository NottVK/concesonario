import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { applyServerTimeouts } from './mcp/mcp-http.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 8000);
  applyServerTimeouts(app.getHttpServer());
}
await bootstrap();
