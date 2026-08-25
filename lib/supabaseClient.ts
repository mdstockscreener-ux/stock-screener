import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the env vars are missing — pages render a setup hint instead of crashing. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client for the market-data tables.
 * Reads are anonymous; RLS policies live in sql/bottom_out_scanner.sql.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}
