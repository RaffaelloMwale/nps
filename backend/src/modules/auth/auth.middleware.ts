import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { query } from '../config/database';
import { unauthorized } from '../utils/responseHelper';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, 'No token provided');
    return;
  }

  const token = authHeader.split(' ')[1];
  let payload: JwtPayload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    unauthorized(res, 'Invalid or expired token');
    return;
  }

  // ── Single-session enforcement ────────────────────────────
  // If the JWT contains a sessionToken, verify it still matches
  // what's stored in the database. If a newer login has happened
  // (on another device/browser), the DB will have a different token
  // and this request is rejected immediately.
  if (payload.sessionToken) {
    try {
      const result = await query(
        `SELECT session_token, status FROM nps.system_users WHERE id = $1`,
        [payload.userId]
      );
      const dbUser = result.rows[0];

      if (!dbUser) {
        unauthorized(res, 'User account not found');
        return;
      }

      if (dbUser.status !== 'active') {
        unauthorized(res, 'Account is inactive');
        return;
      }

      if (dbUser.session_token !== payload.sessionToken) {
        // Session was superseded — another login happened elsewhere
        unauthorized(res, 'SESSION_SUPERSEDED');
        return;
      }
    } catch (err) {
      // If DB check fails (e.g. during startup), allow the request
      // to proceed rather than locking everyone out
      console.error('[auth] Session check failed:', err);
    }
  }

  req.user = payload;
  next();
}
