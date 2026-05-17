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
import {
  computeItemsSplit,
  computePercentageSplit,
  computeFixedSplit,
  type ParticipantInput,
  type ItemsAllocation,
} from '../lib/compute';


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
      .rpc('create_session', {
        p_title: body.title ?? null,
        p_currency_code: body.currencyCode.toUpperCase(),
        p_share_token: shareToken,
        p_subtotal_cents: body.subtotalCents,
        p_tax_cents: body.taxCents,
        p_tip_cents: body.tipCents,
        p_service_charge_cents: body.serviceChargeCents,
        p_total_cents: totalCents,
      });

    if (error) {
      if (error.message.includes("SESSION_NOT_FOUND_OR_EXPIRED")) return err(c, "GONE", "Session not found or expired");
      if (error.message.includes("ALREADY_FINALIZED")) return err(c, "CONFLICT", "Cannot delete a finalized session");
      if (error.message.includes("NOT_SESSION_OWNER")) return err(c, "FORBIDDEN", "Only the session creator can delete this session");
      return err(c, "INTERNAL_ERROR", "Failed to expire session");
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

bills.delete('/:token', async (c) => {
  const token = c.req.param("token");
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, "VALIDATION_ERROR", "Invalid session token");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = parseBody(deleteSessionSchema, raw);
  if ('error' in parsed) {
    return err(c, 'VALIDATION_ERROR', parsed.error);
  }

  const client = getAnonClient(c.env);
  try {
    const { error } = await client.rpc("expire_session_as_owner", { p_share_token: tokenParsed.data, p_participant_token: parsed.data.participantToken });
    if (error) {
      if (error.message.includes("SESSION_NOT_FOUND_OR_EXPIRED")) return err(c, "GONE", "Session not found or expired");
      if (error.message.includes("ALREADY_FINALIZED")) return err(c, "CONFLICT", "Cannot delete a finalized session");
      return err(c, "INTERNAL_ERROR", "Failed to expire session");
    }
    return ok(c, { deleted: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("SESSION_NOT_FOUND_OR_EXPIRED")) return err(c, "GONE", "Session not found or expired");
    if (message.includes("ALREADY_FINALIZED")) return err(c, "CONFLICT", "Cannot delete a finalized session");
    return err(c, "INTERNAL_ERROR", "Failed to expire session");
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
    const { data: item, error } = await client.rpc('add_bill_item', {
      p_share_token: tokenParsed.data,
      p_name: parsed.data.name,
      p_quantity: parsed.data.quantity,
      p_unit_price_cents: parsed.data.unitPriceCents,
    });

    if (error) {
      if (error.message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
        return err(c, 'GONE', 'Session not found or expired');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to create item');
    }

    return ok(c, {
      id: item.id,
      billId: item.bill_id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
      createdAt: item.created_at,
    }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
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
    const { data: rule, error } = await client.rpc('set_split_mode', {
      p_share_token: tokenParsed.data,
      p_mode: parsed.data.mode,
      p_config_json: parsed.data.configJson ?? null,
    });

    if (error) {
      if (error.message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
        return err(c, 'GONE', 'Session not found or expired');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to update split mode');
    }

    const response = {
      id: rule.id,
      billId: rule.bill_id,
      splitMode: rule.split_mode,
      isActive: rule.is_active,
      configJson: rule.config_json,
      createdAt: rule.created_at,
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
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const client = getAnonClient(c.env);

  try {
    // Fetch full session data via SECURITY DEFINER function
    const { data: sessionData, error: sessionError } = await client
      .rpc('get_session_for_compute', { p_share_token: tokenParsed.data });

    if (sessionError) {
      if (sessionError.message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
        return err(c, 'GONE', 'Session not found or expired');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to fetch session');
    }

    const { bill, participants, items, allocations, split_rule: splitRule } = sessionData as any;

    if (!bill || bill.status === 'expired') {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (!participants || participants.length === 0) {
      return err(c, 'VALIDATION_ERROR', 'Session has no participants');
    }
    if (!splitRule) {
      return err(c, 'VALIDATION_ERROR', 'No split mode set');
    }

    const participantInputs: ParticipantInput[] = participants.map((p: any) => ({
      id: p.id,
      participantOrder: p.participant_order,
    }));

    const billTotals = {
      totalCents: bill.total_cents,
      subtotalCents: bill.subtotal_cents,
      taxCents: bill.tax_cents,
      tipCents: bill.tip_cents,
      serviceChargeCents: bill.service_charge_cents,
    };

    let computeResult;

    if (splitRule.split_mode === 'items') {
      // Validate all items are fully allocated using data from get_session_for_compute
      for (const item of items as any[]) {
        const itemAllocs = (allocations ?? []).filter((a: any) => a.item_id === item.id);
        const allocSum = itemAllocs.reduce((acc: number, a: any) => acc + Math.trunc(a.allocated_cents), 0);
        if (allocSum !== Math.trunc(item.line_total_cents)) {
          return err(c, 'VALIDATION_ERROR', `Item "${item.name}" is not fully allocated`);
        }
      }

      const allocationInputs: ItemsAllocation[] = (allocations ?? []).map((a: any) => ({
        participantId: a.participant_id,
        allocatedCents: Math.trunc(a.allocated_cents),
      }));

      computeResult = computeItemsSplit(billTotals, participantInputs, allocationInputs);

    } else if (splitRule.split_mode === 'percentage') {
      const config = splitRule.config_json as any;
      if (!config?.percentages) {
        return err(c, 'VALIDATION_ERROR', 'Percentage split config is missing');
      }
      const percentages: Record<string, number> = config.percentages;
      const basisSum = Object.values(percentages).reduce((acc: number, v: any) => acc + Math.trunc(v), 0);
      if (basisSum !== 10000) {
        return err(c, 'VALIDATION_ERROR', 'Percentages do not sum to 100%');
      }
      computeResult = computePercentageSplit(billTotals, participantInputs, percentages);

    } else if (splitRule.split_mode === 'fixed') {
      const config = splitRule.config_json as any;
      if (!config?.fixedAmounts) {
        return err(c, 'VALIDATION_ERROR', 'Fixed split config is missing');
      }
      const fixedAmounts: Record<string, number> = config.fixedAmounts;
      const fixedSum = Object.values(fixedAmounts).reduce((acc: number, v: any) => acc + Math.trunc(v), 0);
      if (fixedSum > Math.trunc(bill.total_cents)) {
        return err(c, 'VALIDATION_ERROR', 'Fixed amounts exceed total');
      }
      computeResult = computeFixedSplit(billTotals, participantInputs, fixedAmounts);

    } else {
      return err(c, 'VALIDATION_ERROR', 'Unknown split mode');
    }

    // Save compute results via SECURITY DEFINER function
    const { error: saveError } = await client.rpc('save_compute_results', {
      p_share_token: tokenParsed.data,
      p_results: computeResult,
    });

    if (saveError) {
      return err(c, 'INTERNAL_ERROR', 'Failed to save compute results');
    }

    return ok(c, computeResult);

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    if (message.includes('COMPUTE_INVARIANT_VIOLATED')) {
      return err(c, 'INTERNAL_ERROR', 'Compute invariant violation: ' + message);
    }
    return err(c, 'INTERNAL_ERROR', 'Compute failed');
  }
});

// POST /sessions/:token/finalize
bills.post('/:token/finalize', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const client = getAnonClient(c.env);

  try {
    const { data: bill, error } = await client.rpc('finalize_session', {
      p_share_token: tokenParsed.data,
    });

    if (error) {
      if (error.message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
        return err(c, 'GONE', 'Session not found or expired');
      }
      if (error.message.includes('ALREADY_FINALIZED')) {
        return err(c, 'CONFLICT', 'Session is already finalized');
      }
      if (error.message.includes('COMPUTE_NOT_RUN')) {
        return err(c, 'VALIDATION_ERROR', 'Run compute before finalizing');
      }
      if (error.message.includes('TOTALS_MISMATCH')) {
        return err(c, 'VALIDATION_ERROR', 'Participant totals do not match bill total — re-run compute');
      }
      return err(c, 'INTERNAL_ERROR', 'Failed to finalize session');
    }

    return ok(c, {
      billId: bill.id,
      status: 'finalized',
      readUntil: bill.read_until,
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      return err(c, 'GONE', 'Session not found or expired');
    }
    return err(c, 'INTERNAL_ERROR', 'Finalization failed');
  }
});

// GET /sessions/:token/audit
bills.get('/:token/audit', async (c) => {
  const token = c.req.param('token');
  const tokenParsed = tokenSchema.safeParse(token);
  if (!tokenParsed.success) {
    return err(c, 'VALIDATION_ERROR', 'Invalid session token');
  }

  const client = getAnonClient(c.env);

  try {
    // Verify session exists and is accessible
    const { data: bill, error: billError } = await client
      .from('bills')
      .select('id, status')
      .eq('share_token', tokenParsed.data)
      .single();

    if (billError || !bill) {
      return err(c, 'GONE', 'Session not found or expired');
    }

    // Fetch audit events ordered by creation time
    const { data: events, error: eventsError } = await client
      .from('audit_events')
      .select('id, event_type, event_payload, created_at, actor_participant_id')
      .eq('bill_id', bill.id)
      .order('created_at', { ascending: true });

    if (eventsError) {
      return err(c, 'INTERNAL_ERROR', 'Failed to fetch audit log');
    }

    return ok(c, {
      billId: bill.id,
      events: (events ?? []).map((e) => ({
        id: e.id,
        eventType: e.event_type,
        payload: e.event_payload,
        actorParticipantId: e.actor_participant_id,
        createdAt: e.created_at,
      })),
    });

  } catch (e) {
    return err(c, 'INTERNAL_ERROR', 'Failed to fetch audit log');
  }
});

export default bills;
