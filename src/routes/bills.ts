import { Hono } from 'hono';
import type { Env } from '../lib/supabase';

/**
 * Bills router — skeleton only.
 * Handler logic is implemented in issue #5.
 */
const bills = new Hono<{ Bindings: Env }>();

// POST /sessions — create a new bill session
<http://bills.post|bills.post>('/', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// GET /sessions/:token — fetch session snapshot
bills.get('/:token', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// POST /sessions/:token/participants
<http://bills.post|bills.post>('/:token/participants', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// PATCH /sessions/:token/participants/:id
bills.patch('/:token/participants/:id', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// POST /sessions/:token/items
<http://bills.post|bills.post>('/:token/items', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/allocations
<http://bills.post|bills.post>('/:token/allocations', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/split-mode
<http://bills.post|bills.post>('/:token/split-mode', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/compute
<http://bills.post|bills.post>('/:token/compute', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #7' } }, 501);
});

// POST /sessions/:token/finalize
<http://bills.post|bills.post>('/:token/finalize', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #8' } }, 501);
});

// GET /sessions/:token/audit
bills.get('/:token/audit', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #8' } }, 501);
});

export default bills;
