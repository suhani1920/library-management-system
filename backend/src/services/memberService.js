import { pool, query, withTransaction } from '../database/pool.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { escapeLike } from '../utils/ids.js';
import { paginated, parsePagination } from '../utils/pagination.js';
import { hashPassword, assertStrongPassword } from '../utils/password.js';
import { ROLE_CODES } from '../config/permissions.js';
import { writeAudit } from '../middleware/audit.js';

export async function listMembers(params) {
  const { page, limit, offset } = parsePagination(params);
  const where = ['r.code = ?'];
  const values = [ROLE_CODES.MEMBER];
  if (params.q) {
    const term = `%${escapeLike(params.q)}%`;
    where.push(
      `(u.full_name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' OR mp.member_code LIKE ? ESCAPE '\\\\' OR mp.student_id LIKE ? ESCAPE '\\\\')`,
    );
    values.push(term, term, term, term);
  }
  if (params.status) {
    where.push('u.status = ?');
    values.push(params.status);
  }
  if (params.department) {
    where.push('mp.department = ?');
    values.push(params.department);
  }
  const items = await query(
    `SELECT mp.id, mp.member_code, mp.student_id, mp.department, mp.program, mp.academic_year,
            u.id AS user_id, u.full_name, u.email, u.phone, u.status,
            ms.status AS membership_status, ms.expires_at, mt.name AS membership_type,
            (SELECT COALESCE(SUM(outstanding_amount),0) FROM fines f WHERE f.member_profile_id = mp.id AND f.status IN ('outstanding','partial')) AS outstanding_fines,
            (SELECT COUNT(*) FROM loans l WHERE l.member_profile_id = mp.id AND l.status IN ('active','overdue')) AS active_loans
       FROM member_profiles mp
       JOIN users u ON u.id = mp.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN memberships ms ON ms.member_profile_id = mp.id AND ms.id = (
         SELECT MAX(id) FROM memberships WHERE member_profile_id = mp.id
       )
       LEFT JOIN membership_types mt ON mt.id = ms.membership_type_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.full_name
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = await query(
    `SELECT COUNT(*) AS total
       FROM member_profiles mp JOIN users u ON u.id = mp.user_id JOIN roles r ON r.id = u.role_id
      WHERE ${where.join(' AND ')}`,
    values,
  );
  return paginated(items, total[0].total, page, limit);
}

export async function getMember(memberId, actor) {
  const rows = await query(
    `SELECT mp.*, u.full_name, u.email, u.phone, u.status, u.last_login_at
       FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE mp.id = ?`,
    [memberId],
  );
  if (!rows[0]) throw notFound('Member not found');
  if (actor.role_code === ROLE_CODES.MEMBER && actor.id !== rows[0].user_id) throw forbidden();
  const memberships = await query(
    `SELECT ms.*, mt.name AS type_name, mt.borrow_limit, b.name AS branch_name
       FROM memberships ms
       JOIN membership_types mt ON mt.id = ms.membership_type_id
       JOIN branches b ON b.id = ms.branch_id
      WHERE ms.member_profile_id = ? ORDER BY ms.id DESC`,
    [memberId],
  );
  const loans = await query(
    `SELECT l.id, l.loan_code, l.status, l.issued_at, l.due_at, l.returned_at, b.title, c.barcode
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
      WHERE l.member_profile_id = ? ORDER BY l.issued_at DESC LIMIT 50`,
    [memberId],
  );
  const fines = await query(
    `SELECT * FROM fines WHERE member_profile_id = ? ORDER BY created_at DESC`,
    [memberId],
  );
  const reservations = await query(
    `SELECT r.*, b.title FROM reservations r JOIN books b ON b.id = r.book_id
      WHERE r.member_profile_id = ? ORDER BY r.reserved_at DESC`,
    [memberId],
  );
  return { ...rows[0], memberships, loans, fines, reservations };
}

export async function createMember(payload, actor, req) {
  assertStrongPassword(payload.password || 'Temp#Member9x');
  const existing = await query('SELECT id FROM users WHERE email = ?', [payload.email.toLowerCase()]);
  if (existing[0]) throw conflict('Email already registered');
  const role = (await query('SELECT id FROM roles WHERE code = ?', [ROLE_CODES.MEMBER]))[0];
  const hash = await hashPassword(payload.password || 'Temp#Member9x');
  return withTransaction(async (conn) => {
    const [userRes] = await conn.execute(
      `INSERT INTO users (email, password_hash, full_name, phone, role_id, branch_id, status, email_verified_at, must_change_password, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP(), ?, ?)`,
      [
        payload.email.toLowerCase(),
        hash,
        payload.fullName,
        payload.phone || null,
        role.id,
        payload.branchId,
        payload.password ? 0 : 1,
        actor.id,
      ],
    );
    const memberCode = payload.memberCode || `MEM${String(userRes.insertId).padStart(6, '0')}`;
    const [mp] = await conn.execute(
      `INSERT INTO member_profiles (user_id, member_code, student_id, department, program, academic_year, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userRes.insertId,
        memberCode,
        payload.studentId || null,
        payload.department || null,
        payload.program || null,
        payload.academicYear || null,
        payload.address || null,
      ],
    );
    await conn.execute(
      `INSERT INTO memberships (member_profile_id, membership_type_id, branch_id, starts_at, expires_at, status)
       VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 12 MONTH), 'active')`,
      [mp.insertId, payload.membershipTypeId, payload.branchId],
    );
    await conn.execute('INSERT INTO reading_lists (member_profile_id) VALUES (?)', [mp.insertId]);
    await writeAudit({
      actorId: actor.id,
      action: 'member.create',
      entityType: 'member',
      entityId: mp.insertId,
      req,
    });
    return { id: mp.insertId, userId: userRes.insertId, memberCode };
  });
}

export async function updateMember(memberId, payload, actor, req) {
  const rows = await query('SELECT * FROM member_profiles WHERE id = ?', [memberId]);
  if (!rows[0]) throw notFound('Member not found');
  if (actor.role_code === ROLE_CODES.MEMBER && actor.id !== rows[0].user_id) throw forbidden();
  await query(
    `UPDATE member_profiles
        SET department = COALESCE(?, department), program = COALESCE(?, program),
            academic_year = COALESCE(?, academic_year), address = COALESCE(?, address)
      WHERE id = ?`,
    [payload.department || null, payload.program || null, payload.academicYear || null, payload.address || null, memberId],
  );
  if (payload.fullName || payload.phone) {
    await query(`UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE id = ?`, [
      payload.fullName || null,
      payload.phone || null,
      rows[0].user_id,
    ]);
  }
  await writeAudit({ actorId: actor.id, action: 'member.update', entityType: 'member', entityId: memberId, req });
}

export async function setMemberStatus(memberId, status, actor, req) {
  const profile = (await query('SELECT * FROM member_profiles WHERE id = ?', [memberId]))[0];
  if (!profile) throw notFound('Member not found');
  if (['suspended', 'inactive'].includes(status)) {
    const [{ c }] = await query(
      `SELECT COUNT(*) AS c FROM loans WHERE member_profile_id = ? AND status IN ('active','overdue')`,
      [memberId],
    );
    if (Number(c) > 0 && status === 'inactive') {
      throw conflict('Cannot deactivate a member with active loans. Suspend instead.');
    }
  }
  await query('UPDATE users SET status = ? WHERE id = ?', [status, profile.user_id]);
  if (status === 'suspended') {
    await query(`UPDATE memberships SET status = 'suspended' WHERE member_profile_id = ? AND status = 'active'`, [
      memberId,
    ]);
  }
  if (status === 'active') {
    await query(
      `UPDATE memberships SET status = 'active' WHERE member_profile_id = ? AND status = 'suspended' AND expires_at >= CURDATE()`,
      [memberId],
    );
  }
  if (status !== 'active') {
    await query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [
      profile.user_id,
    ]);
  }
  await writeAudit({
    actorId: actor.id,
    action: 'member.status',
    entityType: 'member',
    entityId: memberId,
    details: { status },
    req,
  });
}

export async function renewMembership(memberId, months, actor, req) {
  const current = (
    await query(
      `SELECT * FROM memberships WHERE member_profile_id = ? ORDER BY id DESC LIMIT 1`,
      [memberId],
    )
  )[0];
  if (!current) throw notFound('Membership not found');
  await query(
    `UPDATE memberships SET expires_at = DATE_ADD(GREATEST(expires_at, CURDATE()), INTERVAL ? MONTH), status = 'active'
      WHERE id = ?`,
    [months || 12, current.id],
  );
  await writeAudit({
    actorId: actor.id,
    action: 'membership.renew',
    entityType: 'member',
    entityId: memberId,
    req,
  });
}

export async function getMyProfile(userId) {
  const mp = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [userId]))[0];
  if (!mp) throw notFound('Member profile not found');
  return getMember(mp.id, { id: userId, role_code: ROLE_CODES.MEMBER });
}
