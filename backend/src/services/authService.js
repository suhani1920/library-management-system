import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool, query, withTransaction } from '../database/pool.js';
import { AppError, unauthorized, forbidden } from '../utils/AppError.js';
import { hashPassword, verifyPassword, assertStrongPassword } from '../utils/password.js';
import { cookieOptions, hashToken, randomToken, signAccessToken, signRefreshToken } from '../utils/tokens.js';
import { writeAudit } from '../middleware/audit.js';
import { getSetting } from './settingsService.js';
import { sendMail } from '../notifications/mailer.js';
import { ROLE_CODES } from '../config/permissions.js';

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function publicUser(row, permissions = []) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role_code,
    branchId: row.branch_id,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    permissions,
  };
}

async function loadUserByEmail(email) {
  const rows = await query(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [email],
  );
  return rows[0];
}

async function loadPermissions(roleId) {
  const rows = await query(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?`,
    [roleId],
  );
  return rows.map((r) => r.code);
}

function setAuthCookies(res, access, refresh) {
  res.cookie('access_token', access, cookieOptions(ACCESS_MS));
  res.cookie('refresh_token', refresh, cookieOptions(REFRESH_MS));
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

async function storeRefresh(userId, refreshToken, req) {
  const tokenHash = hashToken(refreshToken);
  const decoded = jwt.decode(refreshToken);
  const expires = new Date(decoded.exp * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenHash, expires, req.get('user-agent')?.slice(0, 255) || null, req.ip],
  );
}

export async function login(req, res, { email, password }) {
  const user = await loadUserByEmail(String(email).trim().toLowerCase());
  if (!user) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Account temporarily locked. Try again later.', 423, 'LOCKED');
  }
  if (user.status !== 'active') {
    throw new AppError('Account is not active', 403, 'INACTIVE');
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_login_attempts + 1;
    const lock =
      attempts >= env.loginMaxAttempts
        ? new Date(Date.now() + env.loginLockMinutes * 60 * 1000)
        : null;
    await query('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [
      attempts,
      lock,
      user.id,
    ]);
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  await query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
    [user.id],
  );

  const permissions = await loadPermissions(user.role_id);
  const access = signAccessToken({ ...user, role_code: user.role_code });
  const refresh = signRefreshToken(user, randomToken());
  await storeRefresh(user.id, refresh, req);
  setAuthCookies(res, access, refresh);
  await writeAudit({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, req });
  return publicUser(user, permissions);
}

export async function logout(req, res) {
  const token = req.cookies?.refresh_token;
  if (token) {
    await query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ? AND revoked_at IS NULL', [
      hashToken(token),
    ]);
  }
  clearAuthCookies(res);
}

export async function refresh(req, res) {
  const token = req.cookies?.refresh_token;
  if (!token) throw unauthorized('Session expired');
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.refreshSecret, { issuer: env.jwt.issuer });
  } catch {
    throw unauthorized('Session expired');
  }
  const hash = hashToken(token);
  const rows = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?`,
    [hash, payload.sub],
  );
  const stored = rows[0];
  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    throw unauthorized('Session expired');
  }

  await query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ?', [stored.id]);
  const users = await query(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [payload.sub],
  );
  const user = users[0];
  if (!user || user.status !== 'active') throw unauthorized();

  const access = signAccessToken(user);
  const nextRefresh = signRefreshToken(user, randomToken());
  await storeRefresh(user.id, nextRefresh, req);
  const inserted = await query('SELECT id FROM refresh_tokens WHERE token_hash = ?', [hashToken(nextRefresh)]);
  await query('UPDATE refresh_tokens SET replaced_by = ? WHERE id = ?', [inserted[0].id, stored.id]);
  setAuthCookies(res, access, nextRefresh);
  const permissions = await loadPermissions(user.role_id);
  return publicUser(user, permissions);
}

export async function me(userId) {
  const users = await query(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId],
  );
  const user = users[0];
  if (!user) throw unauthorized();
  const permissions = await loadPermissions(user.role_id);
  let memberProfileId = null;
  if (user.role_code === ROLE_CODES.MEMBER) {
    const mp = await query('SELECT id, member_code FROM member_profiles WHERE user_id = ?', [userId]);
    memberProfileId = mp[0]?.id || null;
    return { ...publicUser(user, permissions), memberProfileId, memberCode: mp[0]?.member_code };
  }
  return publicUser(user, permissions);
}

export async function changePassword(user, { currentPassword, newPassword }) {
  assertStrongPassword(newPassword);
  const rows = await query('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  const ok = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!ok) throw forbidden('Current password is incorrect');
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, user.id]);
  await query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [
    user.id,
  ]);
}

export async function forgotPassword(email) {
  const user = await loadUserByEmail(String(email).trim().toLowerCase());
  if (!user) return;
  const token = randomToken();
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
    [user.id, hashToken(token)],
  );
  const link = `${env.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: `${env.appName} password reset`,
    text: `Reset your password using this link (valid 1 hour): ${link}`,
  });
}

export async function resetPassword({ token, newPassword }) {
  assertStrongPassword(newPassword);
  const hash = hashToken(token);
  const rows = await query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [hash],
  );
  const rec = rows[0];
  if (!rec) throw new AppError('Reset link is invalid or expired', 400, 'INVALID_TOKEN');
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (conn) => {
    await conn.execute('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
      passwordHash,
      rec.user_id,
    ]);
    await conn.execute('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [rec.id]);
    await conn.execute(
      'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
      [rec.user_id],
    );
  });
}

export async function registerMember(payload) {
  const allowed = await getSetting('member_self_register', true);
  if (!allowed) throw forbidden('Self-registration is disabled');
  assertStrongPassword(payload.password);
  const existing = await query('SELECT id FROM users WHERE email = ?', [payload.email.toLowerCase()]);
  if (existing[0]) throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');

  const memberRole = (await query('SELECT id FROM roles WHERE code = ?', [ROLE_CODES.MEMBER]))[0];
  const ug = (await query('SELECT id FROM membership_types WHERE code = ?', ['UG']))[0];
  const branch = (await query('SELECT id FROM branches WHERE is_active = 1 ORDER BY id LIMIT 1'))[0];
  const passwordHash = await hashPassword(payload.password);
  const requireVerify = await getSetting('require_email_verification', false);

  return withTransaction(async (conn) => {
    const [userRes] = await conn.execute(
      `INSERT INTO users (email, password_hash, full_name, phone, role_id, branch_id, status, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.email.toLowerCase(),
        passwordHash,
        payload.fullName,
        payload.phone || null,
        memberRole.id,
        branch.id,
        requireVerify ? 'pending' : 'active',
        requireVerify ? null : new Date(),
      ],
    );
    const userId = userRes.insertId;
    const memberCode = `MEM${String(userId).padStart(6, '0')}`;
    const [mp] = await conn.execute(
      `INSERT INTO member_profiles (user_id, member_code, student_id, department, program, academic_year)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, memberCode, payload.studentId, payload.department || null, payload.program || null, payload.academicYear || null],
    );
    await conn.execute(
      `INSERT INTO memberships (member_profile_id, membership_type_id, branch_id, starts_at, expires_at, status)
       VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 12 MONTH), 'active')`,
      [mp.insertId, ug.id, branch.id],
    );
    await conn.execute('INSERT INTO reading_lists (member_profile_id) VALUES (?)', [mp.insertId]);
    return { userId, memberCode, status: requireVerify ? 'pending' : 'active' };
  });
}

export { setAuthCookies, clearAuthCookies, publicUser };
