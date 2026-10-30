import { query } from '../database/pool.js';
import { ROLE_CODES } from '../config/permissions.js';

export async function loadMemberProfile(req, _res, next) {
  try {
    if (!req.user) return next();
    if (req.user.role_code !== ROLE_CODES.MEMBER) return next();
    const rows = await query('SELECT id FROM member_profiles WHERE user_id = ?', [req.user.id]);
    req.user.memberProfileId = rows[0]?.id || null;
    next();
  } catch (error) {
    next(error);
  }
}
