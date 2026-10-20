import axios, { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { EMBEDDING_DIMENSIONS, EmbeddingUnavailableError } from './embedding-provider.js';
import type { EmbeddingProvider } from './embedding-provider.js';

export interface OllamaEmbeddingConfig {
  host: string;
  model: string;
  /** Prefijos de tarea de nomic-embed-text (`search_query: ` / `search_document: `). */
  usePrefixes: boolean;
  timeoutMs: number;
}

/**
 * Embeddings con Ollama (`nomic-embed-text`, 768 dimensiones) en OLLAMA_HOST. `keep_alive: 0` descarga el
 * modelo de embeddings al terminar para que no compita por RAM con el modelo de chat.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly http: AxiosInstance;

  constructor(private readonly config: OllamaEmbeddingConfig) {
    // El modo de prefijos forma parte de la identidad del vector: si se cambia, los vectores viejos se recalculan.
    this.model = config.usePrefixes ? config.model : `${config.model}+sinprefijo`;
    this.http = axios.create({ baseURL: config.host, timeout: config.timeoutMs, maxRedirects: 0 });
  }

  async embed(text: string, kind: 'query' | 'document', signal?: AbortSignal): Promise<number[]> {
    const prefix = this.config.usePrefixes ? (kind === 'query' ? 'search_query: ' : 'search_document: ') : '';
    try {
      const { data } = await this.http.post<{ embeddings?: number[][] }>(
        '/api/embed',
        { model: this.config.model, input: `${prefix}${text}`, keep_alive: 0 },
        { signal },
      );
      const vector = data.embeddings?.[0];
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
        throw new EmbeddingUnavailableError('El modelo de embeddings devolvió un vector inesperado');
      }
      return vector;
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      // Los errores de Axios traen la configuración completa: se traduce a un mensaje propio y corto.
      const status = isAxiosError(error) ? error.response?.status : undefined;
      throw new EmbeddingUnavailableError(status ? `ollama (embeddings): error HTTP ${status}` : 'ollama (embeddings): sin conexión');
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/api/version', { timeout: 3000 });
      return true;
    } catch {
      // Disponibilidad: cualquier fallo significa "no disponible"; no es un error que reportar.
      return false;
    }
  }
}
