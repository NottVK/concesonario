/** Contrato de los proveedores de embeddings (vectores para la búsqueda semántica de vehículos). */

export const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingProvider {
  /** Nombre del modelo; forma parte del hash para recalcular si cambia. */
  readonly model: string;
  /** `query` para lo que escribe la persona; `document` para el texto del vehículo. */
  embed(text: string, kind: 'query' | 'document', signal?: AbortSignal): Promise<number[]>;
  /** Comprobación barata de que el servicio responde. Nunca lanza. */
  isAvailable(): Promise<boolean>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/** El servicio de embeddings no respondió o devolvió algo inválido. */
export class EmbeddingUnavailableError extends Error {
  constructor(message = 'El servicio de embeddings no está disponible') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/** Literal de pgvector: `[0.1,0.2,…]`. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
