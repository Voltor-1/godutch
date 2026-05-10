import { Hono } from 'hono';
import type { Env } from '../lib/supabase';

const health = new Hono<{ Bindings: Env }>();

health.get('/', (c) => {
  return c.json({ status: 'ok' });
});

health.get('/debug', (c) => {
  const url = c.env.SUPABASE_URL ?? 'NOT_SET';
  const key = c.env.SUPABASE_ANON_KEY ?? 'NOT_SET';
  return c.json({
    urlSet: url !== 'NOT_SET',
    urlFirst30: url.slice(0, 30),
    keySet: key !== 'NOT_SET',
    keyFirst20: key.slice(0, 20),
  });
});

export default health;
