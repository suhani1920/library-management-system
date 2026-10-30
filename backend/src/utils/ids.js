export function sequentialCode(prefix, id, width = 6) {
  return `${prefix}${String(id).padStart(width, '0')}`;
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}
