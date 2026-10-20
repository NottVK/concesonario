import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage, Server } from 'node:http';
import { MCP_DEFAULTS } from './mcp.config.js';

/** Ruta del servidor MCP dentro de la API (el prefijo global `api` ya va incluido). */
export const MCP_PATH = '/api/mcp';

/** Rutas A2A (FUERA del prefijo `api`, decisión 111): la tarjeta pública del bot y la recepción de tareas. */
export const A2A_TASKS_PATH = '/a2a/tasks';
export const AGENT_CARD_PATH = '/.well-known/agent.json';

const isPathOf = (url: string | undefined, path: string): boolean =>
  url === path || url?.startsWith(`${path}/`) === true || url?.startsWith(`${path}?`) === true;

/** Rutas cuyo cuerpo NO lee el parser global sino el propio controlador, con tope, después de autenticar. */
const isBotBodyPath = (url: string | undefined): boolean => isPathOf(url, MCP_PATH) || isPathOf(url, A2A_TASKS_PATH);

function allowOnly(app: INestApplication, path: string, allow: string[]): void {
  app.use(path, (req: Request, res: Response, next: NextFunction) => {
    if (allow.includes(req.method)) return next();
    res.setHeader('Allow', allow.join(', '));
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ statusCode: 405, message: 'Método no permitido' });
    return undefined;
  });
}

/** Lee el cuerpo contando los bytes REALES recibidos (no solo Content-Length): null si pasa el tope. */
export async function readBody(req: Request, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const piece = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += piece.length;
    if (size > maxBytes) return null;
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}

/**
 * Reglas HTTP de los canales de bots que deben ir ANTES de que Nest procese la petición:
 * - Solo se acepta POST en /api/mcp y /a2a/tasks (y GET o HEAD en la tarjeta): el resto responde 405 sin tocar la autenticación.
 * - El cuerpo de /api/mcp y de /a2a/tasks NO lo lee el parser global (que aceptaría hasta 100 KB antes de saber quién
 *   llama): lo lee el propio controlador, con tope de 16 KB, después de autenticar.
 */
export function applyMcpHttpRules(app: INestApplication): void {
  const express = app as NestExpressApplication;
  express.useBodyParser('json', {
    type: (req: IncomingMessage) => !isBotBodyPath(req.url) && /^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? ''),
  });
  // Nest vuelve a registrar por su cuenta el parser urlencoded (100 KB, antes del router y por tanto antes de la
  // autenticación): también se le quita el cuerpo de estas rutas. Ahí solo se lee JSON, y lo lee el controlador.
  express.useBodyParser('urlencoded', {
    extended: true,
    type: (req: IncomingMessage) => !isBotBodyPath(req.url) && /^application\/x-www-form-urlencoded\s*(;|$)/i.test(req.headers['content-type'] ?? ''),
  });
  allowOnly(app, MCP_PATH, ['POST']);
  allowOnly(app, A2A_TASKS_PATH, ['POST']);
  allowOnly(app, AGENT_CARD_PATH, ['GET', 'HEAD']);
}

/** Contra conexiones lentas (slowloris): cabeceras y petición completa con plazo, keep-alive corto. */
export function applyServerTimeouts(server: Server): void {
  server.headersTimeout = MCP_DEFAULTS.headersTimeoutMs;
  server.requestTimeout = MCP_DEFAULTS.requestTimeoutMs;
  server.keepAliveTimeout = MCP_DEFAULTS.keepAliveTimeoutMs;
}

/** Hosts aceptados en la cabecera Host (protección contra DNS rebinding). Se agregan con MCP_ALLOWED_HOSTS (separados por coma). */
export function allowedHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = (env.MCP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]{1,253}$/.test(host));
  // El host de la URL pública del bot (la de la tarjeta A2A) es, por definición, uno de los nuestros.
  const publicHost = publicBaseHost(env.A2A_PUBLIC_BASE_URL);
  return new Set(['localhost', '127.0.0.1', '::1', ...extra, ...(publicHost ? [publicHost] : [])]);
}

function publicBaseHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^\[|\]$/g, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Nombre de host de una cabecera Host (sin puerto; `[::1]:8000` → `::1`). null si no es un host plausible. */
export function hostOf(header: string | undefined): string | null {
  if (!header || header.length > 300) return null;
  const match = /^(?:\[([0-9a-f:]+)\]|([a-z0-9.-]+))(?::\d{1,5})?$/i.exec(header.trim());
  const host = match?.[1] ?? match?.[2];
  return host ? host.toLowerCase() : null;
}

/** IP del cliente tal como la entrega Express (`req.ip`; depende de `trust proxy`), limpia para usarla en claves y logs. */
export function clientIp(req: Request): string {
  const raw = req.ip ?? req.socket?.remoteAddress ?? '';
  return /^[0-9a-f:.]{1,45}$/i.test(raw) ? raw.toLowerCase() : 'desconocida';
}
