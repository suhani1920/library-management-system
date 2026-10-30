import { query } from '../database/pool.js';
import { logger } from '../utils/logger.js';

export async function writeAudit({ actorId, action, entityType, entityId, details, req }) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actorId || null,
        action,
        entityType,
        entityId == null ? null : String(entityId),
        details ? JSON.stringify(details) : null,
        req?.ip || null,
        req?.get?.('user-agent')?.slice(0, 255) || null,
      ],
    );
  } catch (error) {
    logger.warn('Audit write failed', { message: error.message });
  }
}
