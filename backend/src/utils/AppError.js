export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'Resource not found') {
  return new AppError(message, 404, 'NOT_FOUND');
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new AppError(message, 403, 'FORBIDDEN');
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(message, 401, 'UNAUTHORIZED');
}

export function conflict(message) {
  return new AppError(message, 409, 'CONFLICT');
}
