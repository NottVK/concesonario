import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Bots de prueba para los e2e de la A2A saliente. Usan EXACTAMENTE el mismo código que la demo
 * (`chatbot/a2a-demo/bots.mjs`), pero con puertos efímeros: lo que se prueba aquí es lo que se ve en la demo.
 * Se importan por ruta dinámica (no por import estático) para que el código de la demo quede fuera del `rootDir`
 * de TypeScript y, por tanto, fuera del build de Nest.
 */

const here = dirname(fileURLToPath(import.meta.url));
const DEMO_MODULE = pathToFileURL(join(here, '..', '..', '..', 'chatbot', 'a2a-demo', 'bots.mjs')).href;

export interface ReceivedTask {
  scheme: 'bearer' | 'x-api-key' | 'none';
  keyOk: boolean;
  contentType: string | null;
  body: string;
}

export interface MaliciousHits {
  internal: number;
  modes: Record<string, number>;
  withAuthorization: number;
  withApiKeyHeader: number;
}

interface DemoModule {
  LOOPBACK: string;
  FRIEND_DEFAULT_KEY: string;
  MALICIOUS_TASK_MODES: string[];
  MALICIOUS_CARD_MODES: string[];
  assertDevelopmentEnvironment(options?: { env?: Record<string, string | undefined>; inDocker?: boolean }): void;
  runningInDocker(env?: Record<string, string | undefined>, exists?: (path: string) => boolean, read?: (path: string) => string): boolean;
  bindLocal(server: Server, port?: number): Promise<number>;
  closeServer(server: Server): Promise<void>;
  createFriendBot(options?: { key?: string; authMode?: 'bearer' | 'x_api_key'; name?: string }): { server: Server; received: ReceivedTask[]; key: string };
  createMaliciousBot(): { server: Server; hits: MaliciousHits; setCardMode(mode: string): void };
}

export const loadDemo = (): Promise<DemoModule> => import(/* @vite-ignore */ DEMO_MODULE) as Promise<DemoModule>;

export interface RunningFriend {
  /** URL base A2A registrada en el panel (`http://127.0.0.1:<puerto>/a2a`). */
  url: string;
  /** `127.0.0.1:<puerto>`, tal como se escribe en A2A_DEV_ALLOWED_TARGETS. */
  target: string;
  key: string;
  received: ReceivedTask[];
}

export interface RunningMalicious {
  /** URL base del bot (sin modo). */
  base: string;
  target: string;
  /** URL A2A registrada para un modo de ataque: `http://127.0.0.1:<puerto>/<modo>/a2a`. */
  urlFor(mode: string): string;
  hits: MaliciousHits;
  /** Modo de la tarjeta de la RAÍZ (`/.well-known/agent.json`, la que lee «Probar conexión»): `card-ok` o cualquiera de `cardModes`. */
  setCardMode(mode: string): void;
}

export interface FakeBots {
  friend: RunningFriend;
  malicious: RunningMalicious;
  taskModes: string[];
  cardModes: string[];
  close(): Promise<void>;
}

/** Levanta el bot amigo y el malicioso en puertos libres de 127.0.0.1. */
export async function startFakeBots(options: { friendKey?: string; authMode?: 'bearer' | 'x_api_key' } = {}): Promise<FakeBots> {
  const demo = await loadDemo();
  const friend = demo.createFriendBot({ ...(options.friendKey ? { key: options.friendKey } : {}), ...(options.authMode ? { authMode: options.authMode } : {}) });
  const evil = demo.createMaliciousBot();
  const friendPort = await demo.bindLocal(friend.server, 0);
  const evilPort = await demo.bindLocal(evil.server, 0);
  const host = demo.LOOPBACK;
  return {
    friend: { url: `http://${host}:${friendPort}/a2a`, target: `${host}:${friendPort}`, key: friend.key, received: friend.received },
    malicious: {
      base: `http://${host}:${evilPort}`,
      target: `${host}:${evilPort}`,
      urlFor: (mode) => `http://${host}:${evilPort}/${mode}/a2a`,
      hits: evil.hits,
      setCardMode: (mode) => evil.setCardMode(mode),
    },
    taskModes: demo.MALICIOUS_TASK_MODES,
    cardModes: demo.MALICIOUS_CARD_MODES,
    close: async () => {
      await Promise.all([demo.closeServer(friend.server), demo.closeServer(evil.server)]);
    },
  };
}
