import { GroqProvider } from './groq.provider.js';
import { MockProvider } from './mock.provider.js';
import { PROVIDER_NAMES } from './model-provider.js';
import type { ModelProvider, ProviderName } from './model-provider.js';
import { OllamaProvider } from './ollama.provider.js';

type Env = Record<string, string | undefined>;

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
const KEEP_ALIVE = /^(-1|0|\d{1,4}[smh])$/;
const CALL_TIMEOUT_MS = 60_000;
/** Ollama: plazo por llamada. gpt-oss:20b razona antes de contestar y en frío tarda ~45 s en cargar. */
const OLLAMA_DEFAULT_TIMEOUT_MS = 180_000;
export const OLLAMA_DEFAULT_MODEL = 'gpt-oss:20b';
const THINK_LEVELS = ['low', 'medium', 'high'] as const;
export type ThinkLevel = (typeof THINK_LEVELS)[number];

function parseProviderName(raw: string | undefined): ProviderName {
  const value = (raw ?? 'ollama').trim().toLowerCase();
  if (!(PROVIDER_NAMES as readonly string[]).includes(value)) {
    throw new Error(`CHAT_PROVIDER debe ser uno de: ${PROVIDER_NAMES.join(', ')} (recibido: "${raw}")`);
  }
  return value as ProviderName;
}

function parseModel(raw: string | undefined, fallback: string, variable: string): string {
  const value = raw?.trim() || fallback;
  if (!MODEL_NAME.test(value)) throw new Error(`${variable} no es un nombre de modelo válido`);
  return value;
}

function parseHost(raw: string | undefined): string {
  const value = raw?.trim() || 'http://localhost:11434';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OLLAMA_HOST debe ser una URL, por ejemplo http://localhost:11434');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('OLLAMA_HOST debe empezar por http:// o https://');
  }
  return value.replace(/\/+$/, '');
}

function parseNumCtx(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 8192;
  const value = /^\d{3,5}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(value) || value < 512 || value > 32_768) {
    throw new Error('OLLAMA_NUM_CTX debe ser un entero entre 512 y 32768');
  }
  return value;
}

function parseKeepAlive(raw: string | undefined): string {
  const value = raw?.trim() || '5m';
  if (!KEEP_ALIVE.test(value)) throw new Error('OLLAMA_KEEP_ALIVE debe ser como 5m, 30s, 1h, 0 o -1');
  return value;
}

/** Nivel de razonamiento de los modelos que piensan (gpt-oss). Vacío = no se envía (lo decide Ollama). */
function parseThink(raw: string | undefined): ThinkLevel | undefined {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '') return undefined;
  if (!(THINK_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`OLLAMA_THINK debe ser vacío o uno de: ${THINK_LEVELS.join(', ')}`);
  }
  return value as ThinkLevel;
}

function parseOllamaTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return OLLAMA_DEFAULT_TIMEOUT_MS;
  const value = /^\d{4,6}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(value) || value < 10_000 || value > 300_000) {
    throw new Error('OLLAMA_TIMEOUT_MS debe ser un entero entre 10000 y 300000 (milisegundos)');
  }
  return value;
}

/**
 * Elige el proveedor con `CHAT_PROVIDER` (ollama por defecto). Una configuración mala NO se corrige en
 * silencio: la API no arranca y dice qué variable falla (sin imprimir nunca el valor de la clave).
 */
export function createModelProvider(env: Env = process.env): ModelProvider {
  const name = parseProviderName(env.CHAT_PROVIDER);
  if (name === 'mock') return new MockProvider();
  if (name === 'groq') {
    const apiKey = env.GROQ_API_KEY?.trim();
    if (!apiKey || apiKey.startsWith('pon_aqui')) {
      throw new Error('CHAT_PROVIDER=groq exige GROQ_API_KEY en el .env (ver .env.example)');
    }
    return new GroqProvider({
      apiKey,
      model: parseModel(env.GROQ_MODEL, 'llama-3.3-70b-versatile', 'GROQ_MODEL'),
      timeoutMs: CALL_TIMEOUT_MS,
    });
  }
  return new OllamaProvider({
    host: parseHost(env.OLLAMA_HOST),
    model: parseModel(env.OLLAMA_MODEL, OLLAMA_DEFAULT_MODEL, 'OLLAMA_MODEL'),
    numCtx: parseNumCtx(env.OLLAMA_NUM_CTX),
    keepAlive: parseKeepAlive(env.OLLAMA_KEEP_ALIVE),
    timeoutMs: parseOllamaTimeout(env.OLLAMA_TIMEOUT_MS),
    think: parseThink(env.OLLAMA_THINK),
  });
}
