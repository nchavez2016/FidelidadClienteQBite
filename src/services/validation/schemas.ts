/**
 * Zod validation schemas — single source of truth for shape + constraints.
 *
 * Used by:
 *   - UI forms (via react-hook-form + zodResolver) — optional, gradual adoption.
 *   - Service-layer guards (`validateOrThrow`) before any persistence call.
 *   - Future Supabase edge functions (Deno can import the same Zod schemas).
 *
 * Rules here mirror what the database/RLS policies will enforce, so the
 * client and the server agree on what "valid" means.
 */
import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\d{7,15}$/, 'Teléfono inválido (7-15 dígitos)');

const password = z.string().min(4, 'Contraseña mínima de 4 caracteres').max(100);

const name = z.string().trim().min(2, 'Nombre demasiado corto').max(80);

export const customerRegistrationSchema = z.object({
  phone,
  name,
  password,
  gender: z.enum(['masculino', 'femenino', 'otro']),
});

export const customerLoginSchema = z.object({
  phone,
  password,
});

export const staffLoginSchema = z.object({
  username: z.string().trim().min(3, 'Usuario demasiado corto').max(40),
  password,
});

export const milestoneSchema = z.object({
  id: z.string().min(1),
  requiredPoints: z.number().int().positive('Los puntos deben ser positivos'),
  rewardName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  order: z.number().int().nonnegative(),
});

export const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  branch: z.string().trim().min(2).max(80),
  startDate: z.string().min(1, 'Fecha inicial requerida'),
  endDate: z.string().min(1, 'Fecha final requerida'),
  status: z.enum(['draft', 'active', 'finished']),
  milestones: z.array(milestoneSchema).min(1, 'Define al menos un hito'),
  termsAndConditions: z.string().trim().min(10, 'T&C demasiado breves'),
  createdAt: z.string().min(1),
});

export const transactionCreationSchema = z.object({
  customerId: z.string().min(1),
  campaignId: z.string().min(1, 'Sucursal requerida'),
  type: z.enum(['accumulation', 'redemption', 'reversal', 'terms_acceptance']),
  points: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  rewardId: z.string().optional(),
  rewardName: z.string().optional(),
  staffId: z.string().min(1),
  staffName: z.string().min(1),
  commentCategory: z
    .enum(['positive', 'complaint', 'observation', 'promotion', 'suggestion', 'other'])
    .optional(),
  commentText: z.string().trim().max(500).optional(),
  reversedTransactionId: z.string().optional(),
  isReversed: z.boolean().optional(),
});

export const redemptionSchema = z.object({
  customerId: z.string().min(1),
  campaignId: z.string().min(1, 'Sucursal requerida'),
  rewardId: z.string().min(1, 'Selecciona un premio'),
});

export type CustomerRegistrationInput = z.infer<typeof customerRegistrationSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type TransactionCreationInput = z.infer<typeof transactionCreationSchema>;
export type RedemptionInput = z.infer<typeof redemptionSchema>;
