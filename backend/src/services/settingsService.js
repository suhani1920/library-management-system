import { query } from '../database/pool.js';

export async function getSettingsMap() {
  const rows = await query('SELECT setting_key, setting_value, value_type FROM system_settings');
  const map = {};
  for (const row of rows) {
    if (row.value_type === 'boolean') map[row.setting_key] = row.setting_value === 'true';
    else if (row.value_type === 'number') map[row.setting_key] = Number(row.setting_value);
    else if (row.value_type === 'json') map[row.setting_key] = JSON.parse(row.setting_value);
    else map[row.setting_key] = row.setting_value;
  }
  return map;
}

export async function getSetting(key, fallback) {
  const rows = await query('SELECT setting_value, value_type FROM system_settings WHERE setting_key = ?', [key]);
  if (!rows[0]) return fallback;
  if (rows[0].value_type === 'boolean') return rows[0].setting_value === 'true';
  if (rows[0].value_type === 'number') return Number(rows[0].setting_value);
  return rows[0].setting_value;
}

export async function updateSettings(entries) {
  for (const [key, value, type] of entries) {
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, value_type)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), value_type = VALUES(value_type)`,
      [key, String(value), type || 'string'],
    );
  }
}
