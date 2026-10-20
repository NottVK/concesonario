import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { BlockedTarget, OutboundFailure } from './errors.js';
import { isForbiddenAddress } from './ip-ranges.js';
import { devKey } from './outbound.config.js';
import type { OutboundSettings } from './outbound.config.js';

export type SettingsSource = () => OutboundSettings;
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** Todas las direcciones del nombre (A y AAAA), sin reordenar. */
export const dnsResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((record) => ({ address: record.address, family: record.family === 6 ? 6 : 4 }));

export interface CheckedTarget {
  /** URL ya normalizada por el parser WHATWG: es la que se usa para conectar (no el texto original). */
  url: URL;
  /** Nombre o IP literal, sin corchetes y en minúsculas. */
  hostname: string;
  port: number;
  literal: boolean;
  devAllowed: boolean;
}

export interface PinnedTarget {
  target: CheckedTarget;
  /** La IP ya validada a la que se conecta el socket. */
  address: string;
  family: 4 | 6;
}

/** Nombres que no son de Internet público. */
const FORBIDDEN_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa', 'onion', 'in-addr.arpa', 'ip6.arpa'];
const MAX_URL_CHARS = 255;

function isForbiddenName(hostname: string): boolean {
  if (!hostname.includes('.')) return true; // «intranet», «db», «metadata»: nombres de una sola etiqueta
  if (hostname.length > 253 || hostname.split('.').some((label) => label.length === 0 || label.length > 63)) return true;
  return FORBIDDEN_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/**
 * Política SSRF de la salida (decisión 112). `check` es síncrona y valida el texto de la URL; `pin` resuelve el DNS,
 * rechaza si CUALQUIERA de las direcciones está prohibida y devuelve la IP validada para que el socket se conecte a ESA
 * (anti DNS rebinding: no hay una segunda resolución entre la validación y la conexión).
 */
export class TargetPolicy {
  constructor(
    private readonly settings: SettingsSource,
    private readonly resolver: Resolver = dnsResolver,
  ) {}

  check(raw: unknown): CheckedTarget {
    const config = this.settings();
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_CHARS) throw new BlockedTarget('url');
    // El parser WHATWG borra en silencio tabuladores y saltos de línea y trata `\` como `/`: se rechazan de entrada.
    if (/[\u0000- \u007f-\u009f\\]/.test(raw)) throw new BlockedTarget('caracteres');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BlockedTarget('url');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BlockedTarget('esquema');
    if (url.username || url.password) throw new BlockedTarget('credenciales');
    if (url.hash || raw.includes('#')) throw new BlockedTarget('fragmento');
    if (url.search || raw.includes('?')) throw new BlockedTarget('consulta');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    if (!hostname) throw new BlockedTarget('host');
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (port < 1 || config.forbiddenPorts.has(port)) throw new BlockedTarget('puerto');

    const literal = isIP(hostname) !== 0;
    const devAllowed = literal && !config.production && config.devAllowed.has(devKey(hostname, port));
    if (url.protocol === 'http:' && !devAllowed) throw new BlockedTarget('http');
    if (literal) this.checkLiteral(hostname, config, devAllowed);
    else if (isForbiddenName(hostname)) throw new BlockedTarget('nombre');
    return { url, hostname, port, literal, devAllowed };
  }

  private checkLiteral(hostname: string, config: OutboundSettings, devAllowed: boolean): void {
    if (devAllowed) return;
    // Una IP literal no valida un certificado TLS y es la forma típica de saltarse un filtro de nombres: en producción no se acepta.
    if (config.production) throw new BlockedTarget('ip-literal');
    if (isForbiddenAddress(hostname)) throw new BlockedTarget('ip-privada');
  }

  async pin(target: CheckedTarget): Promise<PinnedTarget> {
    if (target.literal) return { target, address: target.hostname, family: isIP(target.hostname) === 6 ? 6 : 4 };
    let records: ResolvedAddress[];
    try {
      records = await this.resolver(target.hostname);
    } catch {
      throw new OutboundFailure(ExchangeStatus.REMOTE_ERROR, 'dns');
    }
    if (records.length === 0) throw new OutboundFailure(ExchangeStatus.REMOTE_ERROR, 'dns-vacio');
    // Una sola dirección prohibida entre todas basta para rechazar: si no, bastaría con que el nombre devolviera una pública primero.
    if (records.some((record) => isForbiddenAddress(record.address))) throw new BlockedTarget('dns-privada');
    const chosen = records[0]!;
    return { target, address: chosen.address, family: chosen.family };
  }
}
