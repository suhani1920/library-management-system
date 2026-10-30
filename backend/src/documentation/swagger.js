export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'LibraCore API',
    version: '1.0.0',
    description: 'Campus library management REST API (v1). Cookie-based JWT authentication.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/auth/login': { post: { summary: 'Login', tags: ['Auth'] } },
    '/auth/logout': { post: { summary: 'Logout', tags: ['Auth'] } },
    '/auth/refresh': { post: { summary: 'Rotate refresh token', tags: ['Auth'] } },
    '/auth/me': { get: { summary: 'Current user', tags: ['Auth'] } },
    '/books': { get: { summary: 'Search catalogue', tags: ['Books'] }, post: { summary: 'Create title', tags: ['Books'] } },
    '/loans/issue': { post: { summary: 'Issue a copy', tags: ['Circulation'] } },
    '/loans/{loanId}/return': { post: { summary: 'Return a loan', tags: ['Circulation'] } },
    '/loans/{loanId}/renew': { post: { summary: 'Renew a loan', tags: ['Circulation'] } },
    '/reservations': { post: { summary: 'Create reservation', tags: ['Reservations'] } },
    '/dashboard/summary': { get: { summary: 'Dashboard metrics', tags: ['Dashboard'] } },
    '/reports/{type}': { get: { summary: 'Named report', tags: ['Reports'] } },
  },
};
