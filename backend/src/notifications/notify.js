import { query } from '../database/pool.js';
import { logger } from '../utils/logger.js';
import { sendMail } from './mailer.js';

export async function notifyUser({ userId, type, title, body, metadata }) {
  const prefs = await query(
    'SELECT in_app, email FROM notification_preferences WHERE user_id = ? AND type = ?',
    [userId, type],
  );
  const inApp = prefs[0] ? Boolean(prefs[0].in_app) : true;
  const emailOn = prefs[0] ? Boolean(prefs[0].email) : true;

  if (inApp) {
    const [res] = await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, body, metadata ? JSON.stringify(metadata) : null],
    );
    const notificationId = res?.insertId;
    if (notificationId) {
      await query(
        `INSERT INTO notification_delivery_logs (notification_id, channel, status, attempts)
         VALUES (?, 'in_app', 'sent', 1)`,
        [notificationId],
      );
      if (emailOn) {
        await query(
          `INSERT INTO notification_delivery_logs (notification_id, channel, status, attempts)
           VALUES (?, 'email', 'queued', 0)`,
          [notificationId],
        );
      }
    }
    return;
  }

  if (emailOn) {
    try {
      await sendMail({ toUserId: userId, subject: title, text: body });
    } catch (error) {
      logger.warn('Email notify failed', { message: error.message });
    }
  }
}
