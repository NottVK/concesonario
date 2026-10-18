import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { LoginDto, LoginResultDto, PublicUserDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Límite estricto contra fuerza bruta: 5 intentos por minuto. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión (5 intentos por minuto)' })
  @ApiOkResponse({ type: LoginResultDto })
  login(@Body() dto: LoginDto): Promise<LoginResultDto> {
    return this.auth.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario de la sesión actual' })
  @ApiOkResponse({ type: PublicUserDto })
  me(@CurrentUser() user: AuthUser): Promise<PublicUserDto> {
    return this.auth.me(user.id);
  }
}
