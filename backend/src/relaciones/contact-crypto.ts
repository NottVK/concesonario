import { createHmac, hkdfSync } from 'node:crypto';
import { SecretBox } from '../mcp/keys/secret-box.js';
import { loadMcpSecrets } from '../mcp/mcp.config.js';

/** Datos personales de una relación: viajan siempre juntos y cifrados. */
export interface Contact {
  cedula: string;
  nombre: string;
  telefono: string;
}

export const CONTACT_CRYPTO = Symbol('CONTACT_CRYPTO');

/** Solo los dígitos: "39.765.432" y "39765432" son la misma cédula. */
export function normalizeCedula(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Cifrado de los datos de contacto y HMAC de la cédula (decisión 130). Las dos claves se derivan con HKDF de
 * BOT_KEY_ENCRYPTION_KEY con etiquetas propias, así no se reutiliza la clave de las keys de los bots.
 */
export class ContactCrypto {
  private readonly box: SecretBox;
  private readonly hmacKey: Buffer;

  constructor(masterKey: Buffer) {
    this.box = new SecretBox(derive(masterKey, 'automax:relaciones:contacto:v1'));
    this.hmacKey = derive(masterKey, 'automax:relaciones:cedula-hmac:v1');
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ContactCrypto {
    return new ContactCrypto(loadMcpSecrets(env).encryptionKey);
  }

  cedulaHmac(cedula: string): string {
    return createHmac('sha256', this.hmacKey).update(normalizeCedula(cedula)).digest('hex');
  }

  /** Ata el cifrado al id de la relación: un valor copiado a otra fila no descifra. */
  seal(relationId: string, contact: Contact): string {
    return this.box.encrypt(JSON.stringify(contact), `relacion:${relationId}`);
  }

  open(relationId: string, sealed: string): Contact {
    const value = JSON.parse(this.box.decrypt(sealed, `relacion:${relationId}`)) as Partial<Contact>;
    if (typeof value.cedula !== 'string' || typeof value.nombre !== 'string' || typeof value.telefono !== 'string') {
      throw new Error('Datos de contacto con un formato inesperado');
    }
    return { cedula: value.cedula, nombre: value.nombre, telefono: value.telefono };
  }
}

function derive(masterKey: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), label, 32));
}
