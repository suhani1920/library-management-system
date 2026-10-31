import { asyncHandler } from '../utils/asyncHandler.js';
import * as circulation from '../services/circulationService.js';
import { parseBody, issueSchema, memberIssueSchema, returnSchema } from '../validators/schemas.js';
import { query } from '../database/pool.js';
import { paginated, parsePagination } from '../utils/pagination.js';
import { ROLE_CODES } from '../config/permissions.js';
import { forbidden } from '../utils/AppError.js';

export const previewIssue = asyncHandler(async (req, res) => {
  const body = parseBody(issueSchema, req.body);
  res.json({ data: await circulation.previewIssue(body) });
});

export const issue = asyncHandler(async (req, res) => {
  const body = parseBody(issueSchema, req.body);
  const result = await circulation.issueLoan({ ...body, actor: req.user, req });
  res.status(201).json({ data: result });
});

export const previewMemberIssue = asyncHandler(async (req, res) => {
  if (req.user.role_code !== ROLE_CODES.MEMBER) throw forbidden();
  const body = parseBody(memberIssueSchema, req.body);
  res.json({ data: await circulation.previewMemberIssue({ userId: req.user.id, bookId: body.bookId }) });
});

export const issueMemberBook = asyncHandler(async (req, res) => {
  if (req.user.role_code !== ROLE_CODES.MEMBER) throw forbidden();
  const body = parseBody(memberIssueSchema, req.body);
  const result = await circulation.issueMemberBook({ ...body, userId: req.user.id, actor: req.user, req });
  res.status(201).json({ data: result });
});

export const previewReturn = asyncHandler(async (req, res) => {
  res.json({ data: await circulation.previewReturn(req.query.barcode) });
});

export const returnLoan = asyncHandler(async (req, res) => {
  const body = parseBody(returnSchema, { ...req.body, loanId: req.body.loanId || Number(req.params.loanId) });
  const result = await circulation.returnLoan({ ...body, actor: req.user, req });
  res.json({ data: result });
});

export const renew = asyncHandler(async (req, res) => {
  const result = await circulation.renewLoan({ loanId: Number(req.params.loanId), actor: req.user, req });
  res.json({ data: result });
});

export const listLoans = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const where = ['1=1'];
  const values = [];
  if (req.user.role_code === ROLE_CODES.MEMBER) {
    const mp = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [req.user.id]))[0];
    where.push('l.member_profile_id = ?');
    values.push(mp.id);
  } else if (req.query.memberId) {
    where.push('l.member_profile_id = ?');
    values.push(Number(req.query.memberId));
  }
  if (req.query.status === 'overdue') {
    where.push(`l.status IN ('active','overdue') AND l.due_at < UTC_TIMESTAMP()`);
  } else if (req.query.status) {
    where.push('l.status = ?');
    values.push(req.query.status);
  }
  const items = await query(
    `SELECT l.*, b.title, c.barcode, u.full_name, mp.member_code
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.issued_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = (await query(`SELECT COUNT(*) AS total FROM loans l WHERE ${where.join(' AND ')}`, values))[0].total;
  res.json({ data: paginated(items, total, page, limit) });
});

export const getLoan = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT l.*, b.title, c.barcode, u.full_name, mp.user_id
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
       JOIN users u ON u.id = mp.user_id
      WHERE l.id = ?`,
    [Number(req.params.loanId)],
  );
  if (req.user.role_code === ROLE_CODES.MEMBER && rows[0] && rows[0].user_id !== req.user.id) {
    throw forbidden();
  }
  res.json({ data: rows[0] });
});
