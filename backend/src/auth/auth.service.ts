import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../common/auth.types.js';
import { User } from '../usuarios/entities/user.entity.js';
import type { LoginDto } from './dto/login.dto.js';

// Hash válido de una contraseña aleatoria: se compara cuando el correo no existe
// para que la respuesta tarde igual y no revele qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync('contrasena-inexistente-no-usar', 10);

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: User['role'];
}

export interface LoginResult {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email: dto.email })
      .getOne();

    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new UnauthorizedException('Correo o contraseña incorrectos');

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user: this.toPublic(user) };
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.toPublic(user);
  }

  private toPublic(user: User): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
