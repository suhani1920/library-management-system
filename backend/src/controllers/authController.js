import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';
import { parseBody, loginSchema, registerSchema } from '../validators/schemas.js';
import { z } from 'zod';

export const login = asyncHandler(async (req, res) => {
  const body = parseBody(loginSchema, req.body);
  const user = await authService.login(req, res, body);
  res.json({ data: user });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req, res);
  res.json({ data: { ok: true } });
});

export const refresh = asyncHandler(async (req, res) => {
  const user = await authService.refresh(req, res);
  res.json({ data: user });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user.id);
  res.json({ data: user });
});

export const changePassword = asyncHandler(async (req, res) => {
  const body = parseBody(
    z.object({ currentPassword: z.string(), newPassword: z.string() }),
    req.body,
  );
  await authService.changePassword(req.user, body);
  res.json({ data: { ok: true } });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ email: z.string().email() }), req.body);
  await authService.forgotPassword(body.email);
  res.json({ data: { ok: true } });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ token: z.string(), newPassword: z.string() }), req.body);
  await authService.resetPassword(body);
  res.json({ data: { ok: true } });
});

export const register = asyncHandler(async (req, res) => {
  const body = parseBody(registerSchema, req.body);
  const result = await authService.registerMember(body);
  res.status(201).json({ data: result });
});
