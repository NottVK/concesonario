import type { EmbeddingProvider } from './embedding-provider.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';

type Env = Record<string, string | undefined>;

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;

/** Elige el proveedor de embeddings con `EMBEDDING_PROVIDER` (ollama por defecto). Usa el mismo `OLLAMA_HOST` que el chat. */
export function createEmbeddingProvider(env: Env = process.env): EmbeddingProvider {
  const name = (env.EMBEDDING_PROVIDER ?? 'ollama').trim().toLowerCase();
  if (name === 'mock') return new MockEmbeddingProvider();
  if (name !== 'ollama') throw new Error(`EMBEDDING_PROVIDER debe ser ollama o mock (recibido: "${env.EMBEDDING_PROVIDER}")`);
  const model = env.OLLAMA_EMBED_MODEL?.trim() || 'nomic-embed-text';
  if (!MODEL_NAME.test(model)) throw new Error('OLLAMA_EMBED_MODEL no es un nombre de modelo válido');
  const host = (env.OLLAMA_HOST?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(host)) throw new Error('OLLAMA_HOST debe empezar por http:// o https://');
  return new OllamaEmbeddingProvider({
    host,
    model,
    // Sin prefijos por defecto: en la medición con el catálogo real (ver docs/DECISIONES.md) acertaron más sin ellos.
    usePrefixes: (env.OLLAMA_EMBED_PREFIXES ?? 'false').trim().toLowerCase() === 'true',
    timeoutMs: 60_000,
  });
}
