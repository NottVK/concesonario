import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bots_externos')
export class ExternalBot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 80, unique: true })
  name: string;

  @Column({ name: 'url', type: 'varchar', length: 255 })
  url: string;

  /** API key del bot amigo; se guarda solo en BD y nunca se expone en la API. */
  @Column({ name: 'api_key', type: 'varchar', length: 255, nullable: true, select: false })
  apiKey: string | null;

  @Column({ name: 'activo', type: 'boolean', default: true })
  active: boolean;
}
