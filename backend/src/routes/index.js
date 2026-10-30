import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, staffOnly } from '../middleware/authorize.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as auth from '../controllers/authController.js';
import * as books from '../controllers/bookController.js';
import * as circ from '../controllers/circulationController.js';
import * as members from '../controllers/memberController.js';
import * as misc from '../controllers/miscController.js';
import { ROLE_CODES } from '../config/permissions.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many login attempts' } },
});

export const router = Router();

router.post('/auth/login', loginLimiter, auth.login);
router.post('/auth/logout', auth.logout);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/forgot-password', loginLimiter, auth.forgotPassword);
router.post('/auth/reset-password', auth.resetPassword);
router.post('/auth/register', auth.register);
router.get('/auth/me', requireAuth, auth.me);
router.post('/auth/change-password', requireAuth, auth.changePassword);

router.get('/books', books.search);
router.get('/books/suggestions', books.suggestions);
router.get('/books/lookups', books.lookups);
router.get('/books/:bookId', books.getOne);
router.post('/books', requireAuth, requirePermission(PERMISSIONS.BOOKS_WRITE), books.create);
router.patch('/books/:bookId', requireAuth, requirePermission(PERMISSIONS.BOOKS_WRITE), books.update);
router.post('/books/:bookId/archive', requireAuth, requirePermission(PERMISSIONS.BOOKS_WRITE), books.archive);
router.post('/books/:bookId/copies', requireAuth, requirePermission(PERMISSIONS.COPIES_WRITE), books.addCopies);
router.patch('/copies/:copyId', requireAuth, requirePermission(PERMISSIONS.COPIES_WRITE), books.patchCopy);
router.post('/lookups/:kind', requireAuth, requirePermission(PERMISSIONS.BOOKS_WRITE), books.createLookup);
router.post('/books/:bookId/reading-list', requireAuth, books.toggleReadingList);
router.post('/books/:bookId/reviews', requireAuth, books.addReview);

router.get('/members', requireAuth, requirePermission(PERMISSIONS.MEMBERS_READ), members.list);
router.post('/members', requireAuth, requirePermission(PERMISSIONS.MEMBERS_WRITE), members.create);
router.get('/members/me', requireAuth, members.me);
router.get('/members/:memberId', requireAuth, members.getOne);
router.patch('/members/:memberId', requireAuth, members.update);
router.post('/members/:memberId/status', requireAuth, requirePermission(PERMISSIONS.MEMBERS_WRITE), members.status);
router.post('/members/:memberId/renew', requireAuth, requirePermission(PERMISSIONS.MEMBERS_WRITE), members.renew);

router.post('/loans/preview-issue', requireAuth, requirePermission(PERMISSIONS.CIRCULATION), circ.previewIssue);
router.post('/loans/issue', requireAuth, requirePermission(PERMISSIONS.CIRCULATION), circ.issue);
router.get('/loans/preview-return', requireAuth, requirePermission(PERMISSIONS.CIRCULATION), circ.previewReturn);
router.get('/loans', requireAuth, circ.listLoans);
router.get('/loans/overdue', requireAuth, circ.listLoans);
router.get('/loans/:loanId', requireAuth, circ.getLoan);
router.post('/loans/:loanId/return', requireAuth, requirePermission(PERMISSIONS.CIRCULATION), circ.returnLoan);
router.post('/loans/:loanId/renew', requireAuth, circ.renew);

router.post('/reservations', requireAuth, misc.createReservation);
router.get('/reservations', requireAuth, misc.listReservations);
router.post('/reservations/:reservationId/cancel', requireAuth, misc.cancelReservation);

router.get('/fines', requireAuth, misc.listFines);
router.post('/fines/:fineId/waive', requireAuth, requirePermission(PERMISSIONS.FINES_MANAGE), misc.waiveFine);
router.post('/payments', requireAuth, requirePermission(PERMISSIONS.PAYMENTS_RECORD), misc.recordPayment);
router.get('/payments/:paymentId/receipt', requireAuth, misc.paymentReceipt);

router.get('/dashboard/summary', requireAuth, misc.dashboardSummary);
router.get('/dashboard/circulation', requireAuth, requirePermission(PERMISSIONS.DASHBOARD_STAFF), misc.dashboardCirculation);

router.get('/reports/:type', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), misc.reports);

router.get('/notifications', requireAuth, misc.notifications);
router.patch('/notifications/:notificationId/read', requireAuth, misc.markRead);
router.post('/notifications/read-all', requireAuth, misc.markAllRead);

router.get('/admin/users', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), misc.listUsers);
router.post('/admin/users', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), misc.createUser);
router.post('/admin/users/:userId/status', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), misc.userStatus);
router.get('/admin/audit-logs', requireAuth, requirePermission(PERMISSIONS.AUDIT_VIEW), misc.auditLogs);
router.get('/admin/settings', requireAuth, requirePermission(PERMISSIONS.SETTINGS_MANAGE), misc.settings);
router.patch('/admin/settings', requireAuth, requirePermission(PERMISSIONS.SETTINGS_MANAGE), misc.patchSettings);
router.get('/admin/branches', requireAuth, staffOnly, misc.branches);
router.post('/admin/branches', requireAuth, requirePermission(PERMISSIONS.BRANCHES_MANAGE), misc.saveBranch);
router.get('/membership-types', requireAuth, misc.membershipTypes);

void ROLE_CODES;
