import type { SupabaseClient } from '@supabase/supabase-js';

import type { BillItemDTO, BillDTO, ItemAllocationDTO, ParticipantDTO } from '../types/api';

export interface GuestSessionFullResult {
  bill: BillDTO;
  participants: ParticipantDTO[];
  items: BillItemDTO[];
  splitRules: unknown[];
}

/**
 * Fetch a single session row via a purpose-built RPC that sets app.share_token
 * internally and enforces token validity/expiry in-database.
 */
export async function getGuestSession(
  client: SupabaseClient,
  shareToken: string,
): Promise<BillDTO> {
  const { data, error } = await client.rpc('get_session', {
    p_share_token: shareToken,
  });

  if (error) {
    throw new Error(`get_session failed: ${error.message}`);
  }

  return data as BillDTO;
}

/**
 * Fetch full session snapshot (bill + participants + items + split rules)
 * through one RPC call.
 */
export async function getGuestSessionFull(
  client: SupabaseClient,
  shareToken: string,
): Promise<GuestSessionFullResult> {
  const { data, error } = await client.rpc('get_session_full', {
    p_share_token: shareToken,
  });

  if (error) {
    throw new Error(`get_session_full failed: ${error.message}`);
  }

  return data as GuestSessionFullResult;
}

/**
 * Add a participant to a token-authorized session using server-side token context.
 */
export async function addGuestParticipant(
  client: SupabaseClient,
  shareToken: string,
  displayName: string,
): Promise<ParticipantDTO> {
  const { data, error } = await client.rpc('add_participant', {
    p_share_token: shareToken,
    p_display_name: displayName,
  });

  if (error) {
    throw new Error(`add_participant failed: ${error.message}`);
  }

  return {
    id: data.id,
    billId: data.bill_id,
    displayName: data.display_name,
    participantOrder: data.participant_order,
    participantToken: data.participant_token,
    createdAt: data.created_at,
  } as ParticipantDTO;
}

export async function upsertItemAllocation(
  client: SupabaseClient,
  shareToken: string,
  participantToken: string,
  itemId: string,
  allocatedCents: number,
): Promise<ItemAllocationDTO> {
  const { data, error } = await client.rpc('upsert_item_allocation', {
    p_share_token: shareToken,
    p_participant_token: participantToken,
    p_item_id: itemId,
    p_allocated_cents: allocatedCents,
  });

  if (error) {
    if (error.message.includes('SESSION_NOT_FOUND_OR_EXPIRED')) {
      throw new Error('SESSION_NOT_FOUND_OR_EXPIRED');
    }
    if (error.message.includes('PARTICIPANT_NOT_FOUND_FOR_TOKEN')) {
      throw new Error('PARTICIPANT_NOT_FOUND_FOR_TOKEN');
    }
    throw new Error(`upsert_item_allocation failed: ${error.message}`);
  }

  return {
    id: data.id,
    billId: data.bill_id,
    itemId: data.item_id,
    participantId: data.participant_id,
    allocatedCents: data.allocated_cents,
    createdAt: data.created_at,
  } as ItemAllocationDTO;
}
