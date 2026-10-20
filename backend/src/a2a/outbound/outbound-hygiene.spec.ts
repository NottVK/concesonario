import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const importsOf = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);

/** La salida A2A trata lo del otro bot como DATO: no puede tocar el modelo, el prompt, las tools del chat ni los embeddings. */
describe('higiene de imports de la A2A saliente', () => {
  const files = readdirSync(here).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

  it('hay archivos que revisar', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)('%s no importa chat, embeddings, ollama, el catálogo ni las tools', (file) => {
    const forbidden = importsOf(join(here, file)).filter((target) => /(^|\/)(chat|embeddings|catalogo|tools)(\/|$)/.test(target) || /ollama|groq/.test(target));
    expect(forbidden).toEqual([]);
  });

  it('solo la capa de red (secure-http, target-policy, ip-ranges y la configuración) toca node:http(s), dns, net o axios', () => {
    const network = /^(axios|node:(http|https|dns|dns\/promises|net|tls))$/;
    const offenders = files.filter((file) => importsOf(join(here, file)).some((target) => network.test(target)));
    expect(offenders.sort()).toEqual(['ip-ranges.ts', 'outbound.config.ts', 'secure-http.ts', 'target-policy.ts']);
  });

  it('quien usa axios en backend/src es una lista conocida: una conexión saliente nueva tiene que revisarse (y, si va a un bot, pasar por SecureHttp)', () => {
    const outside = walk(SRC)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.startsWith(here))
      .filter((file) => importsOf(file).some((target) => target === 'axios'))
      .map((file) => relative(SRC, file).replaceAll('\\', '/'))
      .sort();
    expect(outside).toEqual([
      'chat/api/public-api.client.ts', // la API propia (localhost)
      'chat/model/groq.provider.ts', // proveedores del modelo (Groq y Ollama)
      'chat/model/http-errors.ts',
      'chat/model/ollama.provider.ts',
      'embeddings/ollama-embedding.provider.ts',
    ]);
  });

  it('el chat solo conoce a a2a por el módulo (que provee la interfaz): nada de a2a/outbound ni de las entidades', () => {
    const chatFiles = walk(join(SRC, 'chat')).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
    const a2aImports = chatFiles.flatMap((file) => importsOf(file).filter((target) => /(^|\/)a2a(\/|$)/.test(target)).map((target) => `${relative(SRC, file).replaceAll('\\', '/')} -> ${target}`));
    expect(a2aImports).toEqual(['chat/chat.module.ts -> ../a2a/a2a.module.js']);
  });

  it('a2a importa del chat solo la interfaz (tools/other-bot) y solo desde el puente y el módulo', () => {
    const a2aFiles = walk(join(SRC, 'a2a')).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
    const fromChat = a2aFiles.flatMap((file) => importsOf(file).filter((target) => /(^|\/)chat(\/|$)/.test(target)).map((target) => `${relative(SRC, file).replaceAll('\\', '/')} -> ${target}`));
    expect(fromChat.sort()).toEqual(['a2a/a2a.module.ts -> ../chat/tools/other-bot.js', 'a2a/chat-bridge/other-bot.gateway.ts -> ../../chat/tools/other-bot.js']);
  });
});
