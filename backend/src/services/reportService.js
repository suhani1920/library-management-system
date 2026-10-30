import { query } from '../database/pool.js';

export async function inventoryReport({ branchId }) {
  const params = [];
  let filter = '';
  if (branchId) {
    filter = 'WHERE c.branch_id = ?';
    params.push(branchId);
  }
  const rows = await query(
    `SELECT b.book_code, b.title, b.isbn13,
            COUNT(*) AS copies,
            SUM(c.availability_status = 'available') AS available,
            SUM(c.availability_status = 'issued') AS issued,
            SUM(c.availability_status = 'reserved') AS reserved,
            SUM(c.availability_status IN ('lost','missing','withdrawn')) AS unavailable
       FROM book_copies c JOIN books b ON b.id = c.book_id
       ${filter}
      GROUP BY b.id
      ORDER BY b.title`,
    params,
  );
  const totals = rows.reduce(
    (acc, r) => {
      acc.copies += Number(r.copies);
      acc.available += Number(r.available);
      acc.issued += Number(r.issued);
      return acc;
    },
    { copies: 0, available: 0, issued: 0 },
  );
  return { rows, totals };
}

export async function circulationReport({ from, to, branchId }) {
  const params = [from, to];
  let branch = '';
  if (branchId) {
    branch = 'AND l.branch_id = ?';
    params.push(Number(branchId));
  }
  const daily = await query(
    `SELECT DATE(issued_at) AS d,
            COUNT(*) AS issued,
            SUM(returned_at IS NOT NULL AND DATE(returned_at) = DATE(issued_at)) AS returned_same_day
       FROM loans l
      WHERE l.issued_at BETWEEN ? AND ? ${branch}
      GROUP BY DATE(issued_at) ORDER BY d`,
    params,
  );
  const summary = (
    await query(
      `SELECT
         SUM(issued_at BETWEEN ? AND ?) AS issued,
         SUM(returned_at BETWEEN ? AND ?) AS returned,
         SUM(status IN ('active','overdue') AND due_at < UTC_TIMESTAMP()) AS overdue
       FROM loans l WHERE 1=1 ${branch}`,
      branchId ? [from, to, from, to, branchId] : [from, to, from, to],
    )
  )[0];
  return { daily, summary };
}

export async function overdueReport() {
  return query(
    `SELECT l.loan_code, l.due_at, DATEDIFF(UTC_DATE(), DATE(l.due_at)) AS days_overdue,
            b.title, c.barcode, u.full_name, mp.member_code, mp.department
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE l.status IN ('active','overdue') AND l.due_at < UTC_TIMESTAMP()
      ORDER BY l.due_at`,
  );
}

export async function financialReport({ from, to }) {
  const collected = await query(
    `SELECT DATE(paid_at) AS d, method, SUM(amount) AS amount
       FROM payments WHERE status = 'completed' AND paid_at BETWEEN ? AND ?
      GROUP BY DATE(paid_at), method ORDER BY d`,
    [from, to],
  );
  const outstanding = (
    await query(
      `SELECT COALESCE(SUM(outstanding_amount),0) AS amount, COUNT(*) AS count
         FROM fines WHERE status IN ('outstanding','partial')`,
    )
  )[0];
  const waivers = (
    await query(
      `SELECT COALESCE(SUM(amount),0) AS amount FROM fine_waivers WHERE created_at BETWEEN ? AND ?`,
      [from, to],
    )
  )[0];
  return { collected, outstanding, waivers };
}

export async function memberActivityReport({ from, to }) {
  return query(
    `SELECT mp.member_code, u.full_name, mp.department,
            COUNT(l.id) AS loans,
            SUM(l.status IN ('active','overdue')) AS active,
            (SELECT COALESCE(SUM(outstanding_amount),0) FROM fines f WHERE f.member_profile_id = mp.id AND f.status IN ('outstanding','partial')) AS outstanding
       FROM member_profiles mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN loans l ON l.member_profile_id = mp.id AND l.issued_at BETWEEN ? AND ?
      GROUP BY mp.id
      ORDER BY loans DESC, u.full_name`,
    [from, to],
  );
}

export async function popularityReport({ from, to }) {
  return query(
    `SELECT b.title, b.book_code, COUNT(*) AS issues
       FROM loans l JOIN book_copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
      WHERE l.issued_at BETWEEN ? AND ?
      GROUP BY b.id ORDER BY issues DESC, b.title`,
    [from, to],
  );
}

export async function lostDamagedReport() {
  return query(
    `SELECT c.copy_code, c.barcode, c.availability_status, c.condition_code, b.title, c.notes
       FROM book_copies c JOIN books b ON b.id = c.book_id
      WHERE c.condition_code = 'damaged' OR c.availability_status IN ('lost','missing','in_repair','withdrawn')
      ORDER BY b.title`,
  );
}

export async function acquisitionReport({ from, to }) {
  return query(
    `SELECT c.copy_code, c.barcode, c.acquisition_date, c.acquisition_source, c.purchase_cost, b.title
       FROM book_copies c JOIN books b ON b.id = c.book_id
      WHERE c.acquisition_date BETWEEN ? AND ?
      ORDER BY c.acquisition_date DESC`,
    [from, to],
  );
}

export async function membershipExpiryReport() {
  return query(
    `SELECT mp.member_code, u.full_name, u.email, ms.expires_at, ms.status
       FROM memberships ms
       JOIN member_profiles mp ON mp.id = ms.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE ms.status = 'active' AND ms.expires_at <= DATE_ADD(CURDATE(), INTERVAL 45 DAY)
      ORDER BY ms.expires_at`,
  );
}

export async function reservationReport() {
  return query(
    `SELECT r.reservation_code, r.status, r.reserved_at, r.ready_at, r.pickup_deadline_at, b.title, u.full_name
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       JOIN member_profiles mp ON mp.id = r.member_profile_id
       JOIN users u ON u.id = mp.user_id
      ORDER BY r.reserved_at DESC`,
  );
}

export async function librarianReport({ from, to }) {
  return query(
    `SELECT u.full_name,
            SUM(l.issued_by = u.id AND l.issued_at BETWEEN ? AND ?) AS issued,
            SUM(l.returned_by = u.id AND l.returned_at BETWEEN ? AND ?) AS returned
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN loans l ON 1=1
      WHERE r.code IN ('librarian','super_admin')
      GROUP BY u.id
      ORDER BY issued DESC`,
    [from, to, from, to],
  );
}
