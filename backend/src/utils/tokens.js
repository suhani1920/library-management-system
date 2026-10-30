import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role_code, mustChange: user.must_change_password },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl, issuer: env.jwt.issuer },
  );
}

export function signRefreshToken(user, jti) {
  return jwt.sign({ sub: user.id, jti }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
    issuer: env.jwt.issuer,
  });
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: '/',
    maxAge: maxAgeMs,
  };
}
