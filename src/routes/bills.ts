import { Hono } from 'hono';
import { z } from 'zod';

import { err, ok } from '../lib/response';
import { parseBody, centsSchema, tokenSchema } from '../lib/validation';
import { getAnonClient, type Env } from '../lib/supabase';
import { getGuestSessionFull } from '../lib/guest-session';
import type { BillDTO } from '../types/api';

const bills = new Hono<{ Bindings: Env }>();

const createSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  currencyCode: z.string().length(3).default('USD'),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  serviceChargeCents: centsSchema,
});

function generateTokenHex(bytes = 32): string {
  const random = new Uint8Array(bytes);
  crypto.getRandomValues(random);
  return Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isConflictError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('duplicate') || m.includes('unique') || m.includes('conflict');
}

// POST /sessions — create a new bill session
bills.post('/', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(createSessionSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);
  const body = parsed.data;
  const totalCents =
    body.subtotalCents + body.taxCents + body.tipCents + body.serviceChargeCents;

  try {
    const shareToken = generateTokenHex(32);
    const { data, error } = await client
      .from('bills')
      .insert({
        title: body.title ?? null,
        currency_code: body.currencyCode.toUpperCase(),
        subtotal_cents: body.subtotalCents,
        tax_cents: body.taxCents,
        tip_cents: body.tipCents,
        service_charge_cents: body.serviceChargeCents,
        total_cents: totalCents,
        share_token: shareToken,
        status: 'draft',
        owner_user_id: null,
      })
      .select('*')
      .single();

    if (error) {
      if (isConflictError(error.message)) {
        return err(c, 'CONFLICT', 'Session creation conflict');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to create session');
    }

    const dto: BillDTO = {
      id: data.id,
      shareToken: data.share_token,
      title: data.title,
      currencyCode: data.currency_code,
      subtotalCents: data.subtotal_cents,
      taxCents: data.tax_cents,
      tipCents: data.tip_cents,
      serviceChargeCents: data.service_charge_cents,
      totalCents: data.total_cents,
      status: data.status,
      revision: data.revision,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return ok(c, dto, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Session creation conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to create session');
  }
});

// GET /sessions/:token — fetch session snapshot
bills.get('/:token', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const client = getAnonClient(c.env);

  try {
    const snapshot = await getGuestSessionFull(client, tokenParsed.data);
    return ok(c, snapshot);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Session conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to fetch session');
  }
});

// POST /sessions/:token/participants
bills.post('/:token/participants', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// PATCH /sessions/:token/participants/:id
bills.patch('/:token/participants/:id', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #5' } }, 501);
});

// POST /sessions/:token/items
bills.post('/:token/items', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/allocations
bills.post('/:token/allocations', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/split-mode
bills.post('/:token/split-mode', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #6' } }, 501);
});

// POST /sessions/:token/compute
bills.post('/:token/compute', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #7' } }, 501);
});

// POST /sessions/:token/finalize
bills.post('/:token/finalize', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #8' } }, 501);
});

// GET /sessions/:token/audit
bills.get('/:token/audit', async (c) => {
  return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in issue #8' } }, 501);
});

export default bills;
