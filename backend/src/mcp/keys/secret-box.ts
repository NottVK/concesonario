import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

/**
 * Cifrado AES-256-GCM de las keys que NOSOTROS enviamos a otros bots (Fase 6: no se pueden guardar como hash porque
 * hay que enviarlas). Formato: `enc:v1:<iv>:<tag>:<texto cifrado>` en base64url. Un valor alterado o cifrado con otra
 * clave falla al descifrar (la etiqueta de GCM no coincide).
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('La clave AES debe ser de 32 bytes');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  /** Lanza un error genérico (sin datos) si el valor no está cifrado con esta clave o fue alterado. */
  decrypt(stored: string): string {
    const fail = (): never => {
      throw new Error('No se pudo descifrar la clave guardada');
    };
    if (!stored.startsWith(PREFIX)) return fail();
    const [iv, tag, data] = stored.slice(PREFIX.length).split(':');
    if (!iv || !tag || !data) return fail();
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return fail();
    }
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }
}
