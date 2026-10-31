import { asyncHandler } from '../utils/asyncHandler.js';
import { parseBody, announcementSchema } from '../validators/schemas.js';
import * as announcementService from '../services/announcementService.js';

export const list = asyncHandler(async (_req, res) => {
  res.json({ data: await announcementService.listAnnouncements() });
});

export const send = asyncHandler(async (req, res) => {
  const body = parseBody(announcementSchema, req.body);
  const result = await announcementService.broadcastToMembers({ ...body, actor: req.user, req });
  res.status(201).json({ data: result });
});