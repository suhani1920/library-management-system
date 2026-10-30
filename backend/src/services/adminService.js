import { query, pool } from '../database/pool.js';
import { paginated, parsePagination } from '../utils/pagination.js';
import { hashPassword, assertStrongPassword } from '../utils/password.js';
import { writeAudit } from '../middleware/audit.js';
import { getSettingsMap, updateSettings } from './settingsService.js';
import { notFound } from '../utils/AppError.js';

export async function listUsers(params) {
  const { page, limit, offset } = parsePagination(params);
  const items = await query(
    `SELECT u.id, u.email, u.full_name, u.status, u.branch_id, u.last_login_at, r.code AS role_code, b.name AS branch_name
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY u.full_name
      LIMIT ${limit} OFFSET ${offset}`,
  );
  const total = (await query('SELECT COUNT(*) AS total FROM users'))[0].total;
  return paginated(items, total, page, limit);
}

export async function createStaffUser(payload, actor, req) {
  assertStrongPassword(payload.password);
  const role = (await query('SELECT id FROM roles WHERE code = ?', [payload.roleCode]))[0];
  if (!role) throw notFound('Role not found');
  const hash = await hashPassword(payload.password);
  const [res] = await pool.execute(
    `INSERT INTO users (email, password_hash, full_name, phone, role_id, branch_id, status, email_verified_at, must_change_password, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP(), 1, ?)`,
    [
      payload.email.toLowerCase(),
      hash,
      payload.fullName,
      payload.phone || null,
      role.id,
      payload.branchId || null,
      actor.id,
    ],
  );
  await writeAudit({ actorId: actor.id, action: 'user.create', entityType: 'user', entityId: res.insertId, req });
  return { id: res.insertId };
}

export async function setUserStatus(userId, status, actor, req) {
  await query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
  if (status !== 'active') {
    await query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [
      userId,
    ]);
  }
  await writeAudit({
    actorId: actor.id,
    action: 'user.status',
    entityType: 'user',
    entityId: userId,
    details: { status },
    req,
  });
}

export async function listAudit(params) {
  const { page, limit, offset } = parsePagination(params);
  const where = ['1=1'];
  const values = [];
  if (params.action) {
    where.push('a.action LIKE ?');
    values.push(`%${params.action}%`);
  }
  const items = await query(
    `SELECT a.*, u.full_name, u.email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = (await query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where.join(' AND ')}`, values))[0]
    .total;
  return paginated(items, total, page, limit);
}

export async function listBranches() {
  return query('SELECT * FROM branches ORDER BY name');
}

export async function upsertBranch(payload, actor, req) {
  if (payload.id) {
    await query(
      `UPDATE branches SET name = ?, address = ?, phone = ?, email = ?, is_active = ? WHERE id = ?`,
      [payload.name, payload.address || null, payload.phone || null, payload.email || null, payload.isActive ?? 1, payload.id],
    );
    await writeAudit({ actorId: actor.id, action: 'branch.update', entityType: 'branch', entityId: payload.id, req });
    return { id: payload.id };
  }
  const [res] = await pool.execute(
    `INSERT INTO branches (code, name, address, phone, email) VALUES (?, ?, ?, ?, ?)`,
    [payload.code, payload.name, payload.address || null, payload.phone || null, payload.email || null],
  );
  await writeAudit({ actorId: actor.id, action: 'branch.create', entityType: 'branch', entityId: res.insertId, req });
  return { id: res.insertId };
}

export { getSettingsMap, updateSettings };
