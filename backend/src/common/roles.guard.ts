import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../usuarios/entities/user.entity.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';

/** Verifica el rol del token contra @Roles(). Sin @Roles() basta con estar autenticado. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
