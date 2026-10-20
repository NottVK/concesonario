import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX_V1 = 'enc:v1:';
const PREFIX_V2 = 'enc:v2:';

/**
 * Cifrado AES-256-GCM de las keys que NOSOTROS enviamos a otros bots (no se pueden guardar como hash porque hay que
 * enviarlas). Formato: `enc:v2:<iv>:<tag>:<texto cifrado>` en base64url, con AAD (datos adicionales autenticados):
 * el valor solo descifra con el mismo AAD con el que se cifró (`bot:<id>|<origen>`), así que una key copiada a otra
 * fila u otro origen falla. `enc:v1` (sin AAD) solo se lee para migrar y ya no se escribe. Un valor alterado o cifrado
 * con otra clave falla al descifrar (la etiqueta de GCM no coincide).
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('La clave AES debe ser de 32 bytes');
  }

  /** Cifra atando el valor al `aad` (obligatorio y no vacío). */
  encrypt(plain: string, aad: string): string {
    if (!aad) throw new Error('El cifrado exige AAD');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${PREFIX_V2}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  /** Lanza un error genérico (sin datos) si el valor no está cifrado con esta clave y este AAD, o fue alterado. */
  decrypt(stored: string, aad: string): string {
    const fail = (): never => {
      throw new Error('No se pudo descifrar la clave guardada');
    };
    const version = SecretBox.versionOf(stored);
    if (!version || (version === 2 && !aad)) return fail();
    const parts = stored.slice(PREFIX_V2.length).split(':');
    const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
    // Formato exacto: tres segmentos base64url canónicos, IV de 12 bytes, etiqueta de 16 y texto cifrado no vacío.
    const canonical = parts.length === 3 && parts.every((part, i) => [iv, tag, data][i]!.toString('base64url') === part);
    if (!canonical || iv!.length !== 12 || tag!.length !== 16 || data!.length === 0) return fail();
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv!);
      if (version === 2) decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag!);
      return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
    } catch {
      return fail();
    }
  }

  /** 1 = `enc:v1` (heredado, sin AAD), 2 = `enc:v2`, null = no es un valor cifrado. */
  static versionOf(value: string): 1 | 2 | null {
    if (value.startsWith(PREFIX_V2)) return 2;
    if (value.startsWith(PREFIX_V1)) return 1;
    return null;
  }

  static isEncrypted(value: string): boolean {
    return SecretBox.versionOf(value) !== null;
  }

  /** AAD de la key saliente de un bot: ata el valor a la fila y al origen (esquema + host + puerto) de su URL. */
  static aadFor(botId: number, url: string | null): string {
    return `bot:${botId}|${url ? originOf(url) : ''}`;
  }
}

/** Origen normalizado de una URL; si no se puede interpretar, queda vacío (y la key no descifrará nunca). */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
