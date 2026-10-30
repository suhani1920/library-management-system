import { query } from '../database/pool.js';
import { ROLE_CODES } from '../config/permissions.js';

export async function staffSummary(branchId) {
  const branchFilter = branchId ? 'AND c.branch_id = ?' : '';
  const params = branchId ? [branchId] : [];
  const loanBranch = branchId ? 'AND l.branch_id = ?' : '';

  const titles = (await query(`SELECT COUNT(*) AS n FROM books WHERE status = 'active'`))[0];
  const copies = (
    await query(
      `SELECT COUNT(*) AS n FROM book_copies c WHERE availability_status NOT IN ('withdrawn') ${branchFilter}`,
      params,
    )
  )[0];
  const available = (
    await query(
      `SELECT COUNT(*) AS n FROM book_copies c WHERE availability_status = 'available' ${branchFilter}`,
      params,
    )
  )[0];
  const issued = (
    await query(
      `SELECT COUNT(*) AS n FROM book_copies c WHERE availability_status = 'issued' ${branchFilter}`,
      params,
    )
  )[0];
  const members = (
    await query(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'member' AND u.status = 'active'`,
    )
  )[0];
  const overdue = (
    await query(
      `SELECT COUNT(*) AS n FROM loans l WHERE l.status IN ('active','overdue') AND l.due_at < UTC_TIMESTAMP() ${loanBranch}`,
      params,
    )
  )[0];
  const reservations = (
    await query(`SELECT COUNT(*) AS n FROM reservations WHERE status IN ('queued','ready')`)
  )[0];
  const fines = (
    await query(
      `SELECT COALESCE(SUM(outstanding_amount),0) AS n FROM fines WHERE status IN ('outstanding','partial')`,
    )
  )[0];
  const addedMonth = (
    await query(`SELECT COUNT(*) AS n FROM books WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')`)
  )[0];
  const issuesToday = (
    await query(`SELECT COUNT(*) AS n FROM loans l WHERE DATE(l.issued_at) = UTC_DATE() ${loanBranch}`, params)
  )[0];
  const returnsToday = (
    await query(`SELECT COUNT(*) AS n FROM loans l WHERE DATE(l.returned_at) = UTC_DATE() ${loanBranch}`, params)
  )[0];

  const recent = await query(
    `SELECT l.id, l.loan_code, l.status, l.issued_at, l.returned_at, l.due_at, b.title, u.full_name, c.barcode
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      ORDER BY COALESCE(l.returned_at, l.issued_at) DESC LIMIT 8`,
  );
  const overdueList = await query(
    `SELECT l.id, l.due_at, b.title, u.full_name, mp.member_code, c.barcode
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE l.status IN ('active','overdue') AND l.due_at < UTC_TIMESTAMP()
      ORDER BY l.due_at ASC LIMIT 8`,
  );
  const pickup = await query(
    `SELECT r.id, r.pickup_deadline_at, b.title, u.full_name
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       JOIN member_profiles mp ON mp.id = r.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE r.status = 'ready'
      ORDER BY r.pickup_deadline_at ASC LIMIT 8`,
  );
  const damaged = await query(
    `SELECT c.id, c.barcode, c.availability_status, c.condition_code, b.title
       FROM book_copies c JOIN books b ON b.id = c.book_id
      WHERE c.condition_code = 'damaged' OR c.availability_status IN ('lost','missing','in_repair')
      LIMIT 8`,
  );
  const lowStock = await query(
    `SELECT b.id, b.title,
            SUM(c.availability_status = 'available') AS available_copies,
            COUNT(*) AS copies,
            (SELECT COUNT(*) FROM reservations r WHERE r.book_id = b.id AND r.status = 'queued') AS queued
       FROM books b JOIN book_copies c ON c.book_id = b.id
      WHERE b.status = 'active'
      GROUP BY b.id
      HAVING queued > 0 OR available_copies <= 1
      ORDER BY queued DESC, available_copies ASC
      LIMIT 8`,
  );
  const adminActions = await query(
    `SELECT a.id, a.action, a.entity_type, a.created_at, u.full_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT 8`,
  );

  return {
    metrics: {
      activeTitles: Number(titles[0].n),
      totalCopies: Number(copies[0].n),
      availableCopies: Number(available[0].n),
      issuedCopies: Number(issued[0].n),
      activeMembers: Number(members[0].n),
      overdueLoans: Number(overdue[0].n),
      reservationsWaiting: Number(reservations[0].n),
      outstandingFines: Number(fines[0].n),
      booksAddedThisMonth: Number(addedMonth[0].n),
      issuesToday: Number(issuesToday[0].n),
      returnsToday: Number(returnsToday[0].n),
    },
    recent,
    overdueList,
    pickup,
    damaged,
    lowStock,
    adminActions,
  };
}

export async function circulationSeries({ from, to, branchId }) {
  const params = [from, to];
  let branch = '';
  if (branchId) {
    branch = 'AND branch_id = ?';
    params.push(branchId);
  }
  const issued = await query(
    `SELECT DATE(issued_at) AS d, COUNT(*) AS n FROM loans
      WHERE issued_at BETWEEN ? AND ? ${branch}
      GROUP BY DATE(issued_at) ORDER BY d`,
    params,
  );
  const returned = await query(
    `SELECT DATE(returned_at) AS d, COUNT(*) AS n FROM loans
      WHERE returned_at BETWEEN ? AND ? ${branch}
      GROUP BY DATE(returned_at) ORDER BY d`,
    params,
  );
  const mostBorrowed = await query(
    `SELECT b.id, b.title, COUNT(*) AS issues
       FROM loans l JOIN book_copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
      WHERE l.issued_at BETWEEN ? AND ?
      GROUP BY b.id ORDER BY issues DESC LIMIT 8`,
    [from, to],
  );
  const mostActive = await query(
    `SELECT u.full_name, mp.member_code, COUNT(*) AS issues
       FROM loans l JOIN member_profiles mp ON mp.id = l.member_profile_id JOIN users u ON u.id = mp.user_id
      WHERE l.issued_at BETWEEN ? AND ?
      GROUP BY mp.id ORDER BY issues DESC LIMIT 8`,
    [from, to],
  );
  const categories = await query(
    `SELECT cat.name, COUNT(*) AS copies
       FROM book_copies c
       JOIN books b ON b.id = c.book_id
       JOIN book_categories bc ON bc.book_id = b.id
       JOIN categories cat ON cat.id = bc.category_id
      GROUP BY cat.id ORDER BY copies DESC`,
  );
  const membershipGrowth = await query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS n
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'member'
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month`,
  );
  const overdueTrend = await query(
    `SELECT DATE(due_at) AS d, COUNT(*) AS n FROM loans
      WHERE due_at BETWEEN ? AND ? AND due_at < COALESCE(returned_at, UTC_TIMESTAMP())
      GROUP BY DATE(due_at) ORDER BY d`,
    [from, to],
  );
  const popularSearches = await query(
    `SELECT query_text, COUNT(*) AS n FROM search_history
      WHERE created_at BETWEEN ? AND ?
      GROUP BY query_text ORDER BY n DESC LIMIT 8`,
    [from, to],
  );
  return { issued, returned, mostBorrowed, mostActive, categories, membershipGrowth, overdueTrend, popularSearches };
}

export async function memberHome(userId) {
  const mp = (await query('SELECT id, member_code FROM member_profiles WHERE user_id = ?', [userId]))[0];
  if (!mp) return { role: 'staff' };
  const loans = await query(
    `SELECT l.id, l.loan_code, l.due_at, l.status, l.renewal_count, b.title, b.id AS book_id, c.barcode
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
      WHERE l.member_profile_id = ? AND l.status IN ('active','overdue')
      ORDER BY l.due_at`,
    [mp.id],
  );
  const reservations = await query(
    `SELECT r.*, b.title FROM reservations r JOIN books b ON b.id = r.book_id
      WHERE r.member_profile_id = ? AND r.status IN ('queued','ready')`,
    [mp.id],
  );
  const fines = await query(
    `SELECT COALESCE(SUM(outstanding_amount),0) AS outstanding FROM fines
      WHERE member_profile_id = ? AND status IN ('outstanding','partial')`,
    [mp.id],
  );
  const notifications = await query(
    `SELECT id, type, title, body, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`,
    [userId],
  );
  const saved = await query(
    `SELECT b.id, b.title, b.publication_year
       FROM reading_list_items i
       JOIN reading_lists rl ON rl.id = i.reading_list_id
       JOIN books b ON b.id = i.book_id
      WHERE rl.member_profile_id = ?
      ORDER BY i.created_at DESC LIMIT 8`,
    [mp.id],
  );
  const recommended = await query(
    `SELECT b.id, b.title, b.publication_year, COUNT(*) AS score
       FROM books b
       JOIN book_categories bc ON bc.book_id = b.id
      WHERE b.status = 'active' AND bc.category_id IN (
        SELECT bc2.category_id FROM loans l
          JOIN book_copies c ON c.id = l.copy_id
          JOIN book_categories bc2 ON bc2.book_id = c.book_id
         WHERE l.member_profile_id = ?
      ) AND b.id NOT IN (
        SELECT c.book_id FROM loans l JOIN book_copies c ON c.id = l.copy_id WHERE l.member_profile_id = ?
      )
      GROUP BY b.id
      ORDER BY score DESC, b.title
      LIMIT 6`,
    [mp.id, mp.id],
  );
  return {
    memberCode: mp.member_code,
    loans,
    reservations,
    outstandingFines: Number(fines[0].outstanding),
    notifications,
    saved,
    recommended,
  };
}
