import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { query } from '../database/pool.js';
import { logger } from '../utils/logger.js';

let transporter;

export function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendMail({ to, toUserId, subject, text, html }) {
  let recipient = to;
  if (!recipient && toUserId) {
    const rows = await query('SELECT email FROM users WHERE id = ?', [toUserId]);
    recipient = rows[0]?.email;
  }
  const tx = getTransporter();
  if (!tx || !recipient) {
    logger.info('Mail skipped (SMTP not configured or missing recipient)', { subject });
    return { skipped: true };
  }
  await tx.sendMail({ from: env.smtp.from, to: recipient, subject, text, html });
  return { skipped: false };
}
