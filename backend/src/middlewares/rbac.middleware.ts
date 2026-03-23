import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { forbidden } from '../utils/responseHelper';
import { UserRole } from '../types/enums';

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      forbidden(res, 'Authentication required');
      return;
    }
    if (!roles.includes(req.user.role as UserRole)) {
      forbidden(res, `Access denied. Required role(s): ${roles.join(', ')}`);
      return;
    }
    next();
  };
}

export function requireAnyRole(...roles: UserRole[]) {
  return requireRole(...roles);
}

// Admin or Creator
export const creatorOrAdmin = requireRole(UserRole.ADMIN, UserRole.CREATOR);

// All authenticated users
export const anyRole = requireRole(
  UserRole.ADMIN, UserRole.CREATOR, UserRole.APPROVER_1, UserRole.APPROVER_2
);

// Approvers
export const approver1OrAdmin = requireRole(UserRole.ADMIN, UserRole.APPROVER_1);
export const approver2OrAdmin = requireRole(UserRole.ADMIN, UserRole.APPROVER_2);
export const adminOnly        = requireRole(UserRole.ADMIN);
