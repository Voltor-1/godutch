import { z } from 'zod';

// Integer cents validator — rejects floats and negative values
export const centsSchema = z.number().int().nonnegative();

// High-entropy token validator
export const tokenSchema = z.string().min(16).max(128);

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    return { error: message };
  }
  return { data: result.data };
}
