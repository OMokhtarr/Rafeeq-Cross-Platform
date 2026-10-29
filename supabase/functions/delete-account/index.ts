/**
 * DELETE ACCOUNT — edge function entry
 *
 * Wires handler.ts to the service-role Supabase client, RevenueCat and
 * Apple. Secrets (set with `supabase secrets set`):
 *   REVENUECAT_SECRET_KEY, ADMIN_DELETE_SECRET,
 *   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 * The revoke's client id is not a secret: apple-token stores it with each
 * token, since Apple only accepts a revoke from the client that issued it.
 *
 * The Apple secrets may be absent until iOS ships. Then revoking a stored
 * Apple token throws, so that account gets a 502 rather than being deleted
 * with its Apple grant left live.
 */

import { createClient, type User } from "npm:@supabase/supabase-js@2";
import { revokeAppleToken, type AppleKey } from "../_shared/apple.ts";
import { handleDeleteAccount, type AccountRef } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) || null;

const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const toRef = (user: User): AccountRef => ({ id: user.id, provider: user.app_metadata?.provider ?? "" });

/** A 4xx from Auth means "no such user / bad token"; anything else is an outage. */
const isNotFound = (error: { status?: number }) => !!error.status && error.status < 500;

function appleKey(): AppleKey | null {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  const privateKeyPem = env("APPLE_PRIVATE_KEY");
  return teamId && keyId && privateKeyPem ? { teamId, keyId, privateKeyPem } : null;
}

async function findUserByEmail(email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
}

Deno.serve((req) =>
  handleDeleteAccount(req, {
    async userFromToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      return data.user ? toRef(data.user) : null;
    },

    async findUser({ id, email }) {
      if (id) {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error) {
          if (isNotFound(error)) return null;
          throw error;
        }
        return data.user ? toRef(data.user) : null;
      }
      const user = email ? await findUserByEmail(email) : null;
      return user ? toRef(user) : null;
    },

    async appleRefreshToken(userId) {
      const { data, error } = await admin
        .from("apple_tokens")
        .select("refresh_token, client_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? { refreshToken: data.refresh_token, clientId: data.client_id } : null;
    },

    async revokeApple(grant) {
      const key = appleKey();
      if (!key) throw new Error("apple credentials not configured");
      await revokeAppleToken(grant, key);
    },

    async deleteRevenueCatCustomer(userId) {
      const key = env("REVENUECAT_SECRET_KEY");
      if (!key) throw new Error("REVENUECAT_SECRET_KEY not configured");
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.ok || res.status === 404) return;
      throw new Error(`revenuecat delete failed: ${res.status} ${await res.text()}`);
    },

    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },

    adminSecret: env("ADMIN_DELETE_SECRET"),
  }),
);
