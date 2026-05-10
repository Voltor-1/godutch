import type { SupabaseClient } from '@supabase/supabase-js';

import type { BillItemDTO, BillDTO, ParticipantDTO } from '../types/api';

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
