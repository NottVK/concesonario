import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmbeddingSync } from './embedding-sync.js';
import type { SyncStats } from './embedding-sync.js';
import { EMBEDDING_PROVIDER } from './embedding-provider.js';
import type { EmbeddingProvider } from './embedding-provider.js';

/**
 * Mantiene al día los vectores cuando el administrador crea o edita un vehículo. El recálculo corre en segundo
 * plano: si Ollama no responde, se registra en el log y la operación del administrador NO falla; el vehículo
 * sigue en el catálogo y queda fuera de la búsqueda semántica hasta el próximo `npm run embeddings:sync`.
 */
@Injectable()
export class EmbeddingsService implements OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly sync: EmbeddingSync;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(EMBEDDING_PROVIDER) provider: EmbeddingProvider,
  ) {
    this.sync = new EmbeddingSync(dataSource, provider);
  }

  /** Lanza el recálculo sin esperar; nunca lanza hacia quien llama. */
  refreshInBackground(vehicleId: number): void {
    const job = this.refresh(vehicleId).finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  /** Espera a que terminen los recálculos en curso (pruebas y apagado ordenado). */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  async onModuleDestroy(): Promise<void> {
    await this.whenIdle();
  }

  syncAll(): Promise<SyncStats> {
    return this.sync.syncAll();
  }

  private async refresh(vehicleId: number): Promise<void> {
    try {
      const outcome = await this.sync.refreshOne(vehicleId);
      if (outcome === 'stale') this.logger.log(`El vehículo ${vehicleId} cambió mientras se calculaba su vector; lo recalcula la edición posterior`);
    } catch (error) {
      this.logger.warn(
        `No se pudo calcular el vector del vehículo ${vehicleId} (${error instanceof Error ? error.message : 'error'}). ` +
          'Sigue en el catálogo; ejecuta `npm run embeddings:sync` cuando el servicio de embeddings esté disponible.',
      );
    }
  }
}
