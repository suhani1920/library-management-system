export function utcNow() {
  return new Date();
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(from, to) {
  const ms = startOfUtcDay(to) - startOfUtcDay(from);
  return Math.floor(ms / 86400000);
}

export function toMysqlDateTime(date) {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

export function toMysqlDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}
