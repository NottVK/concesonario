import { Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { sanitizeText } from './text.js';

/**
 * Cliente genérico de un MCP EXTERNO (otra IP y otro puerto) con el SDK oficial: Streamable HTTP y token Bearer.
 * Lo usa el taller (decisión 131) y lo usarán los siguientes MCP con su propia `XXX_MCP_URL` y `XXX_MCP_TOKEN`.
 * La URL sale solo de la configuración, nunca de un mensaje; no sigue redirecciones. El SDK maneja su propio
 * transporte, así que aquí no se usa Axios (decisión 130).
 */
export interface RemoteMcpConfig {
  url: URL;
  token: string;
}

/** Error de negocio del MCP remoto (`isError: true`): no se reintenta; su mensaje (saneado) se le explica al cliente. */
export class RemoteToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteToolError';
  }
}

/** El MCP remoto no respondió a tiempo o respondió algo que no cumple el contrato. */
export class RemoteUnavailableError extends Error {
  constructor(message = 'El servicio externo no respondió') {
    super(message);
    this.name = 'RemoteUnavailableError';
  }
}

export class RemoteMcpClient {
  private readonly logger: Logger;
  private client: Client | null = null;

  constructor(
    private readonly label: string,
    private readonly config: RemoteMcpConfig,
    private readonly connectTimeoutMs = 15_000,
  ) {
    this.logger = new Logger(`RemoteMcp:${label}`);
  }

  /** Llama una herramienta del MCP remoto y devuelve sus datos (sin validar: eso lo hace quien llama, con zod). */
  async call(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const started = Date.now();
    let result: unknown;
    try {
      const client = await this.connect();
      result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    } catch (error) {
      // Solo el nombre del error y el tiempo: el mensaje podría traer la URL o cabeceras.
      this.logger.warn(`${name} falló a los ${Date.now() - started} ms (${error instanceof Error ? error.name : 'error'})`);
      await this.reset();
      throw new RemoteUnavailableError();
    }
    return readResult(result);
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: 'automax-concesionario', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(this.config.url, {
      requestInit: { headers: { Authorization: `Bearer ${this.config.token}` }, redirect: 'error' },
    });
    await client.connect(transport, { timeout: this.connectTimeoutMs });
    this.client = client;
    return client;
  }

  private async reset(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch((error: unknown) => this.logger.debug(`Cerrando la conexión con ${this.label}: ${error instanceof Error ? error.name : 'error'}`));
  }
}

/** `isError: true` es un error de negocio (mensaje en content[0].text); si no, los datos en structuredContent o en JSON. */
export function readResult(result: unknown): unknown {
  const value = (result ?? {}) as { isError?: unknown; content?: unknown; structuredContent?: unknown };
  const first = Array.isArray(value.content) ? (value.content[0] as { text?: unknown } | undefined) : undefined;
  const text = typeof first?.text === 'string' ? first.text : '';
  if (value.isError === true) throw new RemoteToolError(sanitizeText(text, 300) || 'El servicio externo rechazó la solicitud');
  if (value.structuredContent && typeof value.structuredContent === 'object') return value.structuredContent;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RemoteUnavailableError('La respuesta del servicio externo no es JSON');
  }
}
