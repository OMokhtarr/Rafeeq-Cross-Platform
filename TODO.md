# TODO

## Rafeeq Pro launch (RevenueCat)

Code is done and merged; Test Store purchases, restore and the Arabic paywall
are verified on a debug build. What's left is store setup and launch, in this
order. Full detail in `PLAY-CONSOLE-PREP.md` §9.

- [x] **Google Play products.** In Play Console → Monetize → Subscriptions,
      create `monthly` and `yearly` with their real prices and base plans.
      Done 29 Oct 2026: subscription `rafeeq_pro`, base plans `monthly` and
      `yearly`, active; real-time developer notifications connected.
- [x] **Link Play to RevenueCat.** Add the Play Store app in RevenueCat,
      upload Google's service-account credentials, attach the Play products
      to the entitlement `com_rafeeq_quranquiz_pro`, and put them in the
      `default` offering's Monthly and Annual packages. Add your Google
      account as a license tester in Play Console.
- [x] **Keys.** Put the `goog_…` public key in `.env.production` as
      `REACT_APP_REVENUECAT_ANDROID_KEY`, and **delete the `test_` line from
      `.env.local`** — `.env.local` overrides `.env.production`, and the SDK
      crashes release builds that carry a Test Store key (the app refuses it,
      so RevenueCat would simply be off).
- [x] **Worker.** Copy the RevenueCat secret key (`sk_…`), run
      `npx wrangler secret put REVENUECAT_SECRET_KEY`, and deploy with
      `REQUIRE_PRO` still `"false"`.
- [ ] **Store forms.** Before the first build carrying the `goog_` key:
      content rating (digital purchases = Yes) and Data safety (purchase
      history). The hosted privacy policy and terms already name RevenueCat
      and cover subscriptions (updated 24 Oct 2026).
- [ ] **Real-purchase test.** Closed-testing build with the `goog_` key and
      the license-tester account: buy, renew, expire, reinstall + Restore,
      Customer Center.
- [ ] **Launch.** Set `REACT_APP_PRO_GATE=on` in `.env.production` (leave it
      out of `.env.local`) and release; then set `REQUIRE_PRO = "true"` in
      `token-broker/wrangler.toml` and deploy; then run
      `PRO_TOKEN=<access token of a signed-in Pro account> bash token-broker/verify-deploy.sh`
      — every check must pass. (`PRO_TOKEN` is a fresh Supabase access
      token, not a user id.)

## Accounts launch (Supabase sign-in, owner setup)

Code is merged and dark behind `REACT_APP_ACCOUNTS=on`. Pro lives on the
account, so this comes before the Pro launch above goes live. Full detail,
the release order and the store paperwork are in `PLAY-CONSOLE-PREP.md` §2,
§4 and §9.

- [ ] **Supabase projects.** Create dev + prod. Both must sign JWTs with the
      asymmetric **ES256** signing keys (the broker refuses legacy HS256
      tokens). Put the prod URL in `token-broker/wrangler.toml`
      `SUPABASE_URL` and the dev URL in `[env.dev.vars]`; put the project ref
      in `supabase/config.toml` `project_id`; `supabase link`, then
      `supabase db push` to apply the `apple_tokens` migration.
- [ ] **Google.** OAuth clients: a Web client (→ `REACT_APP_GOOGLE_WEB_CLIENT_ID`
      and Supabase's Google provider) and an Android client with the debug
      SHA-1 **and** the Play App Signing SHA-1.
- [ ] **Apple (when ready).** Services ID + key; Supabase Apple provider with
      the Services ID and the iOS bundle id among its client ids;
      `rafeeq://auth/callback` in Supabase's redirect allow-list; Edge Function
      secrets `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
      `APPLE_BUNDLE_ID`; `REACT_APP_APPLE_SIGNIN=on` to show Apple on Android.
      Known limit: Apple accounts created through the Android web flow have no
      stored Apple token, so deletion can't revoke Apple's grant for them.
- [ ] **Edge Functions.** Secrets `SUPABASE_SERVICE_ROLE_KEY` (Supabase
      provides it), `REVENUECAT_SECRET_KEY`, `ADMIN_DELETE_SECRET` (long random,
      at least 32 characters); deploy `delete-account` and `apple-token`.
- [ ] **App env.** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_PUBLISHABLE_KEY`,
      and `REACT_APP_ACCOUNTS=on` only in the build that goes out after the
      paperwork is live.
- [ ] **RevenueCat dashboard.** Transfer behaviour so a purchase stays with the
      account that bought it ("Keep with original App User ID", or the
      dashboard's current name for it; verify). Create a reviewer test Google
      account and grant it promotional Pro.
- [ ] **`npx cap sync`** before the next build: `@capacitor/browser` and
      `@capgo/capacitor-social-login` are not registered in the Android
      project yet.
- [ ] **Legal pages.** On the local `gh-pages` branch (not pushed): replace the
      `[REGION]` placeholder in `privacy.html` and `privacy-ar.html` with the
      Supabase region, then push; confirm `delete-account.html` (+ `-ar`),
      `privacy.html` and `terms.html` load.
- [ ] **Play Console.** Redo Data safety (Name, Email, User IDs for account
      management; Purchase history; deletion = yes; delete-account URL
      `<LEGAL_BASE_URL>/delete-account.html`), App access with the reviewer
      account, and re-run the content rating if not done for Pro.
- [ ] **Supabase Free to Pro** before real subscribers' data accumulates (Free
      has no backups).
- [ ] **Support runbook.** Email deletion requests:
      `SUPABASE_URL=... ADMIN_DELETE_SECRET=... scripts/delete-account.sh <user-id | email>`.

## Later

- [ ] **Ionic version mismatch.** `@ionic/react` is on 7.8.6 (`^7.0.0`) but
      `@ionic/react-router` is on 8.8.19 (`^8.7.18`). Mixed majors work today
      but aren't a supported pairing. Align both on Ionic 8 (`@ionic/react`
      8.x — read Ionic's 7→8 migration guide first) and re-test navigation,
      Back handling, overlays and the bottom nav. Ionic 9 is out too, but
      that is a separate, later upgrade. Found in the Oct 2026 dependency audit.

- [ ] **Major upgrades.** React 19, React Router 7, Ionic 9, TypeScript 7 and
      `@quranjs/api` 3 are out. Each is a breaking migration of its own; do
      them one at a time, after the Ionic 8 alignment above.

- [ ] **Regenerate the knowledge graph** (`/understand`). The current graph
      is from June 2026 and predates recite mode, Rafeeq Pro, Soniox, the
      tracker and prayer alarms, and still lists Electron, so CLAUDE.md's
      "graph first" rule points at stale code until it's rebuilt.
