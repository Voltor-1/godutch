import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/**
 * Returns a Supabase client using the anon key only.
 * The anon key respects RLS — all access is policy-gated.
 * Never use a service role key in this codebase.
 */
export function getAnonClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
