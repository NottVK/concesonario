import { HttpException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { allowedHosts, clientIp, hostOf } from '../mcp-http.js';
import { MCP_DEFAULTS } from '../mcp.config.js';
import { McpGatewayService } from './mcp-gateway.service.js';
import type { AuthenticatedBot } from './mcp-gateway.service.js';

/** Petición con el bot ya autenticado (lo pone `McpAuthGuard`). */
export type McpRequest = Request & { mcpBot?: AuthenticatedBot };

/** Respuesta de error con cuerpo FIJO: nada de lo que mandó el cliente vuelve en ella. */
function refuse(res: Response, status: number, message: string, headers: Record<string, string> = {}): never {
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  throw new HttpException({ statusCode: status, message }, status);
}

/**
 * Primer filtro, ANTES de leer el cuerpo y de mirar la key. Orden: IP y tope global → Content-Type → Origin y Host →
 * tamaño anunciado. Un fallo aquí no revela nada sobre las keys.
 */
@Injectable()
export class McpPreAuthGuard implements CanActivate {
  private readonly hosts = allowedHosts();

  constructor(private readonly gateway: McpGatewayService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<McpRequest>();
    const res = http.getResponse<Response>();

    const gate = this.gateway.enter(clientIp(req));
    if (!gate.ok) refuse(res, 429, 'Demasiadas peticiones', { 'Retry-After': String(gate.retryAfterSeconds) });
    // Libera el cupo de "peticiones simultáneas" cuando termina la respuesta (o se corta la conexión).
    res.once('close', gate.release);

    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) refuse(res, 415, 'El tipo de contenido debe ser application/json');
    // Son llamadas de servidor a servidor: un navegador (que siempre manda Origin) no debe usar este servidor.
    if (req.headers.origin !== undefined) refuse(res, 403, 'Origen no permitido');
    const host = hostOf(req.headers.host);
    if (!host || !this.hosts.has(host)) refuse(res, 403, 'Host no permitido');
    const announced = req.headers['content-length'];
    if (announced !== undefined && (!/^\d{1,10}$/.test(announced) || Number(announced) > MCP_DEFAULTS.maxBodyBytes)) {
      res.setHeader('Connection', 'close');
      refuse(res, 413, 'La petición es demasiado grande');
    }
    return true;
  }
}

/**
 * Autentica la key del bot y aplica su cuota. Todos los fallos de autenticación dan EXACTAMENTE la misma respuesta
 * (mismo código, cuerpo y cabeceras): key falsa, mal formada, ausente, prefijo inexistente o bot desactivado. El 401
 * sale antes de leer el cuerpo, así que tampoco se devuelve el `id` de la petición JSON-RPC.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly gateway: McpGatewayService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<McpRequest>();
    const res = http.getResponse<Response>();

    const bot = await this.gateway.authenticate(req.headers.authorization, clientIp(req));
    if (!bot) {
      res.setHeader('Connection', 'close');
      refuse(res, 401, 'Credenciales no válidas', { 'WWW-Authenticate': 'Bearer realm="automax-mcp"' });
    }
    const quota = await this.gateway.checkQuota(bot);
    if (!quota.ok) refuse(res, 429, 'Límite de uso alcanzado', { 'Retry-After': String(quota.retryAfterSeconds) });
    req.mcpBot = bot;
    return true;
  }
}
