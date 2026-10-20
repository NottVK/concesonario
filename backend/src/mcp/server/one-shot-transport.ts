import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';

/**
 * Transporte de UNA petición HTTP: el mensaje entra con `deliver` y lo que el servidor MCP responde se recoge con
 * `reply`. Así el servidor sin estado controla por completo el HTTP (códigos, cabeceras, tamaño, auditoría) y ningún
 * mensaje de error del transporte del SDK llega al bot.
 */
export class OneShotTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly waiting = new Map<RequestId, (message: JSONRPCMessage) => void>();

  async start(): Promise<void> {
    // Nada que abrir: no hay conexión persistente.
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if ('id' in message && message.id !== undefined) this.waiting.get(message.id)?.(message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  /** Entrega un mensaje al servidor y espera su respuesta (con plazo). null si no respondió a tiempo. */
  request(message: JSONRPCMessage & { id: RequestId }, timeoutMs: number): Promise<JSONRPCMessage | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(message.id);
        resolve(null);
      }, timeoutMs);
      this.waiting.set(message.id, (reply) => {
        clearTimeout(timer);
        this.waiting.delete(message.id);
        resolve(reply);
      });
      this.onmessage?.(message);
    });
  }
}
