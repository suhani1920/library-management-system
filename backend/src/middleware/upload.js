import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const dest = path.resolve(env.uploadDir, 'covers');
fs.mkdirSync(dest, { recursive: true });

const storage = multer.diskStorage({
  destination: dest,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

export const coverUpload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new AppError('Only JPEG, PNG, or WebP images are allowed', 400));
    cb(null, true);
  },
});

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.includes('csv') || file.originalname.endsWith('.csv');
    if (!ok) return cb(new AppError('CSV file required', 400));
    cb(null, true);
  },
});
