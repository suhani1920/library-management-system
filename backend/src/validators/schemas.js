import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  fullName: z.string().min(2).max(150),
  phone: z.string().optional(),
  studentId: z.string().min(2),
  department: z.string().optional(),
  program: z.string().optional(),
  academicYear: z.string().optional(),
});

export const bookSchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isbn10: z.string().length(10).optional().nullable(),
  isbn13: z.string().length(13).optional().nullable(),
  language: z.string().optional(),
  edition: z.string().optional().nullable(),
  publicationYear: z.number().int().min(1400).max(2100).optional().nullable(),
  publisherId: z.number().int().optional().nullable(),
  classificationCode: z.string().optional().nullable(),
  keywords: z.string().optional().nullable(),
  authorIds: z.array(z.number().int()).optional(),
  categoryIds: z.array(z.number().int()).optional(),
});

export const bookUpdateSchema = bookSchema.partial().extend({
  status: z.enum(['active', 'archived', 'withdrawn']).optional(),
});

export const issueSchema = z.object({
  memberKey: z.string().min(1),
  barcode: z.string().min(1),
  notes: z.string().optional(),
});

export const returnSchema = z.object({
  loanId: z.number().int().optional(),
  barcode: z.string().optional(),
  condition: z.enum(['good', 'fair', 'damaged', 'lost']).optional(),
  damageCharge: z.number().optional(),
  notes: z.string().optional(),
});

export const paymentSchema = z.object({
  memberProfileId: z.number().int(),
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'upi', 'other']).optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({ fineId: z.number().int(), amount: z.number().positive() })).optional(),
});

export function parseBody(schema, body) {
  return schema.parse(body);
}
