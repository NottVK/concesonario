import { Module } from '@nestjs/common';
import { createEmbeddingProvider } from './embedding-factory.js';
import { EMBEDDING_PROVIDER } from './embedding-provider.js';
import { EmbeddingsService } from './embeddings.service.js';

@Module({
  providers: [
    // EMBEDDING_PROVIDER=ollama (por defecto) o mock (pruebas). Una configuración mala impide arrancar.
    { provide: EMBEDDING_PROVIDER, useFactory: () => createEmbeddingProvider() },
    EmbeddingsService,
  ],
  exports: [EMBEDDING_PROVIDER, EmbeddingsService],
})
export class EmbeddingsModule {}
