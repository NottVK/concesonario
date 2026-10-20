import axios, { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { parseArguments, toProviderError } from './http-errors.js';
import { ProviderAbortedError, ProviderUnavailableError } from './model-provider.js';
import type { ChatMessage, ChatRequest, ChatResponse, ModelProvider, ToolCall } from './model-provider.js';

const MAX_RATE_LIMIT_RETRIES = 3;
/** Esperas más largas que esto no se aguardan: el turno tiene un tope de 90 s. */
const MAX_RETRY_WAIT_MS = 20_000;

/** Milisegundos a esperar si el error es un 429 con `Retry-After` razonable; null si no hay que reintentar. */
export function rateLimitWaitMs(error: unknown): number | null {
  if (!isAxiosError(error) || error.response?.status !== 429) return null;
  const seconds = Number(error.response.headers?.['retry-after']);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const wait = Math.ceil(seconds * 1000) + 200;
  return wait <= MAX_RETRY_WAIT_MS ? wait : null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderAbortedError());
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ProviderAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export interface GroqConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Solo para pruebas con un servidor local; en uso real siempre `GROQ_BASE_URL`. */
  baseUrl?: string;
}

interface GroqWireMessage {
  content?: string | null;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
}

function toWire(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content };
  }
  const base: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.toolCalls?.length) {
    base.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
  }
  return base;
}

function fromWire(message: GroqWireMessage | undefined): ChatResponse {
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call, index) => {
    const parsed = parseArguments(call.function?.arguments);
    return {
      id: call.id ?? `groq-${index}`,
      name: call.function?.name ?? '',
      arguments: parsed.value,
      ...(parsed.invalid ? { invalidArguments: true } : {}),
    };
  });
  return { content: message?.content ?? '', toolCalls };
}

/**
 * Proveedor externo para evaluar con un modelo real. El texto del usuario sale hacia Groq, por eso
 * `external = true` y el widget lo avisa. La clave viene solo de GROQ_API_KEY; no se registra jamás.
 */
export class GroqProvider implements ModelProvider {
  readonly name = 'groq' as const;
  readonly external = true;
  readonly model: string;
  private readonly http: AxiosInstance;

  constructor(private readonly config: GroqConfig) {
    if (!config.apiKey.trim()) throw new ProviderUnavailableError('groq: falta GROQ_API_KEY');
    this.model = config.model;
    this.http = axios.create({
      baseURL: config.baseUrl ?? GROQ_BASE_URL,
      timeout: config.timeoutMs,
      maxRedirects: 0,
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  }

  /**
   * Una llamada. El plan gratuito de Groq limita por minuto (peticiones y tokens): ante un 429 con `Retry-After`
   * corto se espera ese tiempo (cancelable) y se reintenta hasta 3 veces antes de rendirse.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.post(request);
      } catch (error) {
        const wait = rateLimitWaitMs(error);
        if (wait === null || attempt >= MAX_RATE_LIMIT_RETRIES) throw toProviderError(error, 'groq');
        await sleep(wait, request.signal);
      }
    }
  }

  private async post(request: ChatRequest): Promise<ChatResponse> {
    const { data } = await this.http.post<{ choices?: { message?: GroqWireMessage }[] }>(
      '/chat/completions',
      {
        model: this.config.model,
        messages: request.messages.map(toWire),
        ...(request.tools?.length ? { tools: request.tools.map((t) => ({ type: 'function', function: t })) } : {}),
        temperature: 0,
        seed: 42,
        max_tokens: 400,
      },
      { signal: request.signal },
    );
    return fromWire(data.choices?.[0]?.message);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/models', { timeout: 5000 });
      return true;
    } catch {
      // Disponibilidad: cualquier fallo significa "no disponible"; no es un error que reportar.
      return false;
    }
  }
}
