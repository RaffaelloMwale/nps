import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { signAccessToken, signRefreshToken, JwtPayload } from '../../config/jwt';
import logger from '../../config/logger';

const MAX_FAILED = parseInt(process.env.MAX_FAILED_LOGINS || '5');

export async function loginUser(username: string, password: string) {
  const result = await query(
    `SELECT id, username, email, password_hash, full_name, role, status,
            failed_login_count, locked_at, must_change_pwd
     FROM nps.system_users WHERE username = $1`,
    [username]
  );

  const user = result.rows[0];
  if (!user) throw new Error('Invalid username or password');

  if (user.status !== 'active') {
    throw new Error('Account is inactive or suspended');
  }

  if (user.locked_at) {
    const lockTime = new Date(user.locked_at).getTime();
    const now = Date.now();
    if (now - lockTime < 30 * 60 * 1000) { // 30-min lock
      throw new Error('Account is locked. Please contact an administrator.');
    }
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const newCount = user.failed_login_count + 1;
    if (newCount >= MAX_FAILED) {
      await query(
        `UPDATE nps.system_users SET failed_login_count=$1, locked_at=NOW() WHERE id=$2`,
        [newCount, user.id]
      );
      throw new Error(`Account locked after ${MAX_FAILED} failed attempts.`);
    }
    await query(
      `UPDATE nps.system_users SET failed_login_count=$1 WHERE id=$2`,
      [newCount, user.id]
    );
    throw new Error('Invalid username or password');
  }

  // Reset failed count and update last login
  await query(
    `UPDATE nps.system_users SET failed_login_count=0, locked_at=NULL, last_login_at=NOW() WHERE id=$1`,
    [user.id]
  );

  const payload: JwtPayload = {
    userId:   user.id,
    username: user.username,
    role:     user.role,
    fullName: user.full_name,
  };

  logger.info(`User ${username} logged in`);
  return {
    accessToken:  signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id:           user.id,
      username:     user.username,
      email:        user.email,
      fullName:     user.full_name,
      role:         user.role,
      mustChangePwd: user.must_change_pwd,
    },
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const result = await query(
    `SELECT password_hash FROM nps.system_users WHERE id=$1`, [userId]
  );
  const user = result.rows[0];
  if (!user) throw new Error('User not found');

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new Error('Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, 12);
  await query(
    `UPDATE nps.system_users SET password_hash=$1, must_change_pwd=FALSE, password_changed_at=NOW() WHERE id=$2`,
    [hash, userId]
  );
}
