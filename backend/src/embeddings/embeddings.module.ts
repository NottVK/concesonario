import { Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER } from './embedding-provider.js';
import { createEmbeddingProvider } from './embedding-factory.js';

@Module({
  // EMBEDDING_PROVIDER=ollama (por defecto) o mock (pruebas). Una configuración mala impide arrancar.
  providers: [{ provide: EMBEDDING_PROVIDER, useFactory: () => createEmbeddingProvider() }],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
