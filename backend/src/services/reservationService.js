import { query, withTransaction } from '../database/pool.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { ROLE_CODES } from '../config/permissions.js';
import { notifyUser } from '../notifications/notify.js';
import { writeAudit } from '../middleware/audit.js';
import { paginated, parsePagination } from '../utils/pagination.js';

export async function createReservation({ bookId, memberProfileId, branchId, actor, req }) {
  return withTransaction(async (conn) => {
    if (actor.role_code === ROLE_CODES.MEMBER) {
      const [mp] = await conn.execute('SELECT id FROM member_profiles WHERE user_id = ?', [actor.id]);
      if (!mp[0] || mp[0].id !== Number(memberProfileId)) throw forbidden();
    }
    const [book] = await conn.execute('SELECT id, title, status FROM books WHERE id = ?', [bookId]);
    if (!book[0] || book[0].status !== 'active') throw notFound('Book not found');

    const [dup] = await conn.execute(
      `SELECT id FROM reservations WHERE book_id = ? AND member_profile_id = ? AND status IN ('queued','ready')`,
      [bookId, memberProfileId],
    );
    if (dup[0]) throw conflict('You already have an active reservation for this title');

    const [ms] = await conn.execute(
      `SELECT mt.reservation_limit, lp.allow_reserve_available
         FROM memberships m
         JOIN membership_types mt ON mt.id = m.membership_type_id
         LEFT JOIN loan_policies lp ON lp.is_default = 1
        WHERE m.member_profile_id = ? AND m.status = 'active'
        LIMIT 1`,
      [memberProfileId],
    );
    if (!ms[0]) throw conflict('No active membership');
    const [[{ activeRes }]] = await conn.execute(
      `SELECT COUNT(*) AS activeRes FROM reservations WHERE member_profile_id = ? AND status IN ('queued','ready')`,
      [memberProfileId],
    );
    if (Number(activeRes) >= ms[0].reservation_limit) throw conflict('Reservation limit reached');

    const [[{ available }]] = await conn.execute(
      `SELECT COUNT(*) AS available FROM book_copies WHERE book_id = ? AND availability_status = 'available' AND branch_id = ?`,
      [bookId, branchId],
    );
    if (Number(available) > 0 && !ms[0].allow_reserve_available) {
      throw conflict('Copies are available. Borrow instead of reserving.');
    }

    const [[{ maxPos }]] = await conn.execute(
      `SELECT COALESCE(MAX(queue_position),0) AS maxPos FROM reservations WHERE book_id = ? AND status = 'queued'`,
      [bookId],
    );
    const [res] = await conn.execute(
      `INSERT INTO reservations (reservation_code, book_id, member_profile_id, branch_id, queue_position, status, reserved_at)
       VALUES ('PENDING', ?, ?, ?, ?, 'queued', UTC_TIMESTAMP())`,
      [bookId, memberProfileId, branchId, Number(maxPos) + 1],
    );
    const code = `RS${String(res.insertId).padStart(8, '0')}`;
    await conn.execute('UPDATE reservations SET reservation_code = ? WHERE id = ?', [code, res.insertId]);
    await writeAudit({
      actorId: actor.id,
      action: 'reservation.create',
      entityType: 'reservation',
      entityId: res.insertId,
      req,
    });
    return { id: res.insertId, code, queuePosition: Number(maxPos) + 1 };
  });
}

export async function cancelReservation(reservationId, actor, req) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [reservationId]);
    const rec = rows[0];
    if (!rec) throw notFound('Reservation not found');
    if (actor.role_code === ROLE_CODES.MEMBER) {
      const [mp] = await conn.execute('SELECT id FROM member_profiles WHERE user_id = ?', [actor.id]);
      if (!mp[0] || mp[0].id !== rec.member_profile_id) throw forbidden();
    }
    if (!['queued', 'ready'].includes(rec.status)) throw conflict('Reservation cannot be cancelled');
    if (rec.status === 'ready' && rec.copy_id) {
      await conn.execute(
        `UPDATE book_copies SET availability_status = 'available' WHERE id = ? AND availability_status = 'reserved'`,
        [rec.copy_id],
      );
    }
    await conn.execute(
      `UPDATE reservations SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP() WHERE id = ?`,
      [reservationId],
    );
    await conn.execute(
      `UPDATE reservations SET queue_position = GREATEST(queue_position - 1, 1)
        WHERE book_id = ? AND status = 'queued' AND queue_position > ?`,
      [rec.book_id, rec.queue_position],
    );
    await writeAudit({
      actorId: actor.id,
      action: 'reservation.cancel',
      entityType: 'reservation',
      entityId: reservationId,
      req,
    });
  });
}

export async function listReservations(params, actor) {
  const { page, limit, offset } = parsePagination(params);
  const where = ['1=1'];
  const values = [];
  if (actor.role_code === ROLE_CODES.MEMBER) {
    const mp = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [actor.id]))[0];
    where.push('r.member_profile_id = ?');
    values.push(mp.id);
  } else if (params.memberId) {
    where.push('r.member_profile_id = ?');
    values.push(Number(params.memberId));
  }
  if (params.status) {
    where.push('r.status = ?');
    values.push(params.status);
  }
  const items = await query(
    `SELECT r.*, b.title, u.full_name, mp.member_code
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       JOIN member_profiles mp ON mp.id = r.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.reserved_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = await query(
    `SELECT COUNT(*) AS total FROM reservations r WHERE ${where.join(' AND ')}`,
    values,
  );
  return paginated(items, total[0].total, page, limit);
}

export async function expireReservations() {
  return withTransaction(async (conn) => {
    const [ready] = await conn.execute(
      `SELECT * FROM reservations WHERE status = 'ready' AND pickup_deadline_at < UTC_TIMESTAMP() FOR UPDATE`,
    );
    for (const rec of ready) {
      await conn.execute(
        `UPDATE reservations SET status = 'expired', expired_at = UTC_TIMESTAMP() WHERE id = ?`,
        [rec.id],
      );
      if (rec.copy_id) {
        const [next] = await conn.execute(
          `SELECT * FROM reservations WHERE book_id = ? AND status = 'queued' ORDER BY queue_position, reserved_at LIMIT 1 FOR UPDATE`,
          [rec.book_id],
        );
        if (next[0]) {
          await conn.execute(
            `UPDATE reservations SET status = 'ready', copy_id = ?, ready_at = UTC_TIMESTAMP(),
                    pickup_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR)
              WHERE id = ?`,
            [rec.copy_id, next[0].id],
          );
          const [holder] = await conn.execute('SELECT user_id FROM member_profiles WHERE id = ?', [
            next[0].member_profile_id,
          ]);
          await notifyUser({
            userId: holder[0].user_id,
            type: 'reservation_ready',
            title: 'Reserved title is ready',
            body: 'A copy is now ready for pickup.',
            metadata: { reservationId: next[0].id },
          });
        } else {
          await conn.execute(
            `UPDATE book_copies SET availability_status = 'available' WHERE id = ? AND availability_status = 'reserved'`,
            [rec.copy_id],
          );
        }
      }
    }
    return ready.length;
  });
}
