# Accounts Part 1 — Sign-in, Pro on the Account, Store Compliance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people sign in with Google (and Apple), require an account for Rafeeq Pro, tie RevenueCat and the token broker's Pro check to that account, and add full account deletion plus the store paperwork, all behind a default-off `REACT_APP_ACCOUNTS` switch.

**Architecture:** Supabase Auth issues the account. A native sign-in plugin gets a Google/Apple ID token, and `supabase.auth.signInWithIdToken` turns it into a session. Apple on Android uses Supabase's OAuth redirect in a browser tab. A new `AuthProvider` sits above `SubscriptionProvider`: RevenueCat is configured with the account id and follows sign-in/out through `logIn`/`logOut`. The broker client sends the Supabase access token, and the Worker verifies it against Supabase's JWKS (WebCrypto, no deps) and uses its `sub` for the RevenueCat check. Deletion runs in a Supabase Edge Function, with its logic in a dependency-injected handler that Node tests exercise.

**Tech Stack:** React + Ionic + Capacitor 8 (CRA / Jest 27), `@supabase/supabase-js` v2, `@capgo/capacitor-social-login`, `@capacitor/browser`, RevenueCat Capacitor 13.7.x, Cloudflare Worker (`token-broker/`), Supabase Edge Functions (Deno) + Postgres.

**Spec:** `docs/superpowers/specs/2026-10-29-accounts-and-pro-sync-design.md` (Part 1 = Goals 1–8 + "Store compliance checklist"; Part 2 Pro Sync gets its own plan).

## Global Constraints

- Every sign-in surface is hidden unless `REACT_APP_ACCOUNTS === "on"` (default off). The Pro gate (`isProGateOn()`) is true only when **both** `REACT_APP_PRO_GATE === "on"` and accounts are on.
- Providers: Google (both platforms) and Apple. Apple shows on iOS, and on Android only when `REACT_APP_APPLE_SIGNIN === "on"`. No email/password.
- The free app never requires sign-in. Only subscribing and restoring ask for it.
- RevenueCat entitlement stays `com_rafeeq_quranquiz_pro`. SDK + UI stay pinned together at 13.7.x.
- `x-rafeeq-user` is removed from app and Worker. The broker reads `Authorization: Bearer <supabase access token>` only.
- Delete account deletes server-side everything (Apple token revoke → RevenueCat customer → auth user, which cascades). The auth user goes **last**. Local phone data is **kept**, and the phone signs out.
- New dependencies need the owner's OK before `npm install`. Set `$env:ComSpec = "C:\Windows\System32\cmd.exe"` before `npm install` on this machine.
- Every new string needs Arabic + English in `src/app/core/i18n/strings.ts` (type block, `ar`, `en`). Use the app's own terms.
- CSS rules (CLAUDE.md): no visible scrollbars; no `eslint-disable` comments; widths via `var(--max-width-mobile, 600px)`; bottom padding for the fixed BottomNavBar. Green only as fills, gold for text/borders. Invoke `frontend-design:frontend-design` before UI tasks (7, 8, 9).
- Owner builds the app: no `npm run build` / `cap sync` / gradle. App tests: `CI=true npx react-scripts test --watchAll=false <pattern>`. Worker tests: `npm test` in `token-broker/`. Edge-function tests: `node --experimental-strip-types --test supabase/test/*.test.ts`.
- Working tree is CRLF. Load `supabase:supabase-postgres-best-practices` before writing the migration (Task 9).

## Review Focus

1. **Signed in, offline at launch:** the app opens normally, the person stays signed in (no sign-out because a token refresh failed), and Pro comes from the cache. Test in Task 3.
2. **Person closes the Google/Apple sheet:** nothing happens. There's no error toast, the paywall does not open, and they stay where they were. Test in Task 7.
3. **Two accounts on one phone** (sign out A, sign in B): B never sees A's cached Pro, and RevenueCat is logged in as B. Test in Task 6.
4. **Deletion fails partway** (network/RevenueCat error): the person stays signed in, sees an error, and can retry. The server never deletes the auth user before the other steps succeed. Tests in Task 9.
5. **Accounts switch off:** no sign-in UI anywhere, the Pro gate is off even with `REACT_APP_PRO_GATE=on`, and RevenueCat stays anonymous exactly as today. Tests in Tasks 1 and 8.

---

### Task 1: Switches and environment

**Files:**
- Create: `src/app/core/services/auth/accounts-switch.ts`
- Modify: `src/app/core/services/subscription/pro-gate.ts`, `.env.example`
- Test: `src/app/core/services/auth/__tests__/accounts-switch.test.ts`

**Interfaces:**
- Produces:
  - `isAccountsOn(): boolean`
  - `isAppleSignInOn(): boolean`: true on iOS when accounts are on; on Android only when `REACT_APP_APPLE_SIGNIN === "on"` as well.
  - `isProGateOn()` now also requires `isAccountsOn()`.

- [ ] **Step 1: Write the failing tests**
  - `isAccountsOn` is false when the var is unset/`"off"`, true for `"on"`.
  - `isProGateOn()` is false when `REACT_APP_PRO_GATE=on` but `REACT_APP_ACCOUNTS` is unset (Review Focus 5); true when both are `"on"`.
  - `isAppleSignInOn()` truth table: platform `ios` → true (accounts on); `android` + `REACT_APP_APPLE_SIGNIN` unset → false; `android` + `"on"` → true; accounts off → always false.
  - Mock `Capacitor.getPlatform` as `SubscriptionContext.test.tsx` does.
- [ ] **Step 2: Run them, expect FAIL** (module not found)
  - `CI=true npx react-scripts test --watchAll=false accounts-switch`
- [ ] **Step 3: Implement both modules**
  - In `pro-gate.ts`, update the doc comment: the gate needs accounts because Pro is always on an account.
- [ ] **Step 4: Add the new vars to `.env.example`**, each with a one-line comment in the file's existing style:
  - `REACT_APP_ACCOUNTS=off`
  - `REACT_APP_SUPABASE_URL=`
  - `REACT_APP_SUPABASE_PUBLISHABLE_KEY=`
  - `REACT_APP_GOOGLE_WEB_CLIENT_ID=`
  - `REACT_APP_APPLE_SIGNIN=off`
  - Note under the Pro gate comment that `PRO_GATE` has no effect while `ACCOUNTS` is off.
- [ ] **Step 5: Run the tests plus `pro-gate`/`useProGate`, expect PASS. Commit** `feat(accounts): accounts switch; Pro gate requires accounts`

### Task 2: Supabase client and Google sign-in service

**Files:**
- Create:
  - `src/app/core/services/auth/supabase.client.ts`
  - `src/app/core/services/auth/auth.service.ts`
- Modify: `package.json` (deps)
- Test: `src/app/core/services/auth/__tests__/auth.service.test.ts`

**Interfaces:**
- Produces:
  - `type AuthProviderId = "google" | "apple"`
  - `interface AccountUser { id: string; email: string | null; name: string | null; provider: AuthProviderId }`
  - `getSupabase(): SupabaseClient | null`: null when URL/key are unset. Created once with `auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" }`. Default localStorage storage is fine.
  - `isAuthConfigured(): boolean`
  - `signIn(provider: AuthProviderId): Promise<AccountUser | null>`: **null = the person cancelled**; throws on real failure. This task implements `"google"`; `"apple"` throws `new Error("apple sign-in not available")` until Task 10.
  - `signOut(): Promise<void>`: Supabase `signOut({ scope: "local" })` plus `SocialLogin.logout`, errors swallowed and logged.
  - `currentUser(): Promise<AccountUser | null>`
  - `onAccountChange(cb: (user: AccountUser | null) => void): () => void`
  - `accessToken(): Promise<string | null>`: from `getSession()`; Supabase refreshes it when near expiry.

- [ ] **Step 1: Owner approval for dependencies**
  - Ask the owner to approve `@supabase/supabase-js@^2`, `@capgo/capacitor-social-login`, and `@capacitor/browser@^8` (used in Task 10).
  - Before asking, check with `npm view @capgo/capacitor-social-login peerDependencies` that the chosen version accepts `@capacitor/core` 8, and pin that version.
  - Stop here until approved.
- [ ] **Step 2: Install** (with `$env:ComSpec` set) and confirm `npm ls @capacitor/core` shows a single 8.x.
- [ ] **Step 3: Write the failing tests**, mocking `@supabase/supabase-js` `createClient` and `@capgo/capacitor-social-login`:
  - `signIn("google")`:
    - calls `SocialLogin.login({ provider: "google", options: { nonce: <sha256 hex of raw> } })`
    - then calls `signInWithIdToken({ provider: "google", token: idToken, nonce: raw })`
    - returns `{ id, email, name, provider: "google" }`
  - `signIn("google")` returns `null` when the plugin rejects with a user-cancel error. Before writing this, read the plugin's README for its cancel code.
  - `signIn("google")` throws when `signInWithIdToken` returns an error.
  - `currentUser()` returns the stored session's user even when the session's refresh would fail. Mock `getSession` to resolve the stored session; it must not sign the person out (Review Focus 1).
  - `getSupabase()` is null and `isAuthConfigured()` false with no URL.
- [ ] **Step 4: Run, expect FAIL**
  - `CI=true npx react-scripts test --watchAll=false auth.service`
- [ ] **Step 5: Implement**
  - `SocialLogin.initialize({ google: { webClientId: REACT_APP_GOOGLE_WEB_CLIENT_ID, mode: "online" } })` runs once, lazily.
  - Nonce: 32 random bytes, hex; SHA-256 via `crypto.subtle`. Follow the plugin's Supabase guide (https://capgo.app/docs/plugins/social-login/supabase/google/general/).
  - Map `user.app_metadata.provider` to `provider`, and `user_metadata.full_name ?? name` to `name`.
- [ ] **Step 6: Run, expect PASS. Commit** `feat(accounts): Supabase client and Google sign-in`

### Task 3: AuthProvider

**Files:**
- Create: `src/app/core/context/AuthContext.tsx`
- Modify: `src/App.tsx` (wrap `SubscriptionProvider` in `AuthProvider`)
- Test: `src/app/core/context/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: Task 1 `isAccountsOn`; Task 2 `signIn`, `signOut`, `currentUser`, `onAccountChange`, `AccountUser`, `AuthProviderId`.
- Produces: `useAuth(): AuthCtx` with:
  - `enabled: boolean` (= `isAccountsOn() && isAuthConfigured()`)
  - `ready: boolean` (true once the stored session has been read, immediately when not enabled)
  - `user: AccountUser | null`
  - `signIn(provider): Promise<"signed_in" | "cancelled" | "failed">`
  - `signOut(): Promise<void>`
  - `requestSignIn(): Promise<boolean>`: opens the sign-in sheet; resolves true once signed in, false if it's dismissed. A second call while open returns the same promise.
  - `signInOpen: boolean`
  - `closeSignIn(): void`: resolves the pending request with false.
  - Task 9 adds `deleteAccount`.

- [ ] **Step 1: Write the failing tests** (probe-component pattern from `SubscriptionContext.test.tsx`):
  - not enabled → `ready` true, `user` null, `currentUser` never called
  - enabled → `user` comes from `currentUser()`, then follows `onAccountChange` events
  - `signIn` maps `null` → `"cancelled"`, throw → `"failed"`, user → `"signed_in"`
  - `requestSignIn()` resolves true after a successful `signIn`, and false after `closeSignIn()`
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement.** In `App.tsx`, `<AuthProvider>` goes directly outside `<SubscriptionProvider>`.
- [ ] **Step 4: Run, expect PASS. Commit** `feat(accounts): AuthProvider`

### Task 4: Broker client sends the account token

**Files:**
- Modify: `src/app/core/services/audio/stt/broker.ts`, its callers
- Test:
  - `src/app/core/services/audio/__tests__/stt-broker.test.ts` (rewrite the id cases)
  - `src/app/core/context/__tests__/SubscriptionContext.test.tsx` (drop the broker-id assertions)

**Interfaces:**
- Produces:
  - `setBrokerTokenSource(source: (() => Promise<string | null>) | null): void`
  - `brokerHeaders(): Promise<Record<string, string>>`: `{ authorization: "Bearer <t>" }` when the source yields a token, `{}` otherwise.
  - Removed: `setBrokerUserId`, `expectBrokerUserId`, `brokerUserIdSettled`, `USER_ID_WAIT_MS`.
- Consumes: Task 3. `AuthProvider` calls `setBrokerTokenSource(enabled ? accessToken : null)` on mount.

- [ ] **Step 1: Rewrite the broker tests**
  - `fetchBrokerKey` sends `authorization: Bearer tok` when the source returns `"tok"`.
  - It sends no auth header with no source, or when the source returns null.
  - A source that throws is treated as no token (request still goes out).
  - The 402 → `NOT_SUBSCRIBED_MESSAGE` mapping stays.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
  - Update the module comments.
  - In `SubscriptionContext.tsx`, delete the `expectBrokerUserId`/`setBrokerUserId` calls (Task 6 rewrites that file further).
  - Wire `setBrokerTokenSource` in `AuthProvider`.
- [ ] **Step 4: Run** `stt-broker`, `SubscriptionContext` and `AuthContext`, **expect PASS. Commit** `feat(accounts): broker requests carry the account token`

### Task 5: Worker verifies the account token

**Files:**
- Create:
  - `token-broker/src/account-token.ts`
  - `token-broker/test/account-token.test.ts`
- Modify:
  - `token-broker/src/index.ts`
  - `token-broker/test/pro-check.test.ts`
  - `token-broker/package.json` (test script runs both files)
  - `token-broker/wrangler.toml`, `token-broker/README.md`, `token-broker/verify-deploy.sh`

**Interfaces:**
- Produces: `verifyAccountToken(token: string, supabaseUrl: string, nowMs: number): Promise<string | null>`. It returns the token's `sub` when:
  - the JWT is ES256 with a `kid` found in `${supabaseUrl}/auth/v1/.well-known/jwks.json`
  - the signature verifies (`crypto.subtle`, ECDSA P-256/SHA-256)
  - `iss === ${supabaseUrl}/auth/v1`
  - `aud === "authenticated"`
  - `exp > now`

  Otherwise it returns null. The JWKS is cached in module memory for 10 minutes, and an unknown `kid` forces one refetch.
- `Env` gains `SUPABASE_URL?: string` (a `[vars]` entry in `wrangler.toml` for prod and `[env.dev.vars]`).

- [ ] **Step 1: Write `account-token.test.ts`**
  - Generate a P-256 key pair with `crypto.subtle` and stub `fetch` to serve its public JWK.
  - Cases:
    - a valid token → `sub`
    - expired → null
    - wrong `iss` → null
    - wrong `aud` → null
    - `alg: "none"`/HS256 → null
    - tampered payload → null
    - unknown `kid` refetches once, then null
    - malformed string → null
- [ ] **Step 2: Update `pro-check.test.ts`**
  - Requests carry `authorization: Bearer <signed token for id>` instead of `x-rafeeq-user`, so every existing case keeps its meaning.
  - Add a case: missing/invalid token → 402.
  - Add a case: `REQUIRE_PRO="true"` and no `SUPABASE_URL` → 402 (logged).
- [ ] **Step 3: Run `npm test` in `token-broker/`, expect FAIL**
- [ ] **Step 4: Implement**
  - `requirePro` reads the bearer token and calls `verifyAccountToken`, then uses the returned id for the existing RevenueCat lookup and cache. The `isPlausibleAppUserId` check stays, applied to `sub`.
  - CORS `allow-headers` becomes `content-type, authorization`.
  - Delete the `/oauth2/token` route and `handleOAuthToken`, plus anything only it used (keep the QF client-credentials content-token path).
  - Update the header comment, README and `verify-deploy.sh` (`PRO_USER_ID` becomes a token or an account id, whichever the script can produce; document it).
- [ ] **Step 5: Run `npm test`, expect PASS. Commit** `feat(broker): verify the Supabase account token; drop x-rafeeq-user and /oauth2/token`

### Task 6: RevenueCat identity follows the account

**Files:**
- Modify:
  - `src/app/core/services/subscription/revenuecat.service.ts`
  - `src/app/core/context/SubscriptionContext.tsx`
- Test:
  - `src/app/core/context/__tests__/SubscriptionContext.test.tsx`
  - `src/app/core/services/subscription/__tests__/revenuecat.service.test.ts`

**Interfaces:**
- Consumes: Task 3 `useAuth()` (`enabled`, `ready`, `user`).
- Produces:
  - `configureRevenueCat(appUserId?: string | null)`: the first call wins. It passes `appUserID` to `Purchases.configure` when given.
  - `logInRevenueCat(id: string): Promise<CustomerInfo>`
  - `logOutRevenueCat(): Promise<CustomerInfo>`: skipped (resolves current info) when RevenueCat is already anonymous, since its `logOut` throws for anonymous users.
  - `SubscriptionCtx` is unchanged in shape. `appUserId` becomes the account id when signed in (the Support ID).

- [ ] **Step 1: Write the failing tests**
  - Accounts enabled, signed in as `u1` at launch → `configure` receives `appUserID: "u1"`. The provider waits for `auth.ready` before configuring.
  - Signing in later → `logIn("u1")` and `isPro` comes from its result.
  - Signing out → `logOut`, `isPro` false, cache `rafiq_pro_v1` = `"0"`.
  - Two accounts on one phone (Review Focus 3):
    1. Pro as `u1`, sign out, sign in `u2` (not Pro).
    2. `isPro` is false throughout the switch: no frame shows `u1`'s cached Pro to `u2`.
    3. `logIn("u2")` is called.
  - Accounts disabled → `configure` gets no `appUserID`; `logIn`/`logOut` are never called (Review Focus 5).
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
  - On a user change, clear the Pro cache **before** awaiting `logIn`/`logOut`, then `apply()` the returned info.
  - Update the file's header comment (no longer anonymous-only).
- [ ] **Step 4: Run, expect PASS. Commit** `feat(pro): RevenueCat identity follows the signed-in account`

### Task 7: Sign in before subscribing

**Files:**
- Create:
  - `src/app/features/account/SignInSheet.tsx` + `.css`
  - `src/app/features/subscription/useStartSubscribe.ts`
- Modify:
  - `src/App.tsx` (render `<SignInSheet />` next to `<ProNote />`)
  - `src/app/features/subscription/ProNote.tsx`
  - `src/app/features/account/SubscriptionRow.tsx`
  - `src/app/core/i18n/strings.ts`
- Test:
  - `src/app/features/subscription/__tests__/useStartSubscribe.test.tsx`
  - `src/app/features/account/__tests__/SignInSheet.test.tsx`

**Interfaces:**
- Consumes: Task 3 `useAuth()` (`enabled`, `user`, `requestSignIn`, `signInOpen`, `closeSignIn`, `signIn`); Task 1 `isAppleSignInOn`; existing `usePaywall()`.
- Produces:
  - `useStartSubscribe(): () => Promise<void>`: when `enabled && !user`, it awaits `requestSignIn()` and stops if that's false; then it calls `openPaywall()`.
  - `useSignedInAction(): (action: () => void | Promise<void>) => Promise<void>`: the same guard, for Restore.
  - New strings `t.account`:
    - `signInTitle`, `signInWhy`, `continueGoogle`, `continueApple`
    - `signInFailed`, `signIn`, `signOut`, `signedInAs`, `deleteAccount`
    - Task 9 adds the delete-dialog strings.

- [ ] **Step 1: Invoke `frontend-design:frontend-design`.** The sheet is a bottom sheet in the ProNote family: it registers with `overlay-registry` for Back and closes on route change like ProNote. It shows:
  - a title, plus one line on why ("Your subscription and synced data stay with your account")
  - a Google button, and an Apple button only when `isAppleSignInOn()`
- [ ] **Step 2: Write the failing tests**
  - Signed out: `useStartSubscribe` opens the sheet, and the paywall opens only after sign-in succeeds.
  - Cancelling (sheet dismissed, or `signIn` → `"cancelled"`) opens no paywall and shows no toast (Review Focus 2).
  - `"failed"` shows the `signInFailed` toast and keeps the sheet open.
  - Signed in, or accounts disabled → the paywall opens directly.
  - `SignInSheet` hides the Apple button when `isAppleSignInOn()` is false.
- [ ] **Step 3: Run, expect FAIL**
- [ ] **Step 4: Implement**
  - ProNote's CTA uses `useStartSubscribe`.
  - SubscriptionRow's "View" uses `useStartSubscribe`, and "Restore" goes through `useSignedInAction`.
  - Add the `ar`/`en` strings (e.g. ar `signInTitle: "سجّل الدخول للاشتراك"`, `continueGoogle: "المتابعة عبر Google"`, `continueApple: "المتابعة عبر Apple"`).
- [ ] **Step 5: Run, expect PASS** (plus the ProNote and SubscriptionRow suites). **Commit** `feat(accounts): sign in before subscribing`

### Task 8: Account section on the Account page

**Files:**
- Create: `src/app/features/account/AccountIdentityRow.tsx`
- Modify:
  - `src/app/features/account/Account.tsx` (render it directly above `<SubscriptionRow />`)
  - `src/app/features/account/Account.css`
  - `strings.ts`
- Test: `src/app/features/account/__tests__/AccountIdentityRow.test.tsx`

**Interfaces:**
- Consumes: Task 3 `useAuth()`; Task 7 strings and `requestSignIn`.
- Produces: the "Delete account" row calls `onDelete` (a prop). Task 9 passes it.

- [ ] **Step 1: Invoke `frontend-design:frontend-design`.** Reuse the `ac-section-label` / `ac-group` / `ac-row` patterns.
- [ ] **Step 2: Write the failing tests**
  - Accounts disabled → renders nothing (Review Focus 5).
  - Signed out → a "Sign in" row that calls `requestSignIn`.
  - Signed in → the name/email and a Google/Apple label, plus "Sign out" and "Delete account" rows.
  - Sign out calls `useAuth().signOut`.
  - The email appears only here (anti-goal).
- [ ] **Step 3: Run, expect FAIL**
- [ ] **Step 4: Implement**
- [ ] **Step 5: Run, expect PASS. Commit** `feat(accounts): Account page sign-in section`

### Task 9: Account deletion

**Files:**
- Create:
  - `supabase/config.toml` (from `npx supabase init`, or hand-written minimal)
  - `supabase/migrations/20261029000000_apple_tokens.sql`
  - `supabase/functions/delete-account/handler.ts` and `supabase/functions/delete-account/index.ts`
  - `supabase/functions/_shared/apple.ts`
  - `supabase/test/delete-account.test.ts` and `supabase/test/apple.test.ts`
  - `scripts/delete-account.sh`
  - `src/app/features/account/DeleteAccountSheet.tsx` + `.css`
- Modify:
  - `auth.service.ts` (+ `deleteAccount`)
  - `AuthContext.tsx` (+ `deleteAccount`)
  - `Account.tsx`, `strings.ts`
- Test:
  - `src/app/features/account/__tests__/DeleteAccountSheet.test.tsx`
  - `auth.service.test.ts`

**Interfaces:**
- **Migration:** table `public.apple_tokens(user_id uuid primary key references auth.users on delete cascade, refresh_token text not null, updated_at timestamptz not null default now())`.
  - RLS is enabled with **no policies**, so only the service role reaches it. Load `supabase:supabase-postgres-best-practices` first.
  - Part 2's sync tables will also reference `auth.users on delete cascade`, so deleting the auth user removes them.
- `_shared/apple.ts`:
  - `appleClientSecret(cfg: { teamId; keyId; clientId; privateKeyPem }, nowSec: number): Promise<string>`: an ES256 JWT, `aud: "https://appleid.apple.com"`, 5-minute expiry.
  - `exchangeAppleCode(code, cfg): Promise<string>`: the refresh token, from `POST https://appleid.apple.com/auth/token`.
  - `revokeAppleToken(refreshToken, cfg): Promise<void>`: `POST /auth/revoke`, `token_type_hint=refresh_token`.
- `handler.ts`: `handleDeleteAccount(req: Request, deps: DeleteDeps): Promise<Response>`. `DeleteDeps` holds:
  - `userFromToken(token): Promise<{ id: string; provider: string } | null>`
  - `findUser(q: { id?: string; email?: string }): Promise<{ id: string; provider: string } | null>`
  - `appleRefreshToken(userId): Promise<string | null>`
  - `revokeApple(refreshToken): Promise<void>`
  - `deleteRevenueCatCustomer(userId): Promise<void>` (404 counts as done)
  - `deleteAuthUser(userId): Promise<void>`
  - `adminSecret: string | null`
- Auth paths into the handler:
  - Caller path: `Authorization: Bearer <access token>`.
  - Admin path (owner script): `x-admin-secret` matching `adminSecret` plus a JSON body `{ id }` or `{ email }`.
- Handler order: Apple revoke (when a stored token exists) → RevenueCat → auth user. **Any step throwing returns 502 and runs nothing after it.** Success returns 200 `{ deleted: true }`.
- `index.ts` wires the deps with `npm:@supabase/supabase-js@2` (service role) and the secrets:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REVENUECAT_SECRET_KEY`
  - `ADMIN_DELETE_SECRET`
  - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`, which may be absent until iOS exists. When absent, an Apple user with a stored token gets 502, not a silent skip.
- Client: `deleteAccount(): Promise<void>` in `auth.service.ts`:
  - POSTs `${REACT_APP_SUPABASE_URL}/functions/v1/delete-account` with the bearer token and throws on non-2xx.
  - On success it signs out locally. `AuthContext.deleteAccount` wraps it.
  - `SubscriptionContext` then sees `user → null` and logs RevenueCat out (Task 6).

- [ ] **Step 1: Write `supabase/test/delete-account.test.ts`** (stubbed deps):
  - A caller token deletes in order: revoke → RevenueCat → auth (assert the call order).
  - No/invalid token → 401.
  - RevenueCat throws → 502 and `deleteAuthUser` **not** called (Review Focus 4).
  - Revoke throws → 502, nothing else is called.
  - The admin path with the wrong secret → 401; with the right secret plus `{ email }` → deletes that user.
  - A user that isn't found → 404.
- [ ] **Step 2: Write `supabase/test/apple.test.ts`**
  - `appleClientSecret` produces a JWT whose header is `{ alg: "ES256", kid }`, with the payload fields above.
  - Its signature verifies with the generated key's public half.
- [ ] **Step 3: Run** `node --experimental-strip-types --test supabase/test/*.test.ts`, **expect FAIL**
- [ ] **Step 4: Implement**
  - Write the migration, `_shared/apple.ts`, `handler.ts` and `index.ts`.
  - `scripts/delete-account.sh <id-or-email>` curls the function with `ADMIN_DELETE_SECRET` from the environment and prints the result.
- [ ] **Step 5: Run, expect PASS**
- [ ] **Step 6: Invoke `frontend-design:frontend-design`.** Then write the failing `DeleteAccountSheet` tests:
  - It lists what gets deleted: account, synced data, subscription record.
  - It says deleting **does not cancel the store subscription**.
  - When `isPro`, it shows a "Manage subscription" button calling `showCustomerCenter` before the delete button.
  - Confirm calls `deleteAccount`.
  - A `deleteAccount` rejection shows an error, keeps the sheet open with the person still signed in, and Delete can be tapped again (Review Focus 4).
  - Success closes the sheet and shows a toast.
- [ ] **Step 7: Add a `deleteAccount` test to `auth.service.test.ts`**
  - It hits the function URL with the bearer token.
  - A 502 throws, and the local sign-out does **not** happen.
- [ ] **Step 8: Implement the client and the sheet.** Wire the sheet to `AccountIdentityRow`'s `onDelete`, and add the strings.
- [ ] **Step 9: Run all affected suites, expect PASS. Commit** `feat(accounts): full account deletion (edge function, Apple revoke, in-app flow)`

### Task 10: Sign in with Apple

**Files:**
- Create:
  - `supabase/functions/apple-token/handler.ts` and `supabase/functions/apple-token/index.ts`
  - `supabase/test/apple-token.test.ts`
- Modify:
  - `auth.service.ts` (`signIn("apple")`)
  - `src/App.tsx` (auth-callback deep link)
  - `android/app/src/main/AndroidManifest.xml` (`rafeeq://auth` VIEW intent-filter on `MainActivity`)
- Test: `auth.service.test.ts`

**Interfaces:**
- Consumes: Task 9 `_shared/apple.ts` `exchangeAppleCode`; the `apple_tokens` table.
- `handleAppleToken(req, deps: { userFromToken; exchangeAppleCode(code): Promise<string>; saveRefreshToken(userId, token): Promise<void> }): Promise<Response>`
  - Bearer auth plus body `{ authorizationCode }` → exchange → upsert → 200.
  - Errors → 502.
- `signIn("apple")`:
  - **iOS:**
    1. `SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"], nonce: <sha256 of raw> } })`
    2. `signInWithIdToken({ provider: "apple", token: idToken, nonce: raw })`
    3. Fire-and-forget POST of `authorizationCode` to `/functions/v1/apple-token`. Failures are logged, and sign-in still succeeds.
  - **Android:**
    1. `signInWithOAuth({ provider: "apple", options: { redirectTo: "rafeeq://auth/callback", skipBrowserRedirect: true } })`
    2. `Browser.open({ url })`
    3. Resolves when `App.tsx`'s `appUrlOpen` handler passes a `rafeeq://auth/callback?code=…` URL to a new `completeOAuthRedirect(url: string): Promise<void>` (calls `exchangeCodeForSession(code)`, then `Browser.close()`).
    4. Resolves null (cancelled) on Browser `browserFinished` with no callback.
  - Android web-flow users have no stored Apple token, so deletion skips the revoke for them. Note this in the code comment and in `PLAY-CONSOLE-PREP.md`.
- Produces: `completeOAuthRedirect(url: string): Promise<void>` (exported from `auth.service.ts`).

- [ ] **Step 1: Write `apple-token.test.ts`**
  - The happy path saves the exchanged token for the caller's id.
  - No token → 401.
  - Exchange throws → 502 with nothing saved.
- [ ] **Step 2: Add `auth.service` tests**
  - The iOS path calls `signInWithIdToken` with provider `apple` and posts the code.
  - A failed code post still resolves the user.
  - The Android path opens the browser with the OAuth URL and resolves the user after `completeOAuthRedirect("rafeeq://auth/callback?code=abc")`.
  - `browserFinished` without a callback → null.
- [ ] **Step 3: Run both test commands, expect FAIL**
- [ ] **Step 4: Implement**
  - Add `<intent-filter>` with `VIEW`, `DEFAULT` and `BROWSABLE`, data `android:scheme="rafeeq" android:host="auth"`.
  - Extend `App.tsx`'s existing `appUrlOpen` effect (it already routes `rafeeq://azkar/…`) to send `rafeeq://auth/…` to `completeOAuthRedirect`.
- [ ] **Step 5: Run, expect PASS. Commit** `feat(accounts): Sign in with Apple (iOS native, Android web flow) and token capture`

### Task 11: Store paperwork and owner setup

**Files:**
- Modify:
  - `PLAY-CONSOLE-PREP.md` (§0 status, §1, §2, §4, §8, §9)
  - `TODO.md`
  - `token-broker/README.md` (if not done in Task 5)
- On the `gh-pages` branch:
  - Create `delete-account.html` and `delete-account-ar.html`.
  - Modify `privacy.html`, `privacy-ar.html`, `terms.html`, `terms-ar.html`.

The spec's "in-app `PRIVACY_SECTIONS` mirror" no longer exists: the Account page opens the hosted pages via `LEGAL_BASE_URL`, so the hosted files are the only copy.

- [ ] **Step 1: Rewrite `PLAY-CONSOLE-PREP.md` §4** as "Account deletion — REQUIRED". It covers:
  - the in-app path
  - the public URL (`<LEGAL_BASE_URL>/delete-account.html`)
  - what the Edge Function deletes, in order
  - the email-request runbook (`scripts/delete-account.sh`, with `ADMIN_DELETE_SECRET`)
  - the Apple-revoke limit for Android web-flow users

  Replace the "Recovering the sign-in code" subsection with a pointer to this plan.
- [ ] **Step 2: Update §1/§2 (Data safety)** per the spec checklist:
  - Personal info: Name, Email, User IDs, for account management
  - Purchase history
  - Deletion = yes, encrypted in transit
  - App access: a reviewer test Google account with promo Pro
- [ ] **Step 3: Update §8/§9 release order:**
  1. Supabase prod and Google/Apple setup
  2. Worker `SUPABASE_URL` and the Edge Function secrets
  3. Legal pages and deletion page live
  4. Data safety redone
  5. A build with `REACT_APP_ACCOUNTS=on`
  6. `REACT_APP_PRO_GATE=on`
  7. `REQUIRE_PRO="true"`

  Add the owner setup list from the spec (Supabase dev/prod projects, Google OAuth clients with debug **and** Play App Signing SHA-1s, RevenueCat transfer behaviour "keep with the original App User ID", or whatever the dashboard currently calls it, plus a reviewer promo-Pro account). Note: move Supabase to the Pro plan before real subscribers' data accumulates (no backups on Free).
- [ ] **Step 4: Update the legal pages on `gh-pages`.**
  - Privacy:
    - "no account required" → "no account required for the free app"
    - name Supabase (with region placeholder `[REGION]`), Google/Apple sign-in, the data held (account id, email, name, and Part 2 synced data), retention until deletion, and how to delete
    - RevenueCat is now linked to the account id
  - Terms: the account section.
  - New `delete-account(-ar).html` in the same styling: the in-app steps, the email route (`or.mokhtar@gmail.com`), what is deleted, and that the store subscription must be cancelled separately.
  - **Do not push `gh-pages`.** Hosting goes live only when the owner merges or pushes it.
- [ ] **Step 5: Update `TODO.md`** with the owner checklist.
- [ ] **Step 6: Commit on each branch:**
  - `docs: account deletion, Data safety and release order for accounts`
  - `docs(legal): accounts, Supabase and deletion page` (gh-pages, local only)
