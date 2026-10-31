import { randomUUID } from 'node:crypto';
import { ROLE_CODES } from '../config/permissions.js';
import { query } from '../database/pool.js';
import { writeAudit } from '../middleware/audit.js';
import { notifyUser } from '../notifications/notify.js';

export async function broadcastToMembers({ title, body, actor, req }) {
  const recipients = await query(
    `SELECT u.id
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = ? AND u.status = 'active'
      ORDER BY u.id`,
    [ROLE_CODES.MEMBER],
  );
  const broadcastId = randomUUID();
  let processed = 0;
  let failed = 0;

  for (let offset = 0; offset < recipients.length; offset += 20) {
    const batch = recipients.slice(offset, offset + 20);
    const outcomes = await Promise.allSettled(batch.map(({ id }) => notifyUser({
      userId: id,
      type: 'announcement',
      title,
      body,
      metadata: { broadcastId, sentBy: actor.id },
    })));
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') processed += 1;
      else failed += 1;
    }
  }

  await writeAudit({
    actorId: actor.id,
    action: 'notification.broadcast',
    entityType: 'announcement',
    entityId: broadcastId,
    details: { title, recipients: recipients.length, processed, failed },
    req,
  });

  return { broadcastId, recipients: recipients.length, processed, failed };
}

export async function listAnnouncements() {
  return query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.broadcastId')) AS id,
            MAX(title) AS title, MAX(body) AS body,
            MIN(created_at) AS created_at,
            COUNT(*) AS recipients,
            SUM(is_read = 0) AS unread
       FROM notifications
      WHERE type = 'announcement'
        AND JSON_EXTRACT(metadata, '$.broadcastId') IS NOT NULL
      GROUP BY JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.broadcastId'))
      ORDER BY MIN(created_at) DESC
      LIMIT 50`,
  );
}