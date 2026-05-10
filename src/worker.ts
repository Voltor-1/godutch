import { Hono } from 'hono';
import { AppError } from './lib/errors';
import { err } from './lib/response';
import type { Env } from './lib/supabase';
import health from './routes/health';
import bills from './routes/bills';

const app = new Hono<{ Bindings: Env }>();

// ── Routes ──────────────────────────────────────────────────────
app.route('/health', health);
app.route('/sessions', bills);

// ── Global error handler ─────────────────────────────────────────
app.onError((error, c) => {
  if (error instanceof AppError) {
    return err(c, error.code, error.message);
  }
  console.error('Unhandled error:', error);
  return err(c, 'INTERNAL_ERROR', 'An unexpected error occurred');
});

// ── 404 handler ──────────────────────────────────────────────────
app.notFound((c) => {
  return err(c, 'NOT_FOUND', `No route found for ${c.req.method} ${c.req.path}`);
});

export default app;
