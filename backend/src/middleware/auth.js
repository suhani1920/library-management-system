import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../database/pool.js';
import { unauthorized } from '../utils/AppError.js';

export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.access_token;
    if (!token) return next();
    const payload = jwt.verify(token, env.jwt.accessSecret, { issuer: env.jwt.issuer });
    const users = await query(
      `SELECT u.id, u.email, u.full_name, u.status, u.must_change_password, u.branch_id,
              r.code AS role_code, r.id AS role_id
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?`,
      [payload.sub],
    );
    if (users[0] && users[0].status === 'active') {
      const perms = await query(
        `SELECT p.code FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id = ?`,
        [users[0].role_id],
      );
      req.user = { ...users[0], permissions: perms.map((p) => p.code) };
    }
    next();
  } catch {
    next();
  }
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token;
    if (!token) throw unauthorized();
    const payload = jwt.verify(token, env.jwt.accessSecret, { issuer: env.jwt.issuer });
    const users = await query(
      `SELECT u.id, u.email, u.full_name, u.status, u.must_change_password, u.branch_id,
              r.code AS role_code, r.id AS role_id
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?`,
      [payload.sub],
    );
    const user = users[0];
    if (!user) throw unauthorized();
    if (user.status !== 'active') {
      throw unauthorized('Account is not active');
    }
    const perms = await query(
      `SELECT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = ?`,
      [user.role_id],
    );
    req.user = { ...user, permissions: perms.map((p) => p.code) };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(unauthorized('Session expired'));
    }
    next(error.status ? error : unauthorized());
  }
}

export function requirePermission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    const ok = codes.every((code) => req.user.permissions.includes(code));
    if (!ok) {
      return next(unauthorized() && Object.assign(unauthorized('Insufficient permissions'), { status: 403, code: 'FORBIDDEN' }));
    }
    next();
  };
}
