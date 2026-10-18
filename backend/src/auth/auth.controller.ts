import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import type { LoginResult, PublicUser } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Límite estricto contra fuerza bruta: 5 intentos por minuto. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.me(user.id);
  }
}
