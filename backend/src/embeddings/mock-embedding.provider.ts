import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS } from './embedding-provider.js';
import type { EmbeddingProvider } from './embedding-provider.js';

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

/**
 * Embeddings simulados para las pruebas: bolsa de palabras con hash a 768 dimensiones, normalizada. Textos
 * con palabras en común se parecen; sin palabras en común, la similitud es 0. Predecible y sin red.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'mock-embed';
  available = true;
  calls = 0;

  async embed(text: string): Promise<number[]> {
    this.calls += 1;
    if (!this.available) throw new Error('mock apagado');
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
    for (const token of tokens(text)) {
      const digest = createHash('sha256').update(token).digest();
      vector[digest.readUInt16BE(0) % EMBEDDING_DIMENSIONS]! += digest[2]! % 2 === 0 ? 1 : -1;
    }
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
    return vector.map((x) => x / norm);
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}
