import type { SupabaseClient } from '@supabase/supabase-js';

export interface GuestSessionContext {
  shareToken: string;
  participantToken?: string;
}

/**
 * Wraps a Supabase query in a transaction that sets RLS session variables
 * for guest access. The SET LOCAL calls are scoped to the transaction —
 * they have no effect outside it.
 *
 * Usage:
 *   const result = await withGuestRlsTransaction(client, { shareToken }, async (sql) => {
 *     return client.from('bills').select('*');
 *   });
 *
 * The anon client must be used — never a service role client.
 */
export async function withGuestRlsTransaction<T>(
  client: SupabaseClient,
  ctx: GuestSessionContext,
  run: (client: SupabaseClient) => Promise<T>,
): Promise<T> {
  // Build the SET LOCAL statements for this guest context
  const sets = [
    `SET LOCAL app.share_token = '${escapeSingleQuotes(ctx.shareToken)}'`,
  ];
  if (ctx.participantToken) {
    sets.push(
      `SET LOCAL app.participant_token = '${escapeSingleQuotes(ctx.participantToken)}'`,
    );
  }

  // Open a transaction, set session variables, run the query, commit
  const { error: beginError } = await client.rpc('begin_transaction');
  if (beginError) throw new Error(`Transaction begin failed: ${beginError.message}`);

  try {
    for (const stmt of sets) {
      const { error } = await client.rpc('exec_sql', { sql: stmt });
      if (error) throw new Error(`Session variable set failed: ${error.message}`);
    }

    const result = await run(client);

    await client.rpc('commit_transaction');
    return result;
  } catch (e) {
    await client.rpc('rollback_transaction');
    throw e;
  }
}

/**
 * Escapes single quotes in token strings to prevent SQL injection
 * in SET LOCAL statements. Tokens should be high-entropy alphanumeric
 * values — this is a defence-in-depth measure.
 */
function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}
