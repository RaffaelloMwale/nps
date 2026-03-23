import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { unauthorized } from '../utils/responseHelper';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, 'No token provided');
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    unauthorized(res, 'Invalid or expired token');
  }
}
