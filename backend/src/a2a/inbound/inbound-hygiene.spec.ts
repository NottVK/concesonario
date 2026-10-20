import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** Decisión 108: la A2A entrante no puede tocar el modelo, los embeddings, el chat ni la salida. */
describe('higiene de imports de la A2A entrante', () => {
  const files = readdirSync(here).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

  it('hay archivos que revisar', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)('%s no importa chat, embeddings, ollama, axios, http ni la salida', (file) => {
    const imports = [...readFileSync(join(here, file), 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
    const forbidden = imports.filter(
      (target) => /(^|\/)(chat|embeddings|outbound)(\/|$)/.test(target) || /ollama|groq|axios|^node:(http|https|net|dns|tls)$|^https?$/.test(target),
    );
    expect(forbidden).toEqual([]);
  });
});
