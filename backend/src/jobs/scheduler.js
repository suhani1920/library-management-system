import cron from 'node-cron';
import { query } from '../database/pool.js';
import { expireReservations } from '../services/reservationService.js';
import { notifyUser } from '../notifications/notify.js';
import { logger } from '../utils/logger.js';
import { sendMail } from '../notifications/mailer.js';

async function markOverdue() {
  await query(
    `UPDATE loans SET status = 'overdue' WHERE status = 'active' AND due_at < UTC_TIMESTAMP()`,
  );
}

async function dueReminders() {
  const rows = await query(
    `SELECT l.id, mp.user_id, b.title, l.due_at
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN member_profiles mp ON mp.id = l.member_profile_id
      WHERE l.status = 'active'
        AND DATE(l.due_at) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY))`,
  );
  for (const row of rows) {
    await notifyUser({
      userId: row.user_id,
      type: 'due_soon',
      title: 'Book due soon',
      body: `${row.title} is due on ${new Date(row.due_at).toISOString().slice(0, 10)}.`,
      metadata: { loanId: row.id },
    });
  }
}

async function retryEmail() {
  const logs = await query(
    `SELECT l.id, l.notification_id, n.user_id, n.title, n.body
       FROM notification_delivery_logs l
       JOIN notifications n ON n.id = l.notification_id
      WHERE l.channel = 'email' AND l.status IN ('queued','failed') AND l.attempts < 5
      LIMIT 20`,
  );
  for (const log of logs) {
    try {
      const result = await sendMail({ toUserId: log.user_id, subject: log.title, text: log.body });
      await query(
        `UPDATE notification_delivery_logs
            SET status = ?, attempts = attempts + 1, sent_at = IF(? = 'sent', UTC_TIMESTAMP(), sent_at), last_error = NULL
          WHERE id = ?`,
        [result.skipped ? 'queued' : 'sent', result.skipped ? 'queued' : 'sent', log.id],
      );
    } catch (error) {
      await query(
        `UPDATE notification_delivery_logs SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`,
        [String(error.message).slice(0, 255), log.id],
      );
    }
  }
}

export function startScheduler() {
  cron.schedule('5 * * * *', async () => {
    try {
      await markOverdue();
      await expireReservations();
      await dueReminders();
      await retryEmail();
      logger.info('Scheduled jobs completed');
    } catch (error) {
      logger.error('Scheduled jobs failed', { message: error.message });
    }
  });
}
