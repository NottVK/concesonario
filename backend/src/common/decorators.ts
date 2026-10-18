import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { CustomDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../usuarios/entities/user.entity.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marca una ruta como abierta: no exige token. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe la ruta a los roles indicados (se verifica en el backend). */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error('CurrentUser usado en una ruta sin autenticación');
    }
    return request.user;
  },
);
