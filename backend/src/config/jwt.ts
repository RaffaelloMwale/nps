import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET         || 'dev_access_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || 'dev_refresh_secret_change_me';
const ACCESS_EXPIRY  = process.env.JWT_EXPIRES_IN      || '8h';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  fullName: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
