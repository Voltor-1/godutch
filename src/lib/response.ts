import type { Context } from 'hono';
import { HTTP_STATUS, type AppErrorCode } from './errors';
import type { ErrorEnvelope, SuccessEnvelope } from '../types/api';

export function ok<T>(c: Context, data: T, status = 200): Response {
  const body: SuccessEnvelope<T> = { data };
  return c.json(body, status as 200);
}

export function err(c: Context, code: AppErrorCode, message: string): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  return c.json(body, HTTP_STATUS[code] as 400);
}
