import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { parseArguments, toProviderError } from './http-errors.js';
import type { ChatMessage, ChatRequest, ChatResponse, ModelProvider, ToolCall } from './model-provider.js';

export interface OllamaConfig {
  host: string;
  model: string;
  numCtx: number;
  keepAlive: string;
  timeoutMs: number;
  /** Nivel de razonamiento (gpt-oss). Sin valor no se envía: los modelos que no piensan (qwen) lo rechazarían. */
  think?: 'low' | 'medium' | 'high';
}

interface OllamaWireMessage {
  role?: string;
  content?: string;
  /** Razonamiento de gpt-oss: se descarta SIEMPRE (no llega al usuario, ni al historial, ni a otro prompt). */
  thinking?: string;
  tool_calls?: { function?: { name?: string; arguments?: unknown } }[];
}

function toWire(message: ChatMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.toolCalls?.length) {
    base.tool_calls = message.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.arguments } }));
  }
  if (message.role === 'tool' && message.toolName) base.tool_name = message.toolName;
  return base;
}

function fromWire(message: OllamaWireMessage | undefined): ChatResponse {
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call, index) => {
    const parsed = parseArguments(call.function?.arguments);
    return {
      id: `ollama-${index}`,
      name: call.function?.name ?? '',
      arguments: parsed.value,
      ...(parsed.invalid ? { invalidArguments: true } : {}),
    };
  });
  return { content: message?.content ?? '', toolCalls };
}

/** Proveedor local: habla con Ollama en `OLLAMA_HOST` (esta máquina o la de un compañero). */
export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama' as const;
  readonly external = false;
  readonly model: string;
  private readonly http: AxiosInstance;

  constructor(private readonly config: OllamaConfig) {
    this.model = config.model;
    // Sin redirecciones: un host malicioso no puede mandar el tráfico a otro lado.
    this.http = axios.create({ baseURL: config.host, timeout: config.timeoutMs, maxRedirects: 0 });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { data } = await this.http.post<{ message?: OllamaWireMessage }>(
        '/api/chat',
        {
          model: this.config.model,
          messages: request.messages.map(toWire),
          ...(request.tools?.length ? { tools: request.tools.map((t) => ({ type: 'function', function: t })) } : {}),
          stream: false,
          keep_alive: this.config.keepAlive,
          ...(this.config.think ? { think: this.config.think } : {}),
          options: { num_ctx: this.config.numCtx, temperature: 0, seed: 42 },
        },
        { signal: request.signal },
      );
      return fromWire(data.message);
    } catch (error) {
      throw toProviderError(error, 'ollama');
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
