import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfCookie(res, token) {
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: '/',
  });
}

export function issueCsrf(req, res, next) {
  if (!req.cookies?.csrf_token) {
    csrfCookie(res, crypto.randomBytes(24).toString('hex'));
  }
  next();
}

export function csrfProtect(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const cookie = req.cookies?.csrf_token;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) {
    return next(new AppError('Invalid CSRF token', 403, 'CSRF'));
  }
  next();
}
