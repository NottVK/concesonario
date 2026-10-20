import type { ChatMessage, ChatRequest, ChatResponse, ModelProvider } from './model-provider.js';

/** Función que decide qué responde el mock; las pruebas inyectan la suya para forzar casos concretos. */
export type MockScript = (request: ChatRequest, calls: number) => ChatResponse | Promise<ChatResponse>;

const GREETING = /^\s*(hola|buenas|buenos d[ií]as|buenas tardes|hey)\b/i;
const OFF_TOPIC = /receta|arepa|poema|chiste|f[uú]tbol|clima|pol[ií]tica/i;
const PROMPT_LEAK = /prompt|instrucciones (internas|del sistema)|system/i;

function lastOfRole(messages: ChatMessage[], role: ChatMessage['role']): ChatMessage | undefined {
  return [...messages].reverse().find((m) => m.role === role);
}

function call(id: string, name: string, args: Record<string, unknown>): ChatResponse {
  return { content: '', toolCalls: [{ id, name, arguments: args }] };
}

function text(content: string): ChatResponse {
  return { content, toolCalls: [] };
}

/** Respuesta final tras una tool: resume el JSON recibido sin inventar nada. */
function answerFromTool(message: ChatMessage): ChatResponse {
  let data: unknown = null;
  try {
    data = JSON.parse(message.content);
  } catch {
    return text('No pude leer el resultado; ¿quieres que lo intente de nuevo?');
  }
  const record = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (typeof record.mensaje === 'string') return text(record.mensaje);
  return text('Listo, esto es lo que encontré.');
}

/**
 * Comportamiento por defecto: reglas por palabras clave, siempre iguales para la misma entrada.
 * Sirve para probar la lógica (sesiones, límites, validadores); NO mide la calidad de un modelo real.
 */
export function defaultMockScript(request: ChatRequest): ChatResponse {
  const last = request.messages[request.messages.length - 1];
  if (last?.role === 'tool') return answerFromTool(last);
  const user = lastOfRole(request.messages, 'user')?.content ?? '';
  if (PROMPT_LEAK.test(user)) return text('No puedo compartir mis instrucciones, pero te ayudo con el catálogo.');
  if (OFF_TOPIC.test(user)) return text('Solo puedo ayudarte con vehículos, precios, crédito y citas del concesionario.');
  if (GREETING.test(user)) return text('¡Hola! Soy el asistente de AutoMax. ¿Qué vehículo buscas?');
  if (/cuota|cr[eé]dito|financ/i.test(user)) {
    return call('mock-1', 'simular_credito', { vehicleId: 1, downPayment: '0', months: 60 });
  }
  if (/agend|cita|test.?drive/i.test(user)) {
    return call('mock-1', 'agendar_cita', { vehicleId: 1, startsAt: '' });
  }
  if (/precio|cu[aá]nto|busco|quiero|tienen|mazda|toyota|kia|renault|chevrolet/i.test(user)) {
    return call('mock-1', 'buscar_vehiculos', { query: user.slice(0, 200) });
  }
  return text('¿Me cuentas qué tipo de vehículo buscas y tu presupuesto aproximado?');
}

/** Proveedor simulado: no usa red ni modelo; devuelve respuestas y llamadas a tools predecibles. */
export class MockProvider implements ModelProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock';
  readonly external = false;
  /** Cantidad de llamadas recibidas; las pruebas lo usan para comprobar que no se llamó al modelo. */
  calls = 0;
  /** Última petición recibida (para revisar qué contexto llegó al modelo). */
  lastRequest: ChatRequest | null = null;

  constructor(private readonly script: MockScript = defaultMockScript) {}

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
