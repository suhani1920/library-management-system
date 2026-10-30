import { pool, query, withTransaction } from '../database/pool.js';
import { AppError, conflict, notFound } from '../utils/AppError.js';
import { escapeLike } from '../utils/ids.js';
import { paginated, parsePagination } from '../utils/pagination.js';
import { writeAudit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/permissions.js';

const SORT_MAP = {
  title: 'b.title',
  publicationYear: 'b.publication_year',
  created_at: 'b.created_at',
  popularity: 'loan_count',
  availability: 'available_copies',
};

export async function searchBooks(params, user) {
  const { page, limit, offset, sortBy, sortDir } = parsePagination(params);
  const where = ['b.status = ?'];
  const values = [params.status || 'active'];

  if (params.q) {
    const term = `%${escapeLike(params.q)}%`;
    where.push(
      `(b.title LIKE ? ESCAPE '\\\\' OR b.isbn13 LIKE ? ESCAPE '\\\\' OR b.isbn10 LIKE ? ESCAPE '\\\\' OR b.keywords LIKE ? ESCAPE '\\\\' OR b.classification_code LIKE ? ESCAPE '\\\\' OR EXISTS (
         SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id AND a.full_name LIKE ? ESCAPE '\\\\'
       ) OR EXISTS (
         SELECT 1 FROM publishers p WHERE p.id = b.publisher_id AND p.name LIKE ? ESCAPE '\\\\'
       ))`,
    );
    values.push(term, term, term, term, term, term, term);
  }
  if (params.categoryId) {
    where.push(
      `EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id AND bc.category_id = ?)`,
    );
    values.push(Number(params.categoryId));
  }
  if (params.authorId) {
    where.push(`EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id = b.id AND ba.author_id = ?)`);
    values.push(Number(params.authorId));
  }
  if (params.language) {
    where.push('b.language = ?');
    values.push(params.language);
  }
  if (params.availableOnly === 'true') {
    where.push(
      `EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.availability_status = 'available')`,
    );
  }

  const orderCol = SORT_MAP[sortBy] || 'b.title';
  const sql = `
    SELECT b.*, p.name AS publisher_name,
      (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id) AS copy_count,
      (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.availability_status = 'available') AS available_copies,
      (SELECT COUNT(*) FROM loans l JOIN book_copies c ON c.id = l.copy_id WHERE c.book_id = b.id) AS loan_count,
      (SELECT GROUP_CONCAT(a.full_name ORDER BY ba.author_order SEPARATOR ', ')
         FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS authors,
      (SELECT GROUP_CONCAT(cat.name SEPARATOR ', ')
         FROM book_categories bc JOIN categories cat ON cat.id = bc.category_id WHERE bc.book_id = b.id) AS categories
    FROM books b
    LEFT JOIN publishers p ON p.id = b.publisher_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderCol} ${sortDir}
    LIMIT ${limit} OFFSET ${offset}`;

  const countSql = `SELECT COUNT(*) AS total FROM books b WHERE ${where.join(' AND ')}`;
  const items = await query(sql, values);
  const total = await query(countSql, values);

  if (user && params.q && params.recordHistory !== 'false') {
    const enabled = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'search_history_enabled'`,
    );
    if (!enabled[0] || enabled[0].setting_value === 'true') {
      await query('INSERT INTO search_history (user_id, query_text) VALUES (?, ?)', [user.id, String(params.q).slice(0, 255)]);
    }
  }

  return paginated(items, total[0].total, page, limit);
}

export async function getBook(bookId) {
  const rows = await query(
    `SELECT b.*, p.name AS publisher_name,
      (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id) AS copy_count,
      (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.availability_status = 'available') AS available_copies,
      (SELECT AVG(rating) FROM book_reviews r WHERE r.book_id = b.id AND r.status = 'visible') AS avg_rating,
      (SELECT COUNT(*) FROM book_reviews r WHERE r.book_id = b.id AND r.status = 'visible') AS review_count
     FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id WHERE b.id = ?`,
    [bookId],
  );
  if (!rows[0]) throw notFound('Book not found');
  const authors = await query(
    `SELECT a.id, a.full_name FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = ? ORDER BY ba.author_order`,
    [bookId],
  );
  const categories = await query(
    `SELECT c.id, c.name FROM book_categories bc JOIN categories c ON c.id = bc.category_id WHERE bc.book_id = ?`,
    [bookId],
  );
  const copies = await query(
    `SELECT c.id, c.copy_code, c.barcode, c.availability_status, c.condition_code, c.branch_id, b.name AS branch_name,
            s.code AS shelf_code
       FROM book_copies c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN shelves s ON s.id = c.shelf_id
      WHERE c.book_id = ?`,
    [bookId],
  );
  const reviews = await query(
    `SELECT r.id, r.rating, r.review_text, r.created_at, u.full_name
       FROM book_reviews r
       JOIN member_profiles mp ON mp.id = r.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE r.book_id = ? AND r.status = 'visible'
      ORDER BY r.created_at DESC LIMIT 20`,
    [bookId],
  );
  const related = await query(
    `SELECT DISTINCT b.id, b.title, b.publication_year
       FROM books b
       JOIN book_categories bc ON bc.book_id = b.id
      WHERE b.id <> ? AND b.status = 'active' AND bc.category_id IN (
        SELECT category_id FROM book_categories WHERE book_id = ?
      )
      LIMIT 6`,
    [bookId, bookId],
  );
  return { ...rows[0], authors, categories, copies, reviews, related };
}

export async function createBook(payload, actor, req) {
  return withTransaction(async (conn) => {
    if (payload.isbn13) {
      const [dup] = await conn.execute('SELECT id FROM books WHERE isbn13 = ?', [payload.isbn13]);
      if (dup[0]) throw conflict('ISBN-13 already exists');
    }
    const [res] = await conn.execute(
      `INSERT INTO books (book_code, isbn10, isbn13, title, subtitle, description, language, edition,
        publication_year, publisher_id, classification_code, keywords, cover_image_path, status)
       VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        payload.isbn10 || null,
        payload.isbn13 || null,
        payload.title,
        payload.subtitle || null,
        payload.description || null,
        payload.language || 'English',
        payload.edition || null,
        payload.publicationYear || null,
        payload.publisherId || null,
        payload.classificationCode || null,
        payload.keywords || null,
        payload.coverImagePath || null,
      ],
    );
    const bookCode = `BK${String(res.insertId).padStart(6, '0')}`;
    await conn.execute('UPDATE books SET book_code = ? WHERE id = ?', [bookCode, res.insertId]);
    for (const [i, authorId] of (payload.authorIds || []).entries()) {
      await conn.execute('INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, ?)', [
        res.insertId,
        authorId,
        i + 1,
      ]);
    }
    for (const categoryId of payload.categoryIds || []) {
      await conn.execute('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)', [
        res.insertId,
        categoryId,
      ]);
    }
    await writeAudit({
      actorId: actor.id,
      action: 'book.create',
      entityType: 'book',
      entityId: res.insertId,
      req,
    });
    return { id: res.insertId, bookCode };
  });
}

export async function updateBook(bookId, payload, actor, req) {
  const existing = await query('SELECT id FROM books WHERE id = ?', [bookId]);
  if (!existing[0]) throw notFound('Book not found');
  const fields = [];
  const values = [];
  const map = {
    title: 'title',
    subtitle: 'subtitle',
    description: 'description',
    language: 'language',
    edition: 'edition',
    publicationYear: 'publication_year',
    publisherId: 'publisher_id',
    classificationCode: 'classification_code',
    keywords: 'keywords',
    isbn10: 'isbn10',
    isbn13: 'isbn13',
    coverImagePath: 'cover_image_path',
    status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (payload[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(payload[k]);
    }
  }
  if (fields.length) {
    values.push(bookId);
    await query(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  if (payload.authorIds) {
    await query('DELETE FROM book_authors WHERE book_id = ?', [bookId]);
    for (const [i, authorId] of payload.authorIds.entries()) {
      await query('INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, ?)', [
        bookId,
        authorId,
        i + 1,
      ]);
    }
  }
  if (payload.categoryIds) {
    await query('DELETE FROM book_categories WHERE book_id = ?', [bookId]);
    for (const categoryId of payload.categoryIds) {
      await query('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)', [bookId, categoryId]);
    }
  }
  await writeAudit({ actorId: actor.id, action: 'book.update', entityType: 'book', entityId: bookId, req });
}

export async function archiveBook(bookId, actor, req) {
  const [[{ issued }]] = await pool.query(
    `SELECT COUNT(*) AS issued FROM book_copies WHERE book_id = ? AND availability_status = 'issued'`,
    [bookId],
  );
  if (Number(issued) > 0) throw conflict('Cannot archive a title with issued copies');
  await query(`UPDATE books SET status = 'archived' WHERE id = ?`, [bookId]);
  await writeAudit({ actorId: actor.id, action: 'book.archive', entityType: 'book', entityId: bookId, req });
}

export async function addCopies(bookId, { count, branchId, shelfId, acquisitionSource, purchaseCost, condition }, actor, req) {
  const book = await query('SELECT id FROM books WHERE id = ?', [bookId]);
  if (!book[0]) throw notFound('Book not found');
  const created = [];
  await withTransaction(async (conn) => {
    for (let i = 0; i < Number(count); i += 1) {
      const [res] = await conn.execute(
        `INSERT INTO book_copies (copy_code, barcode, book_id, branch_id, shelf_id, acquisition_date,
          acquisition_source, purchase_cost, condition_code, availability_status)
         VALUES ('PENDING','PENDING', ?, ?, ?, CURDATE(), ?, ?, ?, 'available')`,
        [bookId, branchId, shelfId || null, acquisitionSource || null, purchaseCost || null, condition || 'good'],
      );
      const copyCode = `CPY${String(res.insertId).padStart(8, '0')}`;
      const barcode = `BC${String(res.insertId).padStart(10, '0')}`;
      await conn.execute('UPDATE book_copies SET copy_code = ?, barcode = ? WHERE id = ?', [
        copyCode,
        barcode,
        res.insertId,
      ]);
      created.push({ id: res.insertId, copyCode, barcode });
    }
  });
  await writeAudit({
    actorId: actor.id,
    action: 'copy.create',
    entityType: 'book',
    entityId: bookId,
    details: { count },
    req,
  });
  return created;
}

export async function updateCopy(copyId, payload, actor, req) {
  const rows = await query('SELECT * FROM book_copies WHERE id = ?', [copyId]);
  if (!rows[0]) throw notFound('Copy not found');
  if (payload.availabilityStatus === 'withdrawn') {
    if (rows[0].availability_status === 'issued') throw conflict('Cannot withdraw an issued copy');
  }
  await query(
    `UPDATE book_copies
        SET shelf_id = COALESCE(?, shelf_id),
            condition_code = COALESCE(?, condition_code),
            notes = COALESCE(?, notes),
            availability_status = COALESCE(?, availability_status),
            withdrawn_at = IF(? = 'withdrawn', UTC_TIMESTAMP(), withdrawn_at),
            withdrawn_reason = IF(? = 'withdrawn', ?, withdrawn_reason)
      WHERE id = ?`,
    [
      payload.shelfId || null,
      payload.conditionCode || null,
      payload.notes || null,
      payload.availabilityStatus || null,
      payload.availabilityStatus || null,
      payload.availabilityStatus || null,
      payload.withdrawnReason || null,
      copyId,
    ],
  );
  await writeAudit({ actorId: actor.id, action: 'copy.update', entityType: 'copy', entityId: copyId, req });
}

export async function listLookups() {
  const [authors, publishers, categories, shelves, branches] = await Promise.all([
    query('SELECT id, full_name FROM authors ORDER BY full_name'),
    query('SELECT id, name FROM publishers ORDER BY name'),
    query('SELECT id, name FROM categories ORDER BY name'),
    query('SELECT id, code, name, branch_id FROM shelves ORDER BY code'),
    query('SELECT id, code, name FROM branches WHERE is_active = 1'),
  ]);
  return { authors, publishers, categories, shelves, branches };
}

export async function createLookup(kind, payload) {
  if (kind === 'authors') {
    const [r] = await pool.execute('INSERT INTO authors (full_name, bio) VALUES (?, ?)', [
      payload.name,
      payload.bio || null,
    ]);
    return { id: r.insertId };
  }
  if (kind === 'publishers') {
    const [r] = await pool.execute('INSERT INTO publishers (name, city, country) VALUES (?, ?, ?)', [
      payload.name,
      payload.city || null,
      payload.country || null,
    ]);
    return { id: r.insertId };
  }
  if (kind === 'categories') {
    const [r] = await pool.execute('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [
      payload.name,
      payload.parentId || null,
    ]);
    return { id: r.insertId };
  }
  throw new AppError('Unknown lookup', 400);
}

export function canSeeCost(user) {
  return user?.permissions?.includes(PERMISSIONS.REPORTS_FINANCIAL) || user?.role_code === 'super_admin';
}
