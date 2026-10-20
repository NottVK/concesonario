import { isIP } from 'node:net';

/**
 * ¿Es una dirección que NUNCA debe alcanzar la salida A2A? Funciones puras, sin red. La regla es una lista cerrada de lo
 * permitido para IPv6 (solo unicast global 2000::/3 menos las reservas) y una lista de lo prohibido para IPv4.
 * Las formas raras de escribir una IP (decimal, hexadecimal, octal, mapeada) las normaliza antes el parser WHATWG de
 * `URL` o `parseIPv6`, así que aquí solo llegan direcciones canónicas.
 */

type V4 = [number, number, number, number];

/** [prefijo, bits]: 0.0.0.0/8 … Cada entrada es un bloque que no es de Internet público. */
const FORBIDDEN_V4: [V4, number][] = [
  [[0, 0, 0, 0], 8], // «esta red» y 0.0.0.0
  [[10, 0, 0, 0], 8], // privada
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local y metadata de la nube (169.254.169.254)
  [[172, 16, 0, 0], 12], // privada
  [[192, 0, 0, 0], 24], // protocolos IETF
  [[192, 0, 2, 0], 24], // documentación
  [[192, 88, 99, 0], 24], // 6to4 relay
  [[192, 168, 0, 0], 16], // privada
  [[198, 18, 0, 0], 15], // pruebas de rendimiento
  [[198, 51, 100, 0], 24], // documentación
  [[203, 0, 113, 0], 24], // documentación
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reservada y 255.255.255.255
];

const toNumber = (octets: V4): number => ((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3];

export function parseIPv4(text: string): V4 | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return null;
  const octets = match.slice(1).map(Number) as V4;
  return octets.every((octet) => octet <= 255) ? octets : null;
}

export function isForbiddenIPv4(octets: V4): boolean {
  const value = toNumber(octets);
  return FORBIDDEN_V4.some(([prefix, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(toNumber(prefix) / size);
  });
}

/** Ocho grupos de 16 bits de una IPv6 (acepta `::` y un IPv4 incrustado al final). null si no es una IPv6 válida. */
export function parseIPv6(raw: string): number[] | null {
  const text = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(text) !== 6) return null;
  const zone = text.indexOf('%');
  if (zone !== -1) return null; // los identificadores de zona (`fe80::1%eth0`) no son un destino público
  let head = text;
  let tail: string[] = [];
  const doubleColon = text.indexOf('::');
  if (doubleColon !== -1) {
    head = text.slice(0, doubleColon);
    tail = text.slice(doubleColon + 2) === '' ? [] : text.slice(doubleColon + 2).split(':');
  }
  const headParts = head === '' ? [] : head.split(':');
  const expandV4 = (parts: string[]): string[] | null => {
    const last = parts[parts.length - 1];
    if (last === undefined || !last.includes('.')) return parts;
    const octets = parseIPv4(last);
    if (!octets) return null;
    return [...parts.slice(0, -1), ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
  };
  const left = expandV4(headParts);
  const right = doubleColon === -1 ? [] : expandV4(tail);
  if (!left || !right) return null;
  const parts = doubleColon === -1 ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  if (parts.length !== 8) return null;
  const groups = parts.map((part) => parseInt(part, 16));
  return groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

const v4Of = (high: number, low: number): V4 => [high >> 8, high & 0xff, low >> 8, low & 0xff];

export function isForbiddenIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  // IPv4 mapeado (::ffff:a.b.c.d): vale lo que valga la IPv4 de adentro.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return isForbiddenIPv4(v4Of(g6, g7));
  // NAT64 (64:ff9b::/96): vale la IPv4 de adentro; 64:ff9b:1::/48 (uso local) está prohibido.
  if (g0 === 0x64 && g1 === 0xff9b) return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 ? isForbiddenIPv4(v4Of(g6, g7)) : true;
  // Solo unicast global (2000::/3): todo lo demás (::, ::1, IPv4 compatible, fc00::/7, fe80::/10, fec0::/10, ff00::/8…) fuera.
  if ((g0 & 0xe000) !== 0x2000) return true;
  if (g0 === 0x2001 && g1 < 0x0200) return true; // 2001::/23: protocolos IETF, Teredo (2001::/32), ORCHID…
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentación
  if (g0 === 0x2002) return true; // 6to4: lleva una IPv4 escondida
  if (g0 === 0x3fff && g1 < 0x1000) return true; // documentación (3fff::/20)
  return false;
}

/** true si la dirección (IPv4 o IPv6 en texto) está prohibida. Un texto que no es una IP también se considera prohibido. */
export function isForbiddenAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isForbiddenIPv4(v4);
  const v6 = parseIPv6(address);
  return v6 ? isForbiddenIPv6(v6) : true;
}
