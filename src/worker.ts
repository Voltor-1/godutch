import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from './lib/errors';
import { err } from './lib/response';
import type { Env } from './lib/supabase';
import health from './routes/health';
import bills from './routes/bills';
import { pingHandler } from './routes/ping';

const app = new Hono<{ Bindings: Env }>();

// ── CORS ─────────────────────────────────────────────────────────
app.use('*', cors({
  origin: ['https://godutch.pages.dev', 'https://a4cda904.godutch.pages.dev', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ── Routes ──────────────────────────────────────────────────────
app.route('/health', health);
app.get('/ping', pingHandler);
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
