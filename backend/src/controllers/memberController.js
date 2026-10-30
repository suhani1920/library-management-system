import { asyncHandler } from '../utils/asyncHandler.js';
import * as memberService from '../services/memberService.js';
import { z } from 'zod';
import { parseBody } from '../validators/schemas.js';

export const list = asyncHandler(async (req, res) => {
  res.json({ data: await memberService.listMembers(req.query) });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ data: await memberService.getMember(Number(req.params.memberId), req.user) });
});

export const create = asyncHandler(async (req, res) => {
  const body = parseBody(
    z.object({
      email: z.string().email(),
      fullName: z.string().min(2),
      phone: z.string().optional(),
      studentId: z.string().optional(),
      department: z.string().optional(),
      program: z.string().optional(),
      academicYear: z.string().optional(),
      membershipTypeId: z.number().int(),
      branchId: z.number().int(),
      password: z.string().optional(),
    }),
    req.body,
  );
  const created = await memberService.createMember(body, req.user, req);
  res.status(201).json({ data: created });
});

export const update = asyncHandler(async (req, res) => {
  await memberService.updateMember(Number(req.params.memberId), req.body, req.user, req);
  res.json({ data: { ok: true } });
});

export const status = asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['active', 'suspended', 'inactive']) }), req.body);
  await memberService.setMemberStatus(Number(req.params.memberId), body.status, req.user, req);
  res.json({ data: { ok: true } });
});

export const renew = asyncHandler(async (req, res) => {
  await memberService.renewMembership(Number(req.params.memberId), req.body.months, req.user, req);
  res.json({ data: { ok: true } });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ data: await memberService.getMyProfile(req.user.id) });
});
