import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Bot amigo. Maneja DOS credenciales distintas:
 * - la que ÉL nos presenta (entrante, para el servidor MCP): solo prefijo y HMAC, la key en claro se muestra una vez;
 * - la que NOSOTROS le enviamos (saliente, Fase 6): hay que poder recuperarla, así que va cifrada con AES-256-GCM.
 */
@Entity('bots_externos')
export class ExternalBot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 80, unique: true })
  name: string;

  /** Dirección del bot para las llamadas salientes (Fase 6); un bot que solo nos consulta no la necesita. */
  @Column({ name: 'url', type: 'varchar', length: 255, nullable: true })
  url: string | null;

  /** Key saliente CIFRADA (`enc:v2:…`, atada a la fila y al origen de la URL); nunca se expone en la API. */
  @Column({ name: 'api_key_saliente', type: 'varchar', length: 255, nullable: true, select: false })
  outboundApiKey: string | null;

  /** Cómo se autentica NUESTRA llamada saliente: `Authorization: Bearer` o cabecera `X-API-Key` (decisión 115). */
  @Column({ name: 'auth_saliente', type: 'varchar', length: 12, default: 'bearer' })
  outboundAuth: 'bearer' | 'x_api_key';

  /** Máximo de llamadas salientes por minuto a este bot. */
  @Column({ name: 'limite_saliente_minuto', type: 'int', default: 10 })
  outboundLimitPerMinute: number;

  @Column({ name: 'activo', type: 'boolean', default: true })
  active: boolean;

  /** Prefijo público de la key entrante (8 hex): sirve para encontrar la fila. */
  @Column({ name: 'clave_prefijo', type: 'char', length: 8, nullable: true, unique: true })
  keyPrefix: string | null;

  /** HMAC-SHA256 (con pepper) de la key entrante. Nunca se expone. */
  @Column({ name: 'clave_hash', type: 'char', length: 64, nullable: true, select: false })
  keyHash: string | null;

  /** Versión del pepper con la que se calculó `clave_hash`. */
  @Column({ name: 'pepper_version', type: 'smallint', nullable: true, select: false })
  pepperVersion: number | null;

  @Column({ name: 'clave_rotada_en', type: 'timestamptz', nullable: true })
  keyRotatedAt: Date | null;

  @Column({ name: 'ultimo_uso_en', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'limite_minuto', type: 'int', default: 30 })
  limitPerMinute: number;

  @Column({ name: 'limite_diario', type: 'int', default: 2000 })
  limitPerDay: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
