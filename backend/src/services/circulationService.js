import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { withTransaction, query } from '../database/pool.js';
import { addDays, daysBetween, toMysqlDateTime } from '../utils/dates.js';
import { money } from '../utils/ids.js';
import { notifyUser } from '../notifications/notify.js';
import { writeAudit } from '../middleware/audit.js';
import { ROLE_CODES } from '../config/permissions.js';

async function getDefaultPolicy(conn, membershipTypeId, branchId) {
  const [rows] = await conn.execute(
    `SELECT * FROM loan_policies
      WHERE (membership_type_id = ? OR membership_type_id IS NULL)
        AND (branch_id = ? OR branch_id IS NULL)
      ORDER BY membership_type_id IS NULL, branch_id IS NULL, is_default DESC
      LIMIT 1`,
    [membershipTypeId, branchId],
  );
  return rows[0];
}

async function closedDates(conn, branchId) {
  const [holidays] = await conn.execute(
    'SELECT holiday_date FROM holidays WHERE branch_id IS NULL OR branch_id = ?',
    [branchId],
  );
  const [hours] = await conn.execute(
    'SELECT weekday FROM operating_hours WHERE branch_id = ? AND is_closed = 1',
    [branchId],
  );
  return {
    holidays: new Set(holidays.map((h) => new Date(h.holiday_date).toISOString().slice(0, 10))),
    closedWeekdays: new Set(hours.map((h) => Number(h.weekday))),
  };
}

export function computeDueDate(start, loanPeriodDays, skipClosed, closed) {
  let due = addDays(start, loanPeriodDays);
  if (!skipClosed) return due;
  let guard = 0;
  while (guard < 30) {
    const iso = due.toISOString().slice(0, 10);
    const weekday = due.getUTCDay();
    if (closed.holidays.has(iso) || closed.closedWeekdays.has(weekday)) {
      due = addDays(due, 1);
      guard += 1;
      continue;
    }
    break;
  }
  return due;
}

export function calculateOverdueFine({ dueAt, returnedAt, dailyFine, graceDays, maxFine }) {
  const lateDays = Math.max(0, daysBetween(dueAt, returnedAt) - Number(graceDays || 0));
  if (lateDays <= 0) return { lateDays: 0, amount: 0 };
  const amount = Math.min(money(lateDays * Number(dailyFine)), Number(maxFine));
  return { lateDays, amount: money(amount) };
}

async function loadEligibleMember(conn, memberKey) {
  const [rows] = await conn.execute(
    `SELECT mp.id AS member_profile_id, mp.member_code, mp.user_id, u.status AS user_status, u.full_name, u.email,
            ms.id AS membership_id, ms.status AS membership_status, ms.expires_at, ms.branch_id,
            mt.borrow_limit, mt.loan_period_days, mt.renewal_limit, mt.daily_fine, mt.max_fine, mt.grace_days,
            mt.reservation_limit, mt.id AS membership_type_id
       FROM member_profiles mp
       JOIN users u ON u.id = mp.user_id
       JOIN memberships ms ON ms.member_profile_id = mp.id AND ms.status IN ('active','suspended')
       JOIN membership_types mt ON mt.id = ms.membership_type_id
      WHERE mp.member_code = ? OR mp.student_id = ? OR CAST(mp.id AS CHAR) = ?
      ORDER BY ms.id DESC LIMIT 1`,
    [memberKey, memberKey, memberKey],
  );
  return rows[0];
}

export async function previewIssue({ memberKey, barcode }) {
  return withTransaction(async (conn) => {
    const member = await loadEligibleMember(conn, memberKey);
    if (!member) throw notFound('Member not found');
    const [copies] = await conn.execute(
      `SELECT c.*, b.title FROM book_copies c JOIN books b ON b.id = c.book_id WHERE c.barcode = ? OR c.copy_code = ?`,
      [barcode, barcode],
    );
    const copy = copies[0];
    if (!copy) throw notFound('Copy not found');
    return evaluateIssue(conn, member, copy);
  });
}

async function memberCopyTarget(userId, bookId) {
  const member = (await query(
    `SELECT mp.id, mp.member_code
       FROM member_profiles mp
       JOIN memberships ms ON ms.member_profile_id = mp.id AND ms.status = 'active'
      WHERE mp.user_id = ?
      ORDER BY ms.id DESC
      LIMIT 1`,
    [userId],
  ))[0];
  if (!member) throw conflict('No active membership');

  const book = (await query(`SELECT id FROM books WHERE id = ? AND status = 'active'`, [bookId]))[0];
  if (!book) throw notFound('Book not found');

  const waiting = (await query(
    `SELECT id FROM reservations WHERE book_id = ? AND status = 'queued' LIMIT 1`,
    [bookId],
  ))[0];
  if (waiting) throw conflict('Copies are being held for members in the reservation queue');

  const branch = (await query(
    `SELECT branch_id FROM memberships WHERE member_profile_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
    [member.id],
  ))[0];
  const copy = (await query(
    `SELECT barcode FROM book_copies
      WHERE book_id = ? AND branch_id = ? AND availability_status = 'available'
      ORDER BY id LIMIT 1`,
    [bookId, branch.branch_id],
  ))[0];
  if (!copy) throw conflict('No available copy at your home branch');
  return { memberKey: member.member_code, barcode: copy.barcode };
}

export async function previewMemberIssue({ userId, bookId }) {
  const target = await memberCopyTarget(userId, bookId);
  return previewIssue(target);
}

export async function issueMemberBook({ userId, bookId, notes, actor, req }) {
  const target = await memberCopyTarget(userId, bookId);
  return issueLoan({ ...target, notes, actor, req });
}

async function evaluateIssue(conn, member, copy) {
  const reasons = [];
  if (member.user_status !== 'active') reasons.push('Member account is not active');
  if (member.membership_status !== 'active') reasons.push('Membership is not active');
  if (new Date(member.expires_at) < new Date()) reasons.push('Membership has expired');

  const policy = await getDefaultPolicy(conn, member.membership_type_id, member.branch_id);
  const [[{ activeLoans }]] = await conn.execute(
    `SELECT COUNT(*) AS activeLoans FROM loans WHERE member_profile_id = ? AND status IN ('active','overdue')`,
    [member.member_profile_id],
  );
  if (Number(activeLoans) >= member.borrow_limit) reasons.push('Borrowing limit reached');

  const [[{ overdueCount }]] = await conn.execute(
    `SELECT COUNT(*) AS overdueCount FROM loans WHERE member_profile_id = ? AND status IN ('active','overdue') AND due_at < UTC_TIMESTAMP()`,
    [member.member_profile_id],
  );
  if (policy.block_if_overdue && Number(overdueCount) > 0) reasons.push('Member has overdue loans');

  const [[{ outstanding }]] = await conn.execute(
    `SELECT COALESCE(SUM(outstanding_amount),0) AS outstanding FROM fines
      WHERE member_profile_id = ? AND status IN ('outstanding','partial')`,
    [member.member_profile_id],
  );
  if (policy.block_if_unpaid_fine && Number(outstanding) > Number(policy.unpaid_fine_threshold)) {
    reasons.push('Outstanding fines exceed policy threshold');
  }

  if (copy.availability_status !== 'available') reasons.push(`Copy is ${copy.availability_status}`);

  const closed = await closedDates(conn, copy.branch_id);
  const dueAt = computeDueDate(new Date(), member.loan_period_days, Boolean(policy.skip_closed_days), closed);
  return {
    member: {
      id: member.member_profile_id,
      code: member.member_code,
      name: member.full_name,
      borrowLimit: member.borrow_limit,
      activeLoans: Number(activeLoans),
      outstandingFines: money(outstanding),
    },
    copy: {
      id: copy.id,
      barcode: copy.barcode,
      title: copy.title,
      status: copy.availability_status,
    },
    dueAt,
    eligible: reasons.length === 0,
    reasons,
    policy: { loanPeriodDays: member.loan_period_days, renewalLimit: member.renewal_limit },
  };
}

export async function issueLoan({ memberKey, barcode, notes, actor, req }) {
  return withTransaction(async (conn) => {
    const member = await loadEligibleMember(conn, memberKey);
    if (!member) throw notFound('Member not found');

    const [copies] = await conn.execute(
      `SELECT c.*, b.title, b.id AS book_id FROM book_copies c JOIN books b ON b.id = c.book_id
        WHERE c.barcode = ? OR c.copy_code = ? FOR UPDATE`,
      [barcode, barcode],
    );
    const copy = copies[0];
    if (!copy) throw notFound('Copy not found');

    const preview = await evaluateIssue(conn, member, copy);
    if (!preview.eligible) throw new AppError(preview.reasons[0], 409, 'NOT_ELIGIBLE', preview.reasons);

    const [upd] = await conn.execute(
      `UPDATE book_copies SET availability_status = 'issued' WHERE id = ? AND availability_status = 'available'`,
      [copy.id],
    );
    if (upd.affectedRows !== 1) throw conflict('Copy is no longer available');

    const [loanRes] = await conn.execute(
      `INSERT INTO loans (loan_code, copy_id, member_profile_id, membership_id, issued_by, branch_id, issued_at, due_at, status, notes)
       VALUES ('PENDING', ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, 'active', ?)`,
      [copy.id, member.member_profile_id, member.membership_id, actor.id, copy.branch_id, toMysqlDateTime(preview.dueAt), notes || null],
    );
    const loanCode = `LN${String(loanRes.insertId).padStart(8, '0')}`;
    await conn.execute('UPDATE loans SET loan_code = ? WHERE id = ?', [loanCode, loanRes.insertId]);
    await conn.execute(
      `INSERT INTO inventory_movements (copy_id, from_status, to_status, reason, actor_id)
       VALUES (?, 'available', 'issued', 'loan_issue', ?)`,
      [copy.id, actor.id],
    );

    setImmediate(() => {
      notifyUser({
        userId: member.user_id,
        type: 'loan_issued',
        title: 'Book issued',
        body: `${copy.title} is due on ${preview.dueAt.toISOString().slice(0, 10)}.`,
        metadata: { loanId: loanRes.insertId },
      }).catch(() => {});
      writeAudit({
        actorId: actor.id,
        action: 'loan.issue',
        entityType: 'loan',
        entityId: loanRes.insertId,
        details: { barcode: copy.barcode, member: member.member_code },
        req,
      });
    });

    return {
      loanId: loanRes.insertId,
      loanCode,
      dueAt: preview.dueAt,
      title: copy.title,
      memberName: member.full_name,
    };
  });
}

export async function returnLoan({ loanId, barcode, condition, damageCharge, notes, actor, req }) {
  return withTransaction(async (conn) => {
    let loan;
    if (loanId) {
      const [rows] = await conn.execute(`SELECT * FROM loans WHERE id = ? FOR UPDATE`, [loanId]);
      loan = rows[0];
    } else if (barcode) {
      const [rows] = await conn.execute(
        `SELECT l.* FROM loans l JOIN book_copies c ON c.id = l.copy_id
          WHERE (c.barcode = ? OR c.copy_code = ?) AND l.status IN ('active','overdue')
          ORDER BY l.id DESC LIMIT 1 FOR UPDATE`,
        [barcode, barcode],
      );
      loan = rows[0];
    }
    if (!loan) throw notFound('Active loan not found');
    if (!['active', 'overdue'].includes(loan.status)) throw conflict('Loan is not active');

    const [copies] = await conn.execute('SELECT * FROM book_copies WHERE id = ? FOR UPDATE', [loan.copy_id]);
    const copy = copies[0];
    const [members] = await conn.execute(
      `SELECT mp.*, mt.daily_fine, mt.max_fine, mt.grace_days, u.id AS user_id, u.email, b.title
         FROM member_profiles mp
         JOIN memberships ms ON ms.member_profile_id = mp.id AND ms.id = ?
         JOIN membership_types mt ON mt.id = ms.membership_type_id
         JOIN users u ON u.id = mp.user_id
         JOIN books b ON b.id = ?
        WHERE mp.id = ?`,
      [loan.membership_id, copy.book_id, loan.member_profile_id],
    );
    const member = members[0];
    const now = new Date();
    const fineCalc = calculateOverdueFine({
      dueAt: loan.due_at,
      returnedAt: now,
      dailyFine: member.daily_fine,
      graceDays: member.grace_days,
      maxFine: member.max_fine,
    });

    let nextCopyStatus = 'available';
    if (condition === 'lost') nextCopyStatus = 'lost';
    else if (condition === 'damaged') nextCopyStatus = 'in_repair';

    await conn.execute(
      `UPDATE loans SET returned_at = UTC_TIMESTAMP(), returned_by = ?, status = 'returned', notes = COALESCE(?, notes)
        WHERE id = ? AND status IN ('active','overdue')`,
      [actor.id, notes || null, loan.id],
    );

    const fineIds = [];
    if (fineCalc.amount > 0) {
      const [existing] = await conn.execute(
        `SELECT id FROM fines WHERE loan_id = ? AND fine_type = 'overdue'`,
        [loan.id],
      );
      if (!existing[0]) {
        const [fineRes] = await conn.execute(
          `INSERT INTO fines (fine_code, member_profile_id, loan_id, copy_id, fine_type, amount, outstanding_amount, status, reason, policy_snapshot, created_by)
           VALUES ('PENDING', ?, ?, ?, 'overdue', ?, ?, 'outstanding', ?, ?, ?)`,
          [
            loan.member_profile_id,
            loan.id,
            copy.id,
            fineCalc.amount,
            fineCalc.amount,
            `${fineCalc.lateDays} overdue day(s)`,
            JSON.stringify({ dailyFine: member.daily_fine, graceDays: member.grace_days, maxFine: member.max_fine }),
            actor.id,
          ],
        );
        await conn.execute('UPDATE fines SET fine_code = ? WHERE id = ?', [
          `FN${String(fineRes.insertId).padStart(8, '0')}`,
          fineRes.insertId,
        ]);
        fineIds.push({ id: fineRes.insertId, amount: fineCalc.amount, type: 'overdue' });
      }
    }

    if (condition === 'lost' || (damageCharge && Number(damageCharge) > 0)) {
      const amount = condition === 'lost' ? Number(damageCharge || 1500) : Number(damageCharge);
      const type = condition === 'lost' ? 'lost' : 'damage';
      const [fineRes] = await conn.execute(
        `INSERT INTO fines (fine_code, member_profile_id, loan_id, copy_id, fine_type, amount, outstanding_amount, status, reason, created_by)
         VALUES ('PENDING', ?, ?, ?, ?, ?, ?, 'outstanding', ?, ?)`,
        [loan.member_profile_id, loan.id, copy.id, type, amount, amount, notes || type, actor.id],
      );
      await conn.execute('UPDATE fines SET fine_code = ? WHERE id = ?', [
        `FN${String(fineRes.insertId).padStart(8, '0')}`,
        fineRes.insertId,
      ]);
      fineIds.push({ id: fineRes.insertId, amount, type });
    }

    const [queue] = await conn.execute(
      `SELECT * FROM reservations
        WHERE book_id = ? AND status = 'queued'
        ORDER BY queue_position ASC, reserved_at ASC
        LIMIT 1 FOR UPDATE`,
      [copy.book_id],
    );
    let reservationReady = null;
    if (queue[0] && nextCopyStatus === 'available') {
      const pickupHours = 48;
      await conn.execute(
        `UPDATE reservations
            SET status = 'ready', copy_id = ?, ready_at = UTC_TIMESTAMP(),
                pickup_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR)
          WHERE id = ? AND status = 'queued'`,
        [copy.id, pickupHours, queue[0].id],
      );
      nextCopyStatus = 'reserved';
      reservationReady = queue[0].id;
      const [holder] = await conn.execute('SELECT user_id FROM member_profiles WHERE id = ?', [
        queue[0].member_profile_id,
      ]);
      setImmediate(() => {
        notifyUser({
          userId: holder[0].user_id,
          type: 'reservation_ready',
          title: 'Reserved title is ready',
          body: `${member.title} is ready for pickup.`,
          metadata: { reservationId: queue[0].id },
        }).catch(() => {});
      });
    }

    await conn.execute('UPDATE book_copies SET availability_status = ?, condition_code = COALESCE(?, condition_code) WHERE id = ?', [
      nextCopyStatus,
      condition === 'damaged' ? 'damaged' : condition === 'lost' ? 'damaged' : null,
      copy.id,
    ]);
    await conn.execute(
      `INSERT INTO inventory_movements (copy_id, from_status, to_status, reason, actor_id, notes)
       VALUES (?, 'issued', ?, 'loan_return', ?, ?)`,
      [copy.id, nextCopyStatus, actor.id, notes || null],
    );

    setImmediate(() => {
      notifyUser({
        userId: member.user_id,
        type: 'loan_returned',
        title: 'Book returned',
        body: fineCalc.amount
          ? `${member.title} was returned. Overdue fine: ${fineCalc.amount.toFixed(2)}.`
          : `${member.title} was returned. Thank you.`,
        metadata: { loanId: loan.id },
      }).catch(() => {});
      writeAudit({
        actorId: actor.id,
        action: 'loan.return',
        entityType: 'loan',
        entityId: loan.id,
        details: { fine: fineCalc.amount, reservationReady },
        req,
      });
    });

    return {
      loanId: loan.id,
      returnedAt: now,
      fine: fineCalc,
      finesCreated: fineIds,
      copyStatus: nextCopyStatus,
      reservationReady,
    };
  });
}

export async function renewLoan({ loanId, actor, req }) {
  return withTransaction(async (conn) => {
    const [loans] = await conn.execute('SELECT * FROM loans WHERE id = ? FOR UPDATE', [loanId]);
    const loan = loans[0];
    if (!loan) throw notFound('Loan not found');
    if (!['active', 'overdue'].includes(loan.status)) throw conflict('Loan cannot be renewed');
    if (actor.role_code === ROLE_CODES.MEMBER) {
      const [mp] = await conn.execute('SELECT id FROM member_profiles WHERE user_id = ?', [actor.id]);
      if (!mp[0] || mp[0].id !== loan.member_profile_id) throw forbidden();
    }

    const [ms] = await conn.execute(
      `SELECT mt.renewal_limit, mt.loan_period_days, mt.id AS membership_type_id, ms.branch_id
         FROM memberships ms JOIN membership_types mt ON mt.id = ms.membership_type_id
        WHERE ms.id = ?`,
      [loan.membership_id],
    );
    const type = ms[0];
    if (loan.renewal_count >= type.renewal_limit) throw conflict('Renewal limit reached');
    if (new Date(loan.due_at) < new Date()) throw conflict('Overdue loans cannot be renewed');

    const [copy] = await conn.execute('SELECT book_id FROM book_copies WHERE id = ?', [loan.copy_id]);
    const [waiting] = await conn.execute(
      `SELECT id FROM reservations WHERE book_id = ? AND status = 'queued' LIMIT 1`,
      [copy[0].book_id],
    );
    if (waiting[0]) throw conflict('Title is reserved by another member');

    const policy = await getDefaultPolicy(conn, type.membership_type_id, type.branch_id);
    const closed = await closedDates(conn, loan.branch_id);
    const newDue = computeDueDate(new Date(loan.due_at), type.loan_period_days, Boolean(policy.skip_closed_days), closed);

    await conn.execute(
      `INSERT INTO loan_renewals (loan_id, previous_due_at, new_due_at, renewed_by, renewed_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [loan.id, loan.due_at, toMysqlDateTime(newDue), actor.id],
    );
    await conn.execute(
      `UPDATE loans SET due_at = ?, renewal_count = renewal_count + 1 WHERE id = ?`,
      [toMysqlDateTime(newDue), loan.id],
    );

    setImmediate(() => {
      writeAudit({
        actorId: actor.id,
        action: 'loan.renew',
        entityType: 'loan',
        entityId: loan.id,
        details: { newDue },
        req,
      });
    });
    return { loanId: loan.id, dueAt: newDue, renewalCount: loan.renewal_count + 1 };
  });
}

export async function previewReturn(barcode) {
  const rows = await query(
    `SELECT l.id, l.due_at, l.status, b.title, c.barcode, mt.daily_fine, mt.grace_days, mt.max_fine, u.full_name
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN memberships ms ON ms.id = l.membership_id
       JOIN membership_types mt ON mt.id = ms.membership_type_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE (c.barcode = ? OR c.copy_code = ? OR l.loan_code = ?) AND l.status IN ('active','overdue')
      LIMIT 1`,
    [barcode, barcode, barcode],
  );
  if (!rows[0]) throw notFound('Active loan not found');
  const fine = calculateOverdueFine({
    dueAt: rows[0].due_at,
    returnedAt: new Date(),
    dailyFine: rows[0].daily_fine,
    graceDays: rows[0].grace_days,
    maxFine: rows[0].max_fine,
  });
  return { ...rows[0], previewFine: fine };
}
