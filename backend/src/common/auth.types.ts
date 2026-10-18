import type { Request } from 'express';
import type { UserRole } from '../usuarios/entities/user.entity.js';

/** Datos del usuario autenticado que viajan dentro del JWT. */
export interface AuthUser {
  id: number;
  role: UserRole;
}

export interface JwtPayload {
  sub: number;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
