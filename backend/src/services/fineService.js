import { query, withTransaction } from '../database/pool.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { money } from '../utils/ids.js';
import { paginated, parsePagination } from '../utils/pagination.js';
import { ROLE_CODES } from '../config/permissions.js';
import { writeAudit } from '../middleware/audit.js';
import { notifyUser } from '../notifications/notify.js';

export async function listFines(params, actor) {
  const { page, limit, offset } = parsePagination(params);
  const where = ['1=1'];
  const values = [];
  if (actor.role_code === ROLE_CODES.MEMBER) {
    const mp = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [actor.id]))[0];
    where.push('f.member_profile_id = ?');
    values.push(mp.id);
  } else if (params.memberId) {
    where.push('f.member_profile_id = ?');
    values.push(Number(params.memberId));
  }
  if (params.status) {
    where.push('f.status = ?');
    values.push(params.status);
  }
  const items = await query(
    `SELECT f.*, u.full_name, mp.member_code
       FROM fines f
       JOIN member_profiles mp ON mp.id = f.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY f.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const [summary] = await query(
    `SELECT COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN f.status IN ('outstanding','partial') THEN f.outstanding_amount ELSE 0 END),0) AS outstanding,
          COALESCE(SUM(f.status IN ('outstanding','partial')),0) AS open_records
       FROM fines f WHERE ${where.join(' AND ')}`,
    values,
  );
  return {
    ...paginated(items, summary.total, page, limit),
    summary: {
      outstandingAmount: Number(summary.outstanding),
      openRecords: Number(summary.open_records),
      totalRecords: Number(summary.total),
    },
  };
}

export async function waiveFine({ fineId, amount, reason, actor, req }) {
  if (!reason) throw new AppError('Waiver reason is required', 422);
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM fines WHERE id = ? FOR UPDATE', [fineId]);
    const fine = rows[0];
    if (!fine) throw notFound('Fine not found');
    const waive = money(Math.min(Number(amount ?? fine.outstanding_amount), Number(fine.outstanding_amount)));
    if (waive <= 0) throw conflict('Nothing to waive');
    const outstanding = money(Number(fine.outstanding_amount) - waive);
    const waived = money(Number(fine.waived_amount) + waive);
    const status = outstanding === 0 ? 'waived' : 'partial';
    await conn.execute(
      `UPDATE fines SET outstanding_amount = ?, waived_amount = ?, status = IF(outstanding_amount = 0 AND amount = waived_amount, 'waived', ?) WHERE id = ?`,
      [outstanding, waived, status, fineId],
    );
    await conn.execute(
      `INSERT INTO fine_waivers (fine_id, amount, reason, authorized_by) VALUES (?, ?, ?, ?)`,
      [fineId, waive, reason, actor.id],
    );
    await writeAudit({
      actorId: actor.id,
      action: 'fine.waive',
      entityType: 'fine',
      entityId: fineId,
      details: { waive, reason },
      req,
    });
    return { outstanding, waived };
  });
}

export async function recordPayment({ memberProfileId, amount, method, notes, allocations, actor, req }) {
  const payAmount = money(amount);
  if (payAmount <= 0) throw new AppError('Payment amount must be positive', 422);
  return withTransaction(async (conn) => {
    const [member] = await conn.execute('SELECT id, user_id FROM member_profiles WHERE id = ?', [memberProfileId]);
    if (!member[0]) throw notFound('Member not found');

    let remaining = payAmount;
    let targets = allocations;
    if (!targets?.length) {
      const [open] = await conn.execute(
        `SELECT id, outstanding_amount FROM fines
          WHERE member_profile_id = ? AND status IN ('outstanding','partial')
          ORDER BY created_at FOR UPDATE`,
        [memberProfileId],
      );
      targets = [];
      for (const fine of open) {
        if (remaining <= 0) break;
        const apply = money(Math.min(remaining, Number(fine.outstanding_amount)));
        targets.push({ fineId: fine.id, amount: apply });
        remaining = money(remaining - apply);
      }
      if (remaining > 0) throw conflict('Payment exceeds outstanding fines');
    }

    const [payRes] = await conn.execute(
      `INSERT INTO payments (payment_code, member_profile_id, amount, method, status, received_by, notes, paid_at)
       VALUES ('PENDING', ?, ?, ?, 'completed', ?, ?, UTC_TIMESTAMP())`,
      [memberProfileId, payAmount, method || 'cash', actor.id, notes || null],
    );
    const paymentCode = `PM${String(payRes.insertId).padStart(8, '0')}`;
    await conn.execute('UPDATE payments SET payment_code = ? WHERE id = ?', [paymentCode, payRes.insertId]);

    for (const alloc of targets) {
      const [fines] = await conn.execute('SELECT * FROM fines WHERE id = ? FOR UPDATE', [alloc.fineId]);
      const fine = fines[0];
      if (!fine || Number(fine.member_profile_id) !== Number(memberProfileId)) throw forbidden();
      const apply = money(alloc.amount);
      if (apply > Number(fine.outstanding_amount)) throw conflict('Allocation exceeds outstanding amount');
      const outstanding = money(Number(fine.outstanding_amount) - apply);
      const status = outstanding === 0 ? 'paid' : 'partial';
      await conn.execute('UPDATE fines SET outstanding_amount = ?, status = ? WHERE id = ?', [
        outstanding,
        status,
        fine.id,
      ]);
      await conn.execute('INSERT INTO payment_allocations (payment_id, fine_id, amount) VALUES (?, ?, ?)', [
        payRes.insertId,
        fine.id,
        apply,
      ]);
    }

    await writeAudit({
      actorId: actor.id,
      action: 'payment.record',
      entityType: 'payment',
      entityId: payRes.insertId,
      details: { amount: payAmount, method },
      req,
    });
    setImmediate(() => {
      notifyUser({
        userId: member[0].user_id,
        type: 'payment_receipt',
        title: 'Payment received',
        body: `Payment ${paymentCode} of ${payAmount.toFixed(2)} was recorded.`,
        metadata: { paymentId: payRes.insertId },
      }).catch(() => {});
    });
    return { paymentId: payRes.insertId, paymentCode, amount: payAmount };
  });
}

export async function getPaymentReceipt(paymentId, actor) {
  const rows = await query(
    `SELECT p.*, u.full_name, mp.member_code, mp.user_id
       FROM payments p
       JOIN member_profiles mp ON mp.id = p.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE p.id = ?`,
    [paymentId],
  );
  if (!rows[0]) throw notFound('Payment not found');
  if (actor.role_code === ROLE_CODES.MEMBER && actor.id !== rows[0].user_id) throw forbidden();
  const allocations = await query(
    `SELECT pa.amount, f.fine_code, f.fine_type FROM payment_allocations pa JOIN fines f ON f.id = pa.fine_id
      WHERE pa.payment_id = ?`,
    [paymentId],
  );
  return { ...rows[0], allocations };
}
