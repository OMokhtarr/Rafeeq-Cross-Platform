/**
 * APPLE TOKEN — edge function entry
 *
 * Wires handler.ts to the service-role Supabase client and Apple. Secrets
 * (set with `supabase secrets set`):
 *   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_BUNDLE_ID.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * Only the native iOS sign-in posts a code, and Apple issues those to the
 * app's bundle id, so the exchange (and the stored client id) uses
 * APPLE_BUNDLE_ID. The Services ID (APPLE_CLIENT_ID) belongs to the web
 * flow, which runs inside Supabase Auth and stores nothing here.
 *
 * Until the Apple secrets are set every exchange throws, so the app gets a
 * 502; it logs that and the sign-in itself still succeeds.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { exchangeAppleCode, type AppleKey } from "../_shared/apple.ts";
import { handleAppleToken } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) || null;

const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A 4xx from Auth means "bad token"; anything else is an outage. */
const isNotFound = (error: { status?: number }) => !!error.status && error.status < 500;

function appleKey(): AppleKey | null {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  const privateKeyPem = env("APPLE_PRIVATE_KEY");
  return teamId && keyId && privateKeyPem ? { teamId, keyId, privateKeyPem } : null;
}

Deno.serve((req) =>
  handleAppleToken(req, {
    async userFromToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      return data.user ? { id: data.user.id } : null;
    },

    async exchangeAppleCode(code) {
      const key = appleKey();
      const bundleId = env("APPLE_BUNDLE_ID");
      if (!key || !bundleId) throw new Error("apple credentials not configured");
      return exchangeAppleCode(code, bundleId, key);
    },

    async saveRefreshToken(userId, grant) {
      const { error } = await admin.from("apple_tokens").upsert(
        {
          user_id: userId,
          refresh_token: grant.refreshToken,
          client_id: grant.clientId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
  }),
);
