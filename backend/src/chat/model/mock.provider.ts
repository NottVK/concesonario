import { defaultMockScript } from './mock-script.js';
import type { ChatRequest, ChatResponse, ModelProvider } from './model-provider.js';

/** Función que decide qué responde el mock; las pruebas inyectan la suya para forzar casos concretos. */
export type MockScript = (request: ChatRequest, calls: number) => ChatResponse | Promise<ChatResponse>;

/** Proveedor simulado: no usa red ni modelo; devuelve respuestas y llamadas a tools predecibles. */
export class MockProvider implements ModelProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock';
  readonly external = false;
  /** Cantidad de llamadas recibidas; las pruebas lo usan para comprobar que no se llamó al modelo. */
  calls = 0;
  /** Última petición recibida (para revisar qué contexto llegó al modelo). */
  lastRequest: ChatRequest | null = null;
  /** Guion actual; las pruebas pueden cambiarlo en caliente con `setScript`. */
  private script: MockScript;

  constructor(script: MockScript = defaultMockScript) {
    this.script = script;
  }

  setScript(script: MockScript): void {
    this.script = script;
  }

  resetScript(): void {
    this.script = defaultMockScript;
    this.calls = 0;
    this.lastRequest = null;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.calls += 1;
    this.lastRequest = request;
    if (request.signal?.aborted) throw new Error('cancelada');
    return this.script(request, this.calls);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
