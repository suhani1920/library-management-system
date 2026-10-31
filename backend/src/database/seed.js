import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { pool, query } from './pool.js';
import { PERMISSIONS, ROLE_CODES, ROLE_PERMISSIONS } from '../config/permissions.js';
import { logger } from '../utils/logger.js';
import { toMysqlDate, toMysqlDateTime, addDays } from '../utils/dates.js';
import { BOOK_SEED } from './seedBooks.js';

async function upsertRole(code, name, description) {
  const existing = await query('SELECT id FROM roles WHERE code = ?', [code]);
  if (existing[0]) return existing[0].id;
  const [res] = await pool.execute('INSERT INTO roles (code, name, description) VALUES (?, ?, ?)', [
    code,
    name,
    description,
  ]);
  return res.insertId;
}

async function seedRolesAndPermissions() {
  const roleIds = {
    [ROLE_CODES.SUPER_ADMIN]: await upsertRole(ROLE_CODES.SUPER_ADMIN, 'Super Admin', 'Full system administration'),
    [ROLE_CODES.LIBRARIAN]: await upsertRole(ROLE_CODES.LIBRARIAN, 'Librarian', 'Circulation and catalogue operations'),
    [ROLE_CODES.AUDITOR]: await upsertRole(ROLE_CODES.AUDITOR, 'Auditor', 'Read-only inspection of records and reports'),
    [ROLE_CODES.MEMBER]: await upsertRole(ROLE_CODES.MEMBER, 'Member', 'Student or faculty library member'),
  };

  for (const code of Object.values(PERMISSIONS)) {
    const [mod] = code.split('.');
    await query(
      'INSERT INTO permissions (code, name, module) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [code, code.replace('.', ' '), mod],
    );
  }

  const perms = await query('SELECT id, code FROM permissions');
  const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));
  await query('DELETE FROM role_permissions');
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      await query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [
        roleIds[role],
        permByCode[code],
      ]);
    }
  }
  return roleIds;
}

async function seedSettings() {
  const settings = [
    ['product_name', env.appName, 'string'],
    ['guest_catalogue', 'true', 'boolean'],
    ['member_self_register', 'true', 'boolean'],
    ['require_email_verification', 'false', 'boolean'],
    ['reviews_enabled', 'true', 'boolean'],
    ['recommendations_enabled', 'true', 'boolean'],
    ['search_history_enabled', 'true', 'boolean'],
    ['currency', 'INR', 'string'],
    ['lost_book_default_charge', '1500.00', 'number'],
    ['damage_default_charge', '400.00', 'number'],
  ];
  for (const [k, v, t] of settings) {
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, value_type)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [k, v, t],
    );
  }
}

export async function runSeed() {
  if (env.isProd) {
    throw new Error('Seed is development-only. Do not run against production.');
  }

  const roleIds = await seedRolesAndPermissions();
  await seedSettings();

  let campus = (await query('SELECT id FROM branches WHERE code = ?', ['MAIN']))[0];
  if (!campus) {
    const [res] = await pool.execute(
      `INSERT INTO branches (code, name, address, phone, email) VALUES (?, ?, ?, ?, ?)`,
      ['MAIN', 'Central Campus Library', 'Academic Block A, University Campus', '080-555-0100', 'library@campus.edu'],
    );
    campus = { id: res.insertId };
  }
  const annex = (await query('SELECT id FROM branches WHERE code = ?', ['ANNEX']))[0] ||
    (await pool.execute(
      `INSERT INTO branches (code, name, address) VALUES (?, ?, ?)`,
      ['ANNEX', 'Engineering Annex', 'Engineering Block, East Wing'],
    ).then(([r]) => ({ id: r.insertId })));

  const types = [
    ['UG', 'Undergraduate', 4, 14, 1, 5, 200, 1, 3],
    ['PG', 'Postgraduate', 6, 21, 2, 5, 300, 2, 4],
    ['FAC', 'Faculty', 10, 30, 3, 2, 150, 3, 6],
  ];
  const typeIds = {};
  for (const t of types) {
    const existing = (await query('SELECT id FROM membership_types WHERE code = ?', [t[0]]))[0];
    if (existing) typeIds[t[0]] = existing.id;
    else {
      const [r] = await pool.execute(
        `INSERT INTO membership_types
          (code, name, borrow_limit, loan_period_days, renewal_limit, daily_fine, max_fine, grace_days, reservation_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t,
      );
      typeIds[t[0]] = r.insertId;
    }
  }

  const policy = (await query('SELECT id FROM loan_policies WHERE is_default = 1'))[0];
  if (!policy) {
    await query(
      `INSERT INTO loan_policies (name, loan_period_days, renewal_limit, skip_closed_days, block_if_overdue,
        block_if_unpaid_fine, unpaid_fine_threshold, allow_reserve_available, pickup_hours, is_default)
       VALUES ('Campus default', 14, 1, 1, 1, 1, 0.00, 0, 48, 1)`,
    );
  }

  for (let d = 0; d < 7; d += 1) {
    await query(
      `INSERT INTO operating_hours (branch_id, weekday, opens_at, closes_at, is_closed)
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_closed = VALUES(is_closed)`,
      [campus.id, d, d === 0 ? null : '08:00:00', d === 0 ? null : '20:00:00', d === 0 ? 1 : 0],
    );
  }

  await query(
    `INSERT INTO holidays (branch_id, holiday_date, name) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [campus.id, '2026-01-26', 'Republic Day'],
  );

  const adminHash = await bcrypt.hash(env.seed.adminPassword, env.bcryptRounds);
  const libHash = await bcrypt.hash(env.seed.librarianPassword, env.bcryptRounds);
  const stuHash = await bcrypt.hash(env.seed.studentPassword, env.bcryptRounds);

  async function upsertUser({ email, name, roleId, branchId, status = 'active', hash, mustChange = 0 }) {
    const existing = (await query('SELECT id FROM users WHERE email = ?', [email]))[0];
    if (existing) return existing.id;
    const [r] = await pool.execute(
      `INSERT INTO users (email, password_hash, full_name, role_id, branch_id, status, email_verified_at, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [email, hash, name, roleId, branchId, status, mustChange],
    );
    return r.insertId;
  }

  const adminId = await upsertUser({
    email: env.seed.adminEmail,
    name: 'Campus Administrator',
    roleId: roleIds[ROLE_CODES.SUPER_ADMIN],
    branchId: campus.id,
    hash: adminHash,
  });
  const librarianId = await upsertUser({
    email: 'librarian@libracore.local',
    name: 'Meera Iyer',
    roleId: roleIds[ROLE_CODES.LIBRARIAN],
    branchId: campus.id,
    hash: libHash,
  });
  await upsertUser({
    email: 'annex.librarian@libracore.local',
    name: 'Rahul Deshpande',
    roleId: roleIds[ROLE_CODES.LIBRARIAN],
    branchId: annex.id,
    hash: libHash,
  });
  await upsertUser({
    email: 'auditor@libracore.local',
    name: 'Anita Rao',
    roleId: roleIds[ROLE_CODES.AUDITOR],
    branchId: campus.id,
    hash: libHash,
  });

  const students = [
    ['aditi.sharma@campus.edu', 'Aditi Sharma', 'CS2021001', 'Computer Science', 'B.Tech CSE', '2024-25', 'UG'],
    ['arjun.nair@campus.edu', 'Arjun Nair', 'CS2021044', 'Computer Science', 'B.Tech CSE', '2023-24', 'UG'],
    ['neha.patel@campus.edu', 'Neha Patel', 'EC2022012', 'Electronics', 'B.Tech ECE', '2024-25', 'UG'],
    ['vikram.joshi@campus.edu', 'Vikram Joshi', 'ME2020088', 'Mechanical', 'B.Tech ME', '2022-23', 'UG'],
    ['sara.khan@campus.edu', 'Sara Khan', 'CS2023007', 'Computer Science', 'M.Tech CSE', '2025-26', 'PG'],
    ['dev.menon@campus.edu', 'Dev Menon', 'MBA2024011', 'Management', 'MBA', '2025-26', 'PG'],
    ['priya.das@campus.edu', 'Priya Das', 'FAC-CS-09', 'Computer Science', 'Faculty', '2025-26', 'FAC'],
    ['kiran.bose@campus.edu', 'Kiran Bose', 'CE2021103', 'Civil', 'B.Tech CE', '2023-24', 'UG'],
    ['isha.verma@campus.edu', 'Isha Verma', 'CS2022061', 'Computer Science', 'B.Tech CSE', '2024-25', 'UG'],
    ['rohan.gupta@campus.edu', 'Rohan Gupta', 'EE2020155', 'Electrical', 'B.Tech EE', '2022-23', 'UG'],
  ];

  const memberIds = [];
  for (const [email, name, sid, dept, program, year, type] of students) {
    const userId = await upsertUser({
      email,
      name,
      roleId: roleIds[ROLE_CODES.MEMBER],
      branchId: campus.id,
      hash: stuHash,
    });
    let profile = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [userId]))[0];
    if (!profile) {
      const code = `MEM${String(userId).padStart(6, '0')}`;
      const [r] = await pool.execute(
        `INSERT INTO member_profiles (user_id, member_code, student_id, department, program, academic_year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, code, sid, dept, program, year],
      );
      profile = { id: r.insertId };
      await query('INSERT INTO reading_lists (member_profile_id) VALUES (?)', [profile.id]);
    }
    await query(
      `UPDATE memberships SET status = 'expired'
        WHERE member_profile_id = ? AND status = 'active' AND expires_at < CURDATE()`,
      [profile.id],
    );
    const membership = (await query(
      `SELECT id FROM memberships
        WHERE member_profile_id = ? AND status = 'active' AND expires_at >= CURDATE()
        ORDER BY id DESC LIMIT 1`,
      [profile.id],
    ))[0];
    if (!membership) {
      await query(
        `INSERT INTO memberships (member_profile_id, membership_type_id, branch_id, starts_at, expires_at, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [profile.id, typeIds[type], campus.id, toMysqlDate(new Date()), toMysqlDate(addDays(new Date(), 365))],
      );
    }
    memberIds.push(profile.id);
  }

  const publishers = [
    ['Pearson India', 'Noida', 'India'],
    ['McGraw Hill', 'Chennai', 'India'],
    ['PHI Learning', 'Delhi', 'India'],
    ['O’Reilly Media', 'Sebastopol', 'USA'],
    ['Cambridge University Press', 'Cambridge', 'UK'],
    ['Oxford University Press', 'Oxford', 'UK'],
    ['Springer', 'Berlin', 'Germany'],
    ['Wiley', 'Hoboken', 'USA'],
  ];
  const publisherIds = [];
  for (const [name, city, country] of publishers) {
    const existing = (await query('SELECT id FROM publishers WHERE name = ?', [name]))[0];
    if (existing) publisherIds.push(existing.id);
    else {
      const [r] = await pool.execute('INSERT INTO publishers (name, city, country) VALUES (?, ?, ?)', [
        name,
        city,
        country,
      ]);
      publisherIds.push(r.insertId);
    }
  }

  const authorNames = [
    'Thomas H. Cormen',
    'Andrew S. Tanenbaum',
    'Abraham Silberschatz',
    'Ramez Elmasri',
    'Ian Sommerville',
    'Roger S. Pressman',
    'Bjarne Stroustrup',
    'Herbert Schildt',
    'E. Balagurusamy',
    'Forouzan Behrouz',
    'William Stallings',
    'Stuart Russell',
    'Peter Norvig',
    'Martin Fowler',
    'Robert C. Martin',
    'Erich Gamma',
    'Donald Knuth',
    'Brian W. Kernighan',
    'Dennis Ritchie',
    'Raj Jain',
    'Navathe Shamkant',
    'Korth Henry',
    'Mano M. Morris',
    'Nagrath I.J.',
    'B.S. Grewal',
    'R.K. Bansal',
    'John L. Hennessy',
    'David A. Patterson',
    'James F. Kurose',
    'Keith W. Ross',
  ];
  const authorIds = [];
  for (const name of authorNames) {
    const existing = (await query('SELECT id FROM authors WHERE full_name = ?', [name]))[0];
    if (existing) authorIds.push(existing.id);
    else {
      const [r] = await pool.execute('INSERT INTO authors (full_name) VALUES (?)', [name]);
      authorIds.push(r.insertId);
    }
  }

  const categoryNames = [
    'Algorithms',
    'Operating Systems',
    'Database Systems',
    'Computer Networks',
    'Software Engineering',
    'Programming Languages',
    'Artificial Intelligence',
    'Computer Architecture',
    'Mathematics',
    'Electronics',
    'Mechanical',
    'Management',
    'Literature',
  ];
  const categoryIds = [];
  for (const name of categoryNames) {
    const existing = (await query('SELECT id FROM categories WHERE name = ?', [name]))[0];
    if (existing) categoryIds.push(existing.id);
    else {
      const [r] = await pool.execute('INSERT INTO categories (name) VALUES (?)', [name]);
      categoryIds.push(r.insertId);
    }
  }

  const shelfSpecs = [
    [campus.id, 'A1', 'Stacks A1', 'Ground'],
    [campus.id, 'A2', 'Stacks A2', 'Ground'],
    [campus.id, 'B1', 'Reference B1', 'First'],
    [annex.id, 'E1', 'Engineering E1', 'Ground'],
  ];
  const shelfIds = [];
  for (const [bid, code, name, floor] of shelfSpecs) {
    const existing = (await query('SELECT id FROM shelves WHERE branch_id = ? AND code = ?', [bid, code]))[0];
    if (existing) shelfIds.push(existing.id);
    else {
      const [r] = await pool.execute(
        'INSERT INTO shelves (branch_id, code, name, floor_label) VALUES (?, ?, ?, ?)',
        [bid, code, name, floor],
      );
      shelfIds.push(r.insertId);
    }
  }

  const bookIds = [];
  for (const [i, book] of BOOK_SEED.entries()) {
    const existing = (await query('SELECT id FROM books WHERE book_code = ?', [book.code]))[0];
    let bookId;
    if (existing) bookId = existing.id;
    else {
      const [r] = await pool.execute(
        `INSERT INTO books (book_code, isbn10, isbn13, title, subtitle, description, language, edition,
          publication_year, publisher_id, classification_code, keywords, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          book.code,
          book.isbn10,
          book.isbn13,
          book.title,
          book.subtitle,
          book.description,
          'English',
          book.edition,
          book.year,
          publisherIds[book.publisher % publisherIds.length],
          book.ddc,
          book.keywords,
        ],
      );
      bookId = r.insertId;
      await query('INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, 1)', [
        bookId,
        authorIds[book.author % authorIds.length],
      ]);
      await query('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)', [
        bookId,
        categoryIds[book.category % categoryIds.length],
      ]);
    }
    bookIds.push(bookId);

    const copies = (await query('SELECT COUNT(*) AS c FROM book_copies WHERE book_id = ?', [bookId]))[0].c;
    if (Number(copies) === 0) {
      const n = 2 + (i % 3);
      for (let c = 1; c <= n; c += 1) {
        const barcode = `BC${String(bookId).padStart(5, '0')}${String(c).padStart(2, '0')}`;
        const copyCode = `CPY${String(bookId).padStart(5, '0')}${String(c).padStart(2, '0')}`;
        const branchId = c === n && i % 5 === 0 ? annex.id : campus.id;
        const shelfId = branchId === annex.id ? shelfIds[3] : shelfIds[i % 3];
        await query(
          `INSERT INTO book_copies (copy_code, barcode, book_id, branch_id, shelf_id, acquisition_date,
            acquisition_source, purchase_cost, condition_code, availability_status)
           VALUES (?, ?, ?, ?, ?, ?, 'Vendor intake', ?, 'good', 'available')`,
          [copyCode, barcode, bookId, branchId, shelfId, '2024-08-15', (450 + i * 12).toFixed(2)],
        );
      }
    }
  }

  const copies = await query(
    `SELECT id, book_id, barcode FROM book_copies WHERE availability_status = 'available' ORDER BY id`,
  );

  async function issueLoan(copy, memberProfileId, daysAgo, dueOffset, returned = false, overdue = false) {
    const issued = addDays(new Date(), -daysAgo);
    const due = addDays(issued, dueOffset);
    const membership = (
      await query(`SELECT id FROM memberships WHERE member_profile_id = ? AND status = 'active' LIMIT 1`, [
        memberProfileId,
      ])
    )[0];
    const [loanRes] = await pool.execute(
      `INSERT INTO loans (loan_code, copy_id, member_profile_id, membership_id, issued_by, branch_id, issued_at, due_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `LNSEED${copy.id}`,
        copy.id,
        memberProfileId,
        membership.id,
        librarianId,
        campus.id,
        toMysqlDateTime(issued),
        toMysqlDateTime(due),
        returned ? 'returned' : overdue ? 'overdue' : 'active',
      ],
    );
    if (returned) {
      await query(
        `UPDATE loans SET returned_at = ?, returned_by = ?, status = 'returned' WHERE id = ?`,
        [toMysqlDateTime(addDays(due, -1)), librarianId, loanRes.insertId],
      );
      await query(`UPDATE book_copies SET availability_status = 'available' WHERE id = ?`, [copy.id]);
    } else {
      await query(`UPDATE book_copies SET availability_status = 'issued' WHERE id = ?`, [copy.id]);
    }
    return loanRes.insertId;
  }

  const existingLoans = (await query('SELECT COUNT(*) AS c FROM loans'))[0].c;
  if (Number(existingLoans) === 0 && copies.length > 10) {
    await issueLoan(copies[0], memberIds[0], 5, 14, false, false);
    await issueLoan(copies[1], memberIds[1], 20, 14, false, true);
    await issueLoan(copies[2], memberIds[2], 40, 14, true, false);
    await issueLoan(copies[3], memberIds[3], 3, 14, false, false);
    const overdueLoan = await issueLoan(copies[4], memberIds[4], 25, 14, false, true);
    await query(
      `INSERT INTO fines (fine_code, member_profile_id, loan_id, copy_id, fine_type, amount, outstanding_amount, status, reason, created_by)
       VALUES ('FNSEED1', ?, ?, ?, 'overdue', 55.00, 55.00, 'outstanding', 'Overdue charge from seed', ?)`,
      [memberIds[4], overdueLoan, copies[4].id, librarianId],
    );
    await query(
      `INSERT INTO reservations (reservation_code, book_id, member_profile_id, branch_id, queue_position, status, reserved_at)
       VALUES ('RSSEED1', ?, ?, ?, 1, 'queued', UTC_TIMESTAMP())`,
      [bookIds[0], memberIds[5], campus.id],
    );
    await query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT user_id, 'due_soon', 'Book due soon', 'Introduction to Algorithms is due in 2 days.'
         FROM member_profiles WHERE id = ?`,
      [memberIds[0]],
    );
    await query(
      `INSERT INTO reading_list_items (reading_list_id, book_id)
       SELECT id, ? FROM reading_lists WHERE member_profile_id = ?`,
      [bookIds[1], memberIds[0]],
    );
    await query(
      `INSERT INTO book_reviews (book_id, member_profile_id, rating, review_text)
       VALUES (?, ?, 5, 'Clear explanations and excellent exercises for semester revision.')`,
      [bookIds[0], memberIds[2]],
    );
  }

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'seed.completed', 'system', '0', JSON_OBJECT('note','Development seed applied'))`,
    [adminId],
  );

  logger.info('Seed complete', {
    admin: env.seed.adminEmail,
    librarian: 'librarian@libracore.local',
    member: 'aditi.sharma@campus.edu',
  });
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
