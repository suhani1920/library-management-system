export function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const offset = (page - 1) * limit;
  const sortBy = String(query.sortBy || 'created_at');
  const sortDir = String(query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, limit, offset, sortBy, sortDir };
}

export function paginated(items, total, page, limit) {
  return {
    items,
    pagination: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit) || 1,
    },
  };
}
