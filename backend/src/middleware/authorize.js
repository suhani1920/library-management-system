import { forbidden, unauthorized } from '../utils/AppError.js';
import { ROLE_CODES } from '../config/permissions.js';

export function requirePermission(...codes) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const ok = codes.every((code) => req.user.permissions.includes(code));
    if (!ok) return next(forbidden('Insufficient permissions'));
    next();
  };
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role_code)) return next(forbidden());
    next();
  };
}

export function staffOnly(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role_code === ROLE_CODES.MEMBER) return next(forbidden());
  next();
}

export function assertOwnMember(req, memberProfileId) {
  if (req.user.role_code !== ROLE_CODES.MEMBER) return;
  if (Number(req.user.memberProfileId) !== Number(memberProfileId)) {
    throw forbidden('You can only access your own records');
  }
}
