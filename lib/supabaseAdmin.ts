import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service-role key, which bypasses
 * RLS. Used exclusively inside route handlers that write market-data
 * tables (app/api/admin/**, and the public read routes' NSE-fallback path
 * in lib/marketDataSync.ts) — never imported by a client component, and
 * SUPABASE_SERVICE_ROLE_KEY is never prefixed with NEXT_PUBLIC_ so it's
 * never bundled to the browser.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured: boolean = Boolean(url && serviceRoleKey);

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseAdminConfigured) {
    throw new Error(
      'Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!client) {
    client = createClient(url as string, serviceRoleKey as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}
