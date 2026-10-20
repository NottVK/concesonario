/** Contrato común de los proveedores de modelo de chat (ollama, groq y mock). */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  /** Ollama no entrega ids; el proveedor genera uno estable dentro de la respuesta. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** true si el modelo mandó argumentos que no son un objeto JSON válido. */
  invalidArguments?: boolean;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Solo en mensajes `assistant`. */
  toolCalls?: ToolCall[];
  /** Solo en mensajes `tool`: a qué llamada responden. */
  toolCallId?: string;
  toolName?: string;
}

/** Definición de una tool en formato JSON Schema (el mismo para los tres proveedores). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Cancela la llamada (cliente desconectado o tiempo agotado). */
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
}

export const PROVIDER_NAMES = ['ollama', 'groq', 'mock'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface ModelProvider {
  /** Nombre del proveedor tal como se escribe en CHAT_PROVIDER. */
  readonly name: ProviderName;
  /** Modelo usado, para guardarlo junto al historial. */
  readonly model: string;
  /** true si el texto del usuario sale de este equipo hacia un servicio externo. */
  readonly external: boolean;
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** Comprobación barata de que el proveedor responde. Nunca lanza. */
  isAvailable(): Promise<boolean>;
}

/** Token de inyección de Nest. */
export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');

/** El proveedor no responde o rechazó la llamada. Mensaje seguro: nunca lleva claves ni cabeceras. */
export class ProviderUnavailableError extends Error {
  constructor(message = 'El proveedor del modelo no está disponible') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** La llamada superó el tiempo máximo. */
export class ProviderTimeoutError extends Error {
  constructor(message = 'El proveedor del modelo tardó demasiado') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

/** La llamada fue cancelada por quien la pidió. */
export class ProviderAbortedError extends Error {
  constructor() {
    super('La llamada al modelo fue cancelada');
    this.name = 'ProviderAbortedError';
  }
}
