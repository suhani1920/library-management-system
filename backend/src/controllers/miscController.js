import { asyncHandler } from '../utils/asyncHandler.js';
import * as reservationService from '../services/reservationService.js';
import * as fineService from '../services/fineService.js';
import * as dashboardService from '../services/dashboardService.js';
import * as reportService from '../services/reportService.js';
import * as adminService from '../services/adminService.js';
import { query } from '../database/pool.js';
import { ROLE_CODES } from '../config/permissions.js';
import { parseBody, paymentSchema } from '../validators/schemas.js';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { forbidden } from '../utils/AppError.js';

function csv(res, filename, records) {
  const output = stringify(records, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(output);
}

export const createReservation = asyncHandler(async (req, res) => {
  let memberProfileId = req.body.memberProfileId;
  if (req.user.role_code === ROLE_CODES.MEMBER) {
    memberProfileId = (await query('SELECT id FROM member_profiles WHERE user_id = ?', [req.user.id]))[0].id;
  }
  const created = await reservationService.createReservation({
    bookId: req.body.bookId,
    memberProfileId,
    branchId: req.body.branchId || req.user.branch_id,
    actor: req.user,
    req,
  });
  res.status(201).json({ data: created });
});

export const cancelReservation = asyncHandler(async (req, res) => {
  await reservationService.cancelReservation(Number(req.params.reservationId), req.user, req);
  res.json({ data: { ok: true } });
});

export const listReservations = asyncHandler(async (req, res) => {
  res.json({ data: await reservationService.listReservations(req.query, req.user) });
});

export const listFines = asyncHandler(async (req, res) => {
  res.json({ data: await fineService.listFines(req.query, req.user) });
});

export const waiveFine = asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ amount: z.number().optional(), reason: z.string().min(3) }), req.body);
  res.json({ data: await fineService.waiveFine({ fineId: Number(req.params.fineId), ...body, actor: req.user, req }) });
});

export const recordPayment = asyncHandler(async (req, res) => {
  const body = parseBody(paymentSchema, req.body);
  res.status(201).json({ data: await fineService.recordPayment({ ...body, actor: req.user, req }) });
});

export const paymentReceipt = asyncHandler(async (req, res) => {
  res.json({ data: await fineService.getPaymentReceipt(Number(req.params.paymentId), req.user) });
});

export const dashboardSummary = asyncHandler(async (req, res) => {
  if (req.user.role_code === ROLE_CODES.MEMBER) {
    return res.json({ data: await dashboardService.memberHome(req.user.id) });
  }
  const branchId = req.user.role_code === 'librarian' ? req.user.branch_id : req.query.branchId;
  res.json({ data: await dashboardService.staffSummary(branchId ? Number(branchId) : undefined) });
});

export const dashboardCirculation = asyncHandler(async (req, res) => {
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString();
  const data = await dashboardService.circulationSeries({ from, to, branchId: req.query.branchId });
  if (req.user.role_code === ROLE_CODES.MEMBER) delete data.mostActive;
  res.json({ data });
});

export const reports = asyncHandler(async (req, res) => {
  const type = req.params.type;
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const branchId = req.query.branchId;
  const map = {
    inventory: () => reportService.inventoryReport({ branchId }),
    circulation: () => reportService.circulationReport({ from, to, branchId }),
    overdue: () => reportService.overdueReport(),
    financial: () => reportService.financialReport({ from, to }),
    members: () => reportService.memberActivityReport({ from, to }),
    popularity: () => reportService.popularityReport({ from, to }),
    lost: () => reportService.lostDamagedReport(),
    acquisitions: () => reportService.acquisitionReport({ from, to }),
    memberships: () => reportService.membershipExpiryReport(),
    reservations: () => reportService.reservationReport(),
    librarians: () => reportService.librarianReport({ from, to }),
    audit: () => adminService.listAudit(req.query),
  };
  if (!map[type]) return res.status(404).json({ error: { message: 'Unknown report' } });
  if (type === 'financial' && !req.user.permissions.includes('reports.financial') && req.user.role_code !== 'super_admin' && req.user.role_code !== 'auditor') {
    throw forbidden();
  }
  const data = await map[type]();
  if (req.query.format === 'csv') {
    const rows = Array.isArray(data) ? data : data.rows || data.items || data.daily || data.collected || [];
    return csv(res, `${type}-report.csv`, rows);
  }
  res.json({ data });
});

export const notifications = asyncHandler(async (req, res) => {
  const items = await query(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json({ data: items });
});

export const markRead = asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [
    Number(req.params.notificationId),
    req.user.id,
  ]);
  res.json({ data: { ok: true } });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.user.id]);
  res.json({ data: { ok: true } });
});

export const listUsers = asyncHandler(async (req, res) => {
  res.json({ data: await adminService.listUsers(req.query) });
});

export const createUser = asyncHandler(async (req, res) => {
  res.status(201).json({ data: await adminService.createStaffUser(req.body, req.user, req) });
});

export const userStatus = asyncHandler(async (req, res) => {
  await adminService.setUserStatus(Number(req.params.userId), req.body.status, req.user, req);
  res.json({ data: { ok: true } });
});

export const auditLogs = asyncHandler(async (req, res) => {
  res.json({ data: await adminService.listAudit(req.query) });
});

export const settings = asyncHandler(async (req, res) => {
  res.json({ data: await adminService.getSettingsMap() });
});

export const patchSettings = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body).map(([k, v]) => [
    k,
    typeof v === 'boolean' || typeof v === 'number' ? String(v) : v,
    typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string',
  ]);
  await adminService.updateSettings(entries);
  res.json({ data: { ok: true } });
});

export const branches = asyncHandler(async (req, res) => {
  res.json({ data: await adminService.listBranches() });
});

export const saveBranch = asyncHandler(async (req, res) => {
  res.json({ data: await adminService.upsertBranch(req.body, req.user, req) });
});

export const membershipTypes = asyncHandler(async (req, res) => {
  res.json({ data: await query('SELECT * FROM membership_types ORDER BY name') });
});
