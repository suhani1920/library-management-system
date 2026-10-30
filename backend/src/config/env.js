import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  appName: process.env.APP_NAME || 'LibraCore',
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'libracore',
    password: process.env.DB_PASSWORD || 'libracore_dev',
    database: process.env.DB_NAME || 'libracore',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-please-32'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    issuer: process.env.JWT_ISSUER || 'libracore',
  },
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 8),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'LibraCore <noreply@localhost>',
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@libracore.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe#Admin1',
    librarianPassword: process.env.SEED_LIBRARIAN_PASSWORD || 'ChangeMe#Lib1',
    studentPassword: process.env.SEED_STUDENT_PASSWORD || 'ChangeMe#Stu1',
  },
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 4),
};

export function assertProductionSecrets() {
  if (!env.isProd) return;
  if (env.jwt.accessSecret.includes('change-me') || env.jwt.accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be a strong secret in production');
  }
  if (env.seed.adminPassword === 'ChangeMe#Admin1') {
    throw new Error('Default seed administrator credentials cannot be used in production');
  }
}
