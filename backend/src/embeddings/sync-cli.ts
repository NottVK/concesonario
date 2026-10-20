import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from '../database/db.config.js';
import { createEmbeddingProvider } from './embedding-factory.js';
import { EmbeddingSync } from './embedding-sync.js';

/**
 * `npm run embeddings:sync`: calcula los vectores que faltan o cambiaron. Idempotente (se puede correr las
 * veces que haga falta). Usa OLLAMA_HOST y OLLAMA_EMBED_MODEL del entorno (o del .env, que la app carga sola).
 */
async function main(): Promise<void> {
  loadRootEnv();
  const provider = createEmbeddingProvider();
  if (!(await provider.isAvailable())) {
    console.error('No hay respuesta de Ollama en OLLAMA_HOST. Enciéndelo (y haz `ollama pull nomic-embed-text`) y vuelve a correr este comando.');
    process.exitCode = 1;
    return;
  }
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    const stats = await new EmbeddingSync(dataSource, provider).syncAll((done, total) => {
      if (done % 10 === 0 || done === total) console.log(`  ${done}/${total}`);
    });
    console.log(
      `Embeddings listos (${provider.model}): ${stats.updated} calculados, ${stats.skipped} ya vigentes, ${stats.stale} cambiaron en el camino (de ${stats.total}).`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(`No se pudieron calcular los embeddings: ${error instanceof Error ? error.message : 'error desconocido'}`);
  process.exitCode = 1;
});
