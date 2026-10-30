import { asyncHandler } from '../utils/asyncHandler.js';
import * as bookService from '../services/bookService.js';
import { parseBody, bookSchema, bookUpdateSchema } from '../validators/schemas.js';
import { z } from 'zod';
import { query } from '../database/pool.js';
import { ROLE_CODES } from '../config/permissions.js';

export const search = asyncHandler(async (req, res) => {
  const result = await bookService.searchBooks(req.query, req.user);
  res.json({ data: result });
});

export const getOne = asyncHandler(async (req, res) => {
  const book = await bookService.getBook(Number(req.params.bookId));
  if (!bookService.canSeeCost(req.user)) {
    book.copies = book.copies.map((c) => {
      const { purchase_cost, ...rest } = c;
      return rest;
    });
  }
  res.json({ data: book });
});

export const create = asyncHandler(async (req, res) => {
  const body = parseBody(bookSchema, req.body);
  const created = await bookService.createBook(body, req.user, req);
  res.status(201).json({ data: created });
});

export const update = asyncHandler(async (req, res) => {
  const body = parseBody(bookUpdateSchema, req.body);
  await bookService.updateBook(Number(req.params.bookId), body, req.user, req);
  res.json({ data: { ok: true } });
});

export const archive = asyncHandler(async (req, res) => {
  await bookService.archiveBook(Number(req.params.bookId), req.user, req);
  res.json({ data: { ok: true } });
});

export const addCopies = asyncHandler(async (req, res) => {
  const body = parseBody(
    z.object({
      count: z.number().int().min(1).max(50),
      branchId: z.number().int(),
      shelfId: z.number().int().optional(),
      acquisitionSource: z.string().optional(),
      purchaseCost: z.number().optional(),
      condition: z.enum(['new', 'good', 'fair', 'damaged']).optional(),
    }),
    req.body,
  );
  const created = await bookService.addCopies(Number(req.params.bookId), body, req.user, req);
  res.status(201).json({ data: created });
});

export const patchCopy = asyncHandler(async (req, res) => {
  await bookService.updateCopy(Number(req.params.copyId), req.body, req.user, req);
  res.json({ data: { ok: true } });
});

export const lookups = asyncHandler(async (req, res) => {
  res.json({ data: await bookService.listLookups() });
});

export const createLookup = asyncHandler(async (req, res) => {
  const created = await bookService.createLookup(req.params.kind, req.body);
  res.status(201).json({ data: created });
});

export const suggestions = asyncHandler(async (req, res) => {
  const q = `%${String(req.query.q || '').slice(0, 80)}%`;
  const rows = await query(
    `SELECT id, title FROM books WHERE status = 'active' AND title LIKE ? ORDER BY title LIMIT 8`,
    [q],
  );
  res.json({ data: rows });
});

export const toggleReadingList = asyncHandler(async (req, res) => {
  const mp = (
    await query('SELECT id FROM member_profiles WHERE user_id = ?', [req.user.id])
  )[0];
  const list = (await query('SELECT id FROM reading_lists WHERE member_profile_id = ?', [mp.id]))[0];
  const bookId = Number(req.params.bookId);
  const existing = (
    await query('SELECT id FROM reading_list_items WHERE reading_list_id = ? AND book_id = ?', [list.id, bookId])
  )[0];
  if (existing) {
    await query('DELETE FROM reading_list_items WHERE id = ?', [existing.id]);
    return res.json({ data: { saved: false } });
  }
  await query('INSERT INTO reading_list_items (reading_list_id, book_id) VALUES (?, ?)', [list.id, bookId]);
  res.json({ data: { saved: true } });
});

export const addReview = asyncHandler(async (req, res) => {
  const body = parseBody(
    z.object({ rating: z.number().int().min(1).max(5), reviewText: z.string().max(2000).optional() }),
    req.body,
  );
  const mp = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [req.user.id]))[0];
  await query(
    `INSERT INTO book_reviews (book_id, member_profile_id, rating, review_text)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text)`,
    [Number(req.params.bookId), mp.id, body.rating, body.reviewText || null],
  );
  res.status(201).json({ data: { ok: true } });
});
