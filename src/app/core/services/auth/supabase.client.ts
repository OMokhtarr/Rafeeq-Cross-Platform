import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * The shared Supabase client, created once on first use. Null while the
 * URL / publishable key are unset, so builds without accounts configured
 * never touch Supabase. Env is read at call time so tests can set it.
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return client;
}

export function isAuthConfigured(): boolean {
  return getSupabase() !== null;
}
