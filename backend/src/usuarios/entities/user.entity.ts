import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  SELLER = 'vendedor',
  CUSTOMER = 'cliente',
}

@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'correo', type: 'varchar', length: 120, unique: true })
  email: string;

  /** Hash bcrypt de la contraseña; nunca se devuelve en las respuestas. */
  @Column({ name: 'hash', type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ name: 'rol', type: 'enum', enum: UserRole, enumName: 'rol_usuario_enum' })
  role: UserRole;
}
