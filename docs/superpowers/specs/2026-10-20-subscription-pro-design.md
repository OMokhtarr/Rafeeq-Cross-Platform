# Rafeeq Pro Subscription — Design

Date: 2026-10-20
Branch: `subscription-pro` (from `main`)
Status: design — awaiting approval
Replaces: the July plan `docs/subscription-model-spec.md` on branch
`subscription-model`. That plan tied the subscription to the Quran Foundation
login, which was deleted in August 2026 (all user data is now local-only).

## Why

Recite mode runs on paid speech engines: Deepgram, Soniox and Cloudflare
Whisper, which the user picks in Settings. Every minute of recitation costs
the owner money. Recite becomes a paid feature, "Rafeeq Pro", so its users
pay for what they use. Today the token broker's speech routes are open to
anyone who finds the URL, so the subscription must also be enforced on the
server. A paywall in the app alone is not enough.

## Goals

1. **Only recite is paid.** It covers all three places it exists: the Quran
   page viewer, the Akmel al-Ayah quiz and the Mutashabihat quiz. Everything
   else in the app stays free.
2. **Non-subscribers know before they try** (the user chose option C, "badge
   first"):
   1. The recite mic button shows a small **PRO** badge.
   2. Tapping it shows a **short note in place**: "Recite is for
      subscribers", one line on what it does, and a **"View subscription"**
      button.
   3. That button opens a **full subscribe page**: what Pro gives, the plans,
      Subscribe, and "Restore purchases". ✕ returns to where they were.
3. **Subscribers see no badge.** Recite works exactly as today.
4. **No login.** The subscription belongs to the person's store account
   (Google Play; Apple on iPhone). On a new phone or after a reinstall,
   "Restore purchases" brings it back.
5. **The server enforces it.**
   - The token broker refuses speech access (Deepgram/Soniox keys and
     Whisper transcription) to anyone RevenueCat doesn't report as Pro.
   - The check sits behind an on/off switch the owner controls. It stays off
     until the store products are live, then is turned on before the store
     release.
6. **Unlimited use for subscribers.** No minute counting or caps; the owner
   prices for it.
7. **Both platforms.**
   - The code is written for Android and iPhone; RevenueCat's Capacitor SDK
     covers both with one API.
   - Android is built and tested first. iPhone turns on once the iOS project
     exists (see "iPhone").

## Non-goals

- Other paid features or tiers. The gate is reusable, but only recite uses
  it now.
- Free trials or intro prices in code. Those are configured in the stores
  and RevenueCat; no code change.
- Usage limits, minute metering, or per-user cost tracking.
- Accounts, login, or syncing anything besides the store's own subscription.
- Creating the iOS project (`npx cap add ios`). It needs a Mac with Xcode,
  which the owner doesn't have set up.
- Changing recite behaviour, the engines, or the aligner.

## Anti-goals

- **A subscriber seeing the PRO badge or the paywall.** That includes a
  flash of the badge while the status loads on startup.
- **A paywall that can be skipped by calling the broker directly** once the
  switch is on.
- **Taking payments outside the stores.** Google and Apple require store
  billing for digital features; RevenueCat wraps store billing.
- **Blocking development.** In the browser (`npm start`) nothing can be
  bought, so recite stays unlocked there.

## The design

### 1. Billing: RevenueCat

- Package `@revenuecat/purchases-capacitor`.
- Entitlement id **`pro`**.
- One offering, "default", with monthly and yearly packages. Prices and
  trials are set by the owner in the stores.
- Public SDK keys go in env vars: `REACT_APP_REVENUECAT_ANDROID_KEY` and
  `REACT_APP_REVENUECAT_IOS_KEY`. These keys are public by design, so it's
  safe that CRA inlines them.
- **Identity:** the SDK's own anonymous app-user id. Don't call `logIn`; there
  is no account. Restore re-attaches the store purchase to the current
  anonymous id (RevenueCat's default "transfer" behaviour).

### 2. Subscription state in the app

The app gets a new `SubscriptionContext` provider in `App.tsx`, next to the
existing providers. Its hook returns:

```ts
useSubscription(): {
  isPro: boolean;          // what the UI gates on
  ready: boolean;          // first real answer received
  appUserId: string | null;// RevenueCat app-user id, sent to the broker
  offerings: …;            // packages for the subscribe page
  purchase(pkg): Promise<…>;
  restore(): Promise<…>;
}
```

How it behaves:

- **Startup:** configure RevenueCat once, then read customer info and listen
  for updates, so renewals and expiries apply live.
- **No badge flash:** the last known `isPro` is cached in localStorage
  (`rafiq_pro_v1`) and used as the starting value. A subscriber therefore
  never sees the badge flash on startup; the live answer replaces it when it
  arrives.
- **Browser:** where store billing doesn't exist (`Capacitor.getPlatform()`
  is `"web"`), `isPro = true`, so development isn't blocked.
- **Engine-side failure:** a recite session refused by the broker with
  `not_subscribed` (see §4) opens the note, and sets `isPro` false for the
  session. This covers a lapsed subscription the app didn't hear about yet.

### 2a. The app-side switch (owner decision, 2026-10-20)

The owner chose an app-side switch. It was first proposed so closed-test
testers could keep free recite. The owner then confirmed the closed test is
finished (2026-10-20). The switch stays anyway, because it lets this code
merge and ship before the RevenueCat and Play products are live. The gate is
turned on only once purchases actually work.

- A build-time env var **`REACT_APP_PRO_GATE`**. Only the value `"on"`
  enables the gate.
- **While it's off** (the default, including every closed-test build):
  - no PRO badge;
  - no note;
  - recite starts for everyone, exactly as today.
- **Still reachable while it's off.** The Account → Subscription row and the
  `/subscribe` page stay available, so the owner can make test purchases and
  check Restore and Manage before launch.
- **The server switch (`REQUIRE_PRO`, §7) is separate.** It must also stay
  off during the closed test.
- **Release order:** set `REACT_APP_PRO_GATE=on` in `.env.production`, build,
  then turn on `REQUIRE_PRO`.
- The gate helper reads the flag in one place. Unit tests cover both values.

### 3. The gate on the three recite surfaces

**Viewer (`PageViewer.tsx`).**
- Recite mode is entered by long-pressing the play button
  (`handlePlayPressStart`, ~L176). Once armed, the button becomes the mic
  (~L987–1007).
- Arming stays free for everyone, because it only swaps the button and shows
  the page.
- For non-subscribers, the armed mic shows the PRO badge. A tap that would
  start recording (`handlePlayPressEnd` → `recite.startRecording()`, ~L223)
  opens the note instead.
- **No badge on the play button**, because playback is free.

**Quizzes** (`AkmelAlAyah.tsx` `handleReciteToggle` ~L259; `MutashabihatTest.tsx`
`handleReciteToggle` ~L231):
- The mic button shows the PRO badge for non-subscribers.
- The branch that would *start* recitation opens the note instead.
- Stopping an already-running session is never gated.

**General rule:**
- Gate only the action that **starts listening**. The recite hooks
  (`useReciteMode`, `useQuizRecite`) stay unchanged.
- One small shared helper or component gives all three places the same
  badge, the same note and the same "open the subscribe page" action. How it
  is shaped is the builder's call.

### 4. The short note

- A small card shown in place, anchored near the mic button, over the page,
  with:
  - 🔒 **"Recite is for subscribers"**;
  - one line on what recite does;
  - a green **"View subscription"** button.
- Tapping outside dismisses it.
- Arabic and English strings go in `strings.ts`, following the existing
  pattern.
- Mockup: the brainstorm screen "The flow you chose" (step 2).

### 5. The full subscribe page

- A new route **`/subscribe`**, matching how the app's other pages are
  routed. ✕ or Back returns to the page that opened it.
- Contents, from the mockup:
  - a mic icon and the title "Rafeeq Pro";
  - a one-line pitch;
  - three ✓ points: follow along word by word, mistakes and skipped words
    shown, recite in the quizzes;
  - the plan options from the RevenueCat offering (yearly preselected, with
    a savings tag if yearly is cheaper per month);
  - a green **Subscribe** button;
  - **Restore purchases**;
  - small print: auto-renew, cancel any time in the store. Both stores
    require this.
- On a successful purchase or restore, the page closes and the app returns
  to the page that opened it. No auto-start; the user taps the mic again.
- Errors:
  - A cancelled purchase is silent.
  - Other failures show a toast.
  - "Restore found nothing" says so.
- Prices are always shown as the store's localized price string, never
  hard-coded.
- Follows the app's visual rules:
  - green only as fills, gold for text and borders;
  - width capped with `var(--max-width-mobile, 600px)`;
  - no visible scrollbars;
  - bottom-nav padding if the bottom nav is shown on this page.

  Whether the bottom nav shows is the builder's call. The frontend-design
  skill is used when building it.

### 6. Managing the subscription (my call — not discussed with the user)

The Account page (More → Account, `/account`) gets a small **Subscription**
row:

- **Subscriber:** "Rafeeq Pro — active", with a **Manage subscription**
  button that opens the store's own management page. RevenueCat's customer
  info provides `managementURL`.
- **Non-subscriber:** "Free", with a **View subscription** button
  (`/subscribe`) and **Restore purchases**.

Reason: subscribers need a way to cancel, and Restore should be reachable
without hitting the paywall first.

The row also shows a small, copyable **Support ID**: the RevenueCat app-user
id, shortened, with a copy button. The owner needs it for two things:
- granting free Pro through RevenueCat's promotional entitlements, e.g. for
  testers, family or a store reviewer;
- answering "I paid but it's still locked".

A person who shares it only shares their own access. This is my call.

### 7. Server enforcement in the token broker

- **Client → broker.** Every speech request carries the RevenueCat app-user
  id in the header `x-rafeeq-user`. That covers the `fetchBrokerKey` calls to
  `/deepgram/token` and `/soniox/token`, and the Whisper `transcribeSegment`
  upload. Add `x-rafeeq-user` to the Worker's CORS allowed headers.
- **The switch.** A plain-text Worker variable, `REQUIRE_PRO`, which is
  `"true"` or anything else, set in `wrangler.toml` `[vars]` or the dashboard.
  When it isn't `"true"`, behaviour is exactly as today.
- **When `REQUIRE_PRO` is `"true"`:**
  1. Read the header. If it's missing, return **402**
     `{ error: "subscription required", code: "not_subscribed" }`.
  2. Ask RevenueCat: `GET https://api.revenuecat.com/v1/subscribers/{id}`
     with `Authorization: Bearer <REVENUECAT_SECRET_KEY>` (a Worker secret).
     The id is a path segment, so URL-encode it.
  3. The user is Pro when `subscriber.entitlements.pro` exists and its
     `expires_date` is null or in the future. Otherwise return the same 402.
  4. If RevenueCat itself fails (network or 5xx), **fail open** for that
     request and log it. A RevenueCat outage must not lock out paying users.
     This is the builder's call to revisit if abused.
- **Caching.** Cache **only "is Pro" answers**, for 5 minutes per id, using
  the Workers Cache API or in-memory per isolate. This keeps RevenueCat calls
  low; Whisper sends a request per phrase. Never cache a "not Pro" answer:
  that would refuse someone who has just bought.
- **Browser development once the switch is on (my call).**
  - Add a second Worker environment in `wrangler.toml`, `[env.dev]`. It's
    the same code with `REQUIRE_PRO` off, deployed with
    `npx wrangler deploy --env dev`.
  - Point `npm start` at it through **`.env.development.local`**. CRA loads
    that file only for the dev server, never for production builds, so
    nothing dev-only reaches the APK.
  - The production broker URL stays in `.env.production` and `.env.local`
    as today.
- **App side.** The adapters already surface broker errors through
  `onError`, but `micError` is only a string, and the quizzes replace it with
  a fixed message.
  - Give the 402 its own exported message constant.
  - Have each recite surface check for that message, so it opens the note
    and doesn't show a generic error toast.
- **Known limit.**
  - Anyone holding a subscriber's app-user id could reuse it. Ids are random,
    so this is acceptable for now.
  - Stronger device attestation (Play Integrity / App Attest) is a later
    step.
  - The id appears only as the copyable Support ID in §6, and only on the
    owner's own device.
- **`verify-deploy.sh`.**
  - With the switch on, a request without the header must get 402.
  - Add a note on testing with a real subscriber id.

### 8. iPhone

- The code is written for both platforms. RevenueCat is configured with the
  iOS key when `getPlatform() === "ios"`.
- The project has **no `ios/` folder yet**. Before iPhone ships, the owner
  must:
  1. run `npx cap add ios` on a Mac;
  2. add `NSMicrophoneUsageDescription` (Arabic and English) to `Info.plist`;
  3. create the subscription products in App Store Connect and link them in
     RevenueCat.

  None of these are part of this build. List them in the plan's final task
  as owner steps.

## Owner setup steps (the owner does these; they build and deploy themselves)

1. **RevenueCat:**
   - create a project with Android and iOS apps;
   - create the entitlement **`pro`**;
   - create the offering "default" with monthly and yearly packages;
   - copy the public SDK keys into `.env.local`.
2. **Play Console:**
   - create monthly and yearly subscription products, plus an optional free
     trial;
   - link the Play service account in RevenueCat;
   - add a license tester account for test purchases.
3. **Broker:**
   - `npx wrangler secret put REVENUECAT_SECRET_KEY`;
   - deploy with `REQUIRE_PRO` off;
   - deploy the dev copy with `npx wrangler deploy --env dev`;
   - test purchases from Account → Subscription;
   - at store release, first ship a build with `REACT_APP_PRO_GATE=on`, then
     set `REQUIRE_PRO=true` and redeploy.
4. The package `@revenuecat/purchases-capacitor` is already installed. It was
   added on 2026-10-20 at the owner's request, so the code can be
   type-checked and tested. The owner then runs `npx cap sync` and builds.
5. Update the privacy policy and the Data safety form: purchase history goes
   to RevenueCat and Google.

## Testing

- **Unit tests:**
  - the context's initial value from the cache, the web → Pro rule, and
    live-update handling (with the SDK mocked);
  - each of the three gates: a non-subscriber's start opens the note and
    doesn't start recite; a subscriber's start behaves as today; stop is
    never gated;
  - the subscribe page renders the offering packages and calls
    purchase/restore;
  - the broker's 402 surfacing as "not subscribed" in the adapters.
- **Worker:** with the switch off, unchanged; with it on: missing header →
  402, non-Pro → 402, Pro → normal, RevenueCat down → allowed. Check with
  the wrangler dry-run plus a scratch run like the last feature's.
- **The real test is the owner's,** on an Android build with a Play license
  tester account:
  - buy → badge gone → recite works;
  - reinstall → Restore → works;
  - cancel → after expiry, the badge returns.
