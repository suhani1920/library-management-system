import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/;

export function assertStrongPassword(password) {
  if (!STRONG.test(password || '')) {
    const err = new Error(
      'Password must be at least 10 characters and include upper, lower, number, and symbol',
    );
    err.status = 422;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, env.bcryptRounds);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
