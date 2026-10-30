import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { withTransaction } from '../database/pool.js';
import { AppError } from './AppError.js';

export function parseCsv(buffer) {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}

export function toCsv(rows) {
  return stringify(rows, { header: true });
}

export async function importBooksCsv(buffer, actor) {
  const rows = parseCsv(buffer);
  const errors = [];
  let success = 0;
  await withTransaction(async (conn) => {
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.title) throw new Error('title is required');
        const [res] = await conn.execute(
          `INSERT INTO books (book_code, isbn13, title, language, publication_year, keywords, status)
           VALUES ('PENDING', ?, ?, ?, ?, ?, 'active')`,
          [row.isbn13 || null, row.title, row.language || 'English', row.publication_year || null, row.keywords || null],
        );
        await conn.execute('UPDATE books SET book_code = ? WHERE id = ?', [
          `BK${String(res.insertId).padStart(6, '0')}`,
          res.insertId,
        ]);
        success += 1;
      } catch (error) {
        errors.push({ row: i + 2, message: error.message });
      }
    }
  });
  return { success, errors, actorId: actor.id };
}

export function assertCsv(req) {
  if (!req.file) throw new AppError('CSV file is required', 400);
}
