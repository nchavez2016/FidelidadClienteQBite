/**
 * Validation entry point.
 *
 * `validateOrThrow` is the imperative guard used inside services so
 * persistence is never reached with malformed data. UI may still adopt
 * `react-hook-form` + `zodResolver` against the same schemas for the
 * declarative path — both routes share one source of truth.
 */
import type { ZodSchema } from 'zod';

export * from './schemas';

export class ValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(message: string, issues: { path: string; message: string }[]) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export function validateOrThrow<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ValidationError(issues[0]?.message ?? 'Datos inválidos', issues);
  }
  return result.data;
}
