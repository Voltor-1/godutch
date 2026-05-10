import { Hono } from 'hono';
import { z } from 'zod';

import { err, ok } from '../lib/response';
import { parseBody, centsSchema, tokenSchema } from '../lib/validation';
import { getAnonClient, type Env } from '../lib/supabase';
import {
  addGuestParticipant,
  getGuestSessionFull,
  upsertItemAllocation,
} from '../lib/guest-session';
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

const addParticipantSchema = z.object({
  displayName: z.string().min(1).max(100),
});

const updateParticipantSchema = z.object({
  displayName: z.string().min(1).max(100),
  expectedRevision: z.number().int().nonnegative(),
});

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  unitPriceCents: centsSchema,
});

const upsertAllocationSchema = z.object({
  participantToken: z.string().min(16).max(128),
  itemId: z.string().uuid(),
  allocatedCents: centsSchema,
});

const splitModeSchema = z.object({
  mode: z.enum(['items', 'percentage', 'fixed']),
  configJson: z.record(z.unknown()).optional(),
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
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(addParticipantSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);

  try {
    const participant = await addGuestParticipant(
      client,
      tokenParsed.data,
      parsed.data.displayName,
    );

    const response = {
      id: participant.id,
      billId: participant.billId,
      displayName: participant.displayName,
      participantOrder: participant.participantOrder,
      participantToken: participant.participantToken,
      createdAt: participant.createdAt,
    };

    return ok(c, response, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Participant creation conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to add participant');
  }
});

// PATCH /sessions/:token/participants/:id
bills.patch('/:token/participants/:id', async (c) => {
  const token = c.req.param('token');
  const participantId = c.req.param('id');

  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(updateParticipantSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);

  try {
    const { data: bill, error: billError } = await client
      .from('bills')
      .select('id, revision, status')
      .eq('share_token', tokenParsed.data)
      .single();

    if (billError || !bill) {
      return err(c, 'GONE', 'Session not found or expired');
    }

    if (bill.status === 'expired') {
      return err(c, 'GONE', 'Session not found or expired');
    }

    if (bill.revision !== parsed.data.expectedRevision) {
      return err(c, 'CONFLICT', 'Revision conflict');
    }

    const { data: updated, error: updateError } = await client
      .from('bill_participants')
      .update({ display_name: parsed.data.displayName })
      .eq('id', participantId)
      .eq('bill_id', bill.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return err(c, 'NOT_FOUND', 'Participant not found');
    }

    const { data: revisionUpdated, error: revisionError } = await client
      .from('bills')
      .update({ revision: parsed.data.expectedRevision + 1 })
      .eq('id', bill.id)
      .eq('revision', parsed.data.expectedRevision)
      .select('id')
      .single();

    if (revisionError || !revisionUpdated) {
      return err(c, 'CONFLICT', 'Revision conflict');
    }

    const response = {
      id: updated.id,
      billId: updated.bill_id,
      displayName: updated.display_name,
      participantOrder: updated.participant_order,
      createdAt: updated.created_at,
    };

    return ok(c, response);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Revision conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to update participant');
  }
});

// POST /sessions/:token/items
bills.post('/:token/items', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(createItemSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);

  try {
    const { data: bill, error: billError } = await client
      .from('bills')
      .select('id, status')
      .eq('share_token', tokenParsed.data)
      .single();

    if (billError || !bill || bill.status === 'expired') {
      return err(c, 'GONE', 'Session not found or expired');
    }

    const lineTotalCents = parsed.data.quantity * parsed.data.unitPriceCents;

    const { data: item, error: itemError } = await client
      .from('bill_items')
      .insert({
        bill_id: bill.id,
        name: parsed.data.name,
        quantity: parsed.data.quantity,
        unit_price_cents: parsed.data.unitPriceCents,
        line_total_cents: lineTotalCents,
      })
      .select('*')
      .single();

    if (itemError || !item) {
      if (itemError && isConflictError(itemError.message)) {
        return err(c, 'CONFLICT', 'Item creation conflict');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to create item');
    }

    await client.from('audit_events').insert({
      bill_id: bill.id,
      event_type: 'item_added',
      event_payload: {
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
      },
    });

    const response = {
      id: item.id,
      billId: item.bill_id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
      createdAt: item.created_at,
    };

    return ok(c, response, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Item creation conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to create item');
  }
});

// POST /sessions/:token/allocations
bills.post('/:token/allocations', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(upsertAllocationSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);

  try {
    const allocation = await upsertItemAllocation(
      client,
      tokenParsed.data,
      parsed.data.participantToken,
      parsed.data.itemId,
      parsed.data.allocatedCents,
    );

    const [{ data: sumData, error: sumError }, { data: itemData, error: itemError }] =
      await Promise.all([
        client
          .from('item_allocations')
          .select('allocated_cents')
          .eq('item_id', parsed.data.itemId),
        client
          .from('bill_items')
          .select('line_total_cents')
          .eq('id', parsed.data.itemId)
          .single(),
      ]);

    if (sumError || itemError || !itemData) {
      return err(c, 'INTERNAL_ERROR', 'Failed to validate allocation totals');
    }

    const allocatedTotal = (sumData ?? []).reduce(
      (acc, row) => acc + Math.trunc(row.allocated_cents ?? 0),
      0,
    );

    if (allocatedTotal > Math.trunc(itemData.line_total_cents)) {
      return err(c, 'VALIDATION_ERROR', 'Allocation exceeds item total');
    }

    return ok(c, allocation, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (message.includes('PARTICIPANT_NOT_FOUND_FOR_TOKEN')) {
      return err(c, 'FORBIDDEN', 'Participant token is not authorized for this session');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to upsert allocation');
  }
});

// POST /sessions/:token/split-mode
bills.post('/:token/split-mode', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(splitModeSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);

  try {
    const { data: bill, error: billError } = await client
      .from('bills')
      .select('id, status')
      .eq('share_token', tokenParsed.data)
      .single();

    if (billError || !bill || bill.status === 'expired') {
      return err(c, 'GONE', 'Session not found or expired');
    }

    const { data: previousActive } = await client
      .from('split_rules')
      .select('split_mode')
      .eq('bill_id', bill.id)
      .eq('is_active', true)
      .maybeSingle();

    const { error: deactivateError } = await client
      .from('split_rules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('bill_id', bill.id)
      .eq('is_active', true);

    if (deactivateError) {
      if (isConflictError(deactivateError.message)) {
        return err(c, 'CONFLICT', 'Split mode update conflict');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to update split mode');
    }

    const { data: inserted, error: insertError } = await client
      .from('split_rules')
      .insert({
        bill_id: bill.id,
        split_mode: parsed.data.mode,
        is_active: true,
        config_json: parsed.data.configJson ?? null,
      })
      .select('*')
      .single();

    if (insertError || !inserted) {
      if (insertError && isConflictError(insertError.message)) {
        return err(c, 'CONFLICT', 'Split mode update conflict');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to update split mode');
    }

    await client.from('audit_events').insert({
      bill_id: bill.id,
      event_type: 'split_mode_changed',
      event_payload: {
        mode: parsed.data.mode,
        previous_mode: previousActive?.split_mode ?? null,
      },
    });

    const response = {
      id: inserted.id,
      billId: inserted.bill_id,
      splitMode: inserted.split_mode,
      isActive: inserted.is_active,
      configJson: inserted.config_json,
      createdAt: inserted.created_at,
    };

    return ok(c, response);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (isConflictError(message)) {
      return err(c, 'CONFLICT', 'Split mode update conflict');
    }
    return err(c, 'INTERNAL_ERROR', 'Failed to update split mode');
  }
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
