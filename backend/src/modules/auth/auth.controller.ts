import { Request, Response, NextFunction } from 'express';
import { loginUser, changePassword, logoutUser } from './auth.service';
import { LoginSchema, ChangePasswordSchema } from './auth.schema';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { success, badRequest } from '../../utils/responseHelper';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = LoginSchema.parse(req.body);
    const result = await loginUser(username, password);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    success(res, { accessToken: result.accessToken, user: result.user }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Clear the session token from DB — invalidates the JWT immediately
    if ((req as AuthRequest).user?.userId) {
      await logoutUser((req as AuthRequest).user!.userId);
    }
  } catch (err) {
    // Non-fatal — still log out
  }
  res.clearCookie('refreshToken');
  success(res, null, 'Logged out successfully');
}

export async function changePasswordHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);
    await changePassword(req.user!.userId, currentPassword, newPassword);
    success(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

export async function me(req: AuthRequest, res: Response) {
  success(res, req.user, 'User info');
}
