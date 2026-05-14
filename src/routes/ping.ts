import { Context } from 'hono';
import { ok } from '../lib/response';

export async function pingHandler(c: Context) {
  return ok(c, {
    timestamp: new Date().toISOString(),
    env: 'production',
  });
}
