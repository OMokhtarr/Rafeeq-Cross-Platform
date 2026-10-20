# Rafeeq Pro Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recite mode a paid "Rafeeq Pro" feature. It's sold through RevenueCat with store billing and no login. The app gates recite behind an app-side switch, and the token broker enforces it behind a server-side switch.

**Architecture:**
- **App state.** A `SubscriptionProvider` wraps RevenueCat. It exposes `isPro`, the app-user id, the offerings, purchase and restore.
- **The gate.** A `useProGate()` hook gates only the action that *starts listening* on the three recite surfaces. It shows a PRO badge, a short note and a `/subscribe` page.
- **Broker identity.** The broker client sends the app-user id as `x-rafeeq-user`.
- **Server enforcement.** When `REQUIRE_PRO` is `"true"`, the Worker checks the RevenueCat REST API and answers 402 for non-subscribers. The app turns a 402 into the note.

**Tech Stack:**
- React 18 + TypeScript (CRA, Jest via `react-scripts test`), Ionic React, Capacitor 8.
- `@revenuecat/purchases-capacitor` 13.7.4 (already installed).
- Cloudflare Worker (`token-broker/`, wrangler 3).

**Spec:** `docs/superpowers/specs/2026-10-20-subscription-pro-design.md`

## Global Constraints

**RevenueCat setup**
- The entitlement id is exactly `"pro"`. Use the RevenueCat offering `current`; its packages are monthly and yearly.
- Public keys come from `process.env.REACT_APP_REVENUECAT_ANDROID_KEY` and `process.env.REACT_APP_REVENUECAT_IOS_KEY`. Pick the key by `Capacitor.getPlatform()`.
- No `logIn` / `logOut` calls. Identity is RevenueCat's anonymous app-user id.

**Subscription status in the app**
- On `"web"`, `isPro` is always `true`, and RevenueCat is never configured.
- The cached Pro flag lives in localStorage key `rafiq_pro_v1` (`"1"` / `"0"`). It is the initial `isPro` on native, so a subscriber never sees the badge flash.
- The app-side switch: the gate is active only when `process.env.REACT_APP_PRO_GATE === "on"`. When it's off, nothing is badged or blocked, but `/subscribe` and the Account Subscription row still work.

**What gets gated**
- Gate only the action that *starts listening*. Arming viewer recite mode, stopping a running session, and playback are never gated. There's no badge on the viewer play button.
- No logic changes in `useReciteMode.ts`, `useQuizRecite.ts`, `useIdentifySession.ts`, `deepgramDriver.ts`, or the STT adapters' engine behaviour. The only adapter changes: the request header, and 402 → `NOT_SUBSCRIBED_MESSAGE`.

**Broker and Worker**
- Header name `x-rafeeq-user`.
- The 402 body is `{ "error": "subscription required", "code": "not_subscribed" }`.
- The client-side error message constant is `NOT_SUBSCRIBED_MESSAGE = "Subscription required"`, exported from `stt/broker.ts`.
- The Worker vars are `REQUIRE_PRO` (enforce only when exactly `"true"`) and the secret `REVENUECAT_SECRET_KEY`.
- RevenueCat REST: `GET https://api.revenuecat.com/v1/subscribers/{encodeURIComponent(id)}` with `Authorization: Bearer <secret>`.
  - The user is Pro when `subscriber.entitlements.pro` exists and its `expires_date` is `null` or later than now.
  - If RevenueCat errors (network or 5xx), fail open and `console.error`.
  - Cache only Pro answers, for 5 minutes.

**Copy and style**
- Copy (Arabic / English):
  - note title `التسميع متاح للمشتركين` / `Recite is for subscribers`
  - note line `سمّع وسيتابعك رفيق ويُظهر أخطاءك` / `Recite and Rafeeq follows along and shows your mistakes`
  - note button `عرض الاشتراك` / `View subscription`
  - page title `رفيق برو` / `Rafeeq Pro`
  - page pitch `اشترك لتستمتع بالتسميع مع التصحيح` / `Subscribe to enjoy reciting with correction`
  - three points: `سمّع وتتبّع القراءة كلمة بكلمة` / `Recite and follow along word by word`; `كشف الأخطاء والكلمات الناقصة` / `Mistakes and skipped words shown`; `التسميع في الاختبارات` / `Recite in the quizzes`
  - Subscribe `اشترك الآن` / `Subscribe now`
  - Restore `استعادة المشتريات` / `Restore purchases`
  - badge text `PRO`
- Visual rules (CLAUDE.md / memory):
  - green `#0f7a5a` (`--color-quran`) only as fills; gold (`--color-gold`) for text and borders;
  - page width `var(--max-width-mobile, 600px)` with `margin: 0 auto`;
  - no visible scrollbars;
  - if `BottomNavBar fixed` is shown, `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`.
- Invoke the frontend-design skill before writing the subscribe page and the note's CSS.

**Process**
- Test command: `CI=true npx react-scripts test --watchAll=false --testPathPattern <pattern>`. Typecheck: `npx tsc --noEmit`.
- CRA Jest has `resetMocks: true`. Set mock implementations in `beforeEach` / the test.
- Working tree is CRLF. No `// eslint-disable` comments.
- Don't run `npm run build`, `cap sync`, gradle, or a real `wrangler deploy`. `npx wrangler deploy --dry-run --outdir <scratch>` (and `--env dev --dry-run`) is allowed.

## Review Focus

1. **A subscriber opens the app offline or before RevenueCat answers.** No badge appears, because the cached `rafiq_pro_v1="1"` holds, and the cached value isn't overwritten until a real answer arrives. Test: in Task 1.
2. **A purchase finishes while the user is on `/subscribe`.** `isPro` flips immediately (from the purchase result, not only the listener), the page closes, and the mic has no badge. Test: in Task 4.
3. **The user cancels the store purchase sheet.** No error toast; the page stays open. Test: in Task 4.
4. **A lapsed subscriber starts recite after the switch is on.** The broker returns 402. The note opens, with no "mic error" toast, and `isPro` becomes false for the session. Test: in Task 3 (both the viewer and a quiz).
5. **A freshly purchased user's first recite hits a Worker that cached nothing.** It's allowed, because only Pro answers are cached. A "not Pro" answer from a minute ago must not block them. Verified in Task 6's scratch run.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/core/services/subscription/revenuecat.service.ts` | Thin wrapper over the Capacitor SDK: configure, customer info, listener, offerings, purchase, restore, app-user id, `isProFromCustomerInfo` |
| `src/app/core/context/SubscriptionContext.tsx` | Provider + `useSubscription()`: state, cache, listener, note open/close |
| `src/app/core/services/subscription/pro-gate.ts` | `isProGateOn()` (reads `REACT_APP_PRO_GATE`) |
| `src/app/features/subscription/useProGate.ts` | `useProGate()`: `locked`, `requirePro(start)`, `handleNotSubscribed()` |
| `src/app/features/subscription/ProBadge.tsx`, `ProNote.tsx`, `ProNote.css` | Badge and in-place note (rendered once by the host) |
| `src/app/features/subscription/Subscribe.tsx`, `Subscribe.css` | `/subscribe` page |
| `src/app/features/account/SubscriptionRow.tsx` | Account → Subscription row |
| `src/app/core/services/audio/stt/broker.ts` | + `setBrokerUserId`, `brokerHeaders`, `NOT_SUBSCRIBED_MESSAGE`, 402 mapping |
| `src/app/core/services/audio/stt/whisper/whisper.adapter.ts` | + headers, 402 mapping |
| `src/app/core/i18n/strings.ts` | + `subscription` section (ar + en) |
| `src/App.tsx` | provider, note host, `/subscribe` route |
| `PageViewer.tsx`, `AkmelAlAyah.tsx`, `MutashabihatTest.tsx`, `Account.tsx` | gate wiring |
| `token-broker/src/index.ts`, `wrangler.toml`, `verify-deploy.sh` | enforcement, dev env |

Tests go in `__tests__/` folders next to the code, matching the existing layout.

---

### Task 1: Subscription state, and identity for the broker

**Files:**
- Create: `src/app/core/services/subscription/revenuecat.service.ts`, `src/app/core/services/subscription/pro-gate.ts`, `src/app/core/context/SubscriptionContext.tsx`
- Modify: `src/app/core/services/audio/stt/broker.ts`, `src/app/core/services/audio/stt/whisper/whisper.adapter.ts` (`transcribeSegment` headers + 402), `src/App.tsx` (wrap `<IonApp>` in `<SubscriptionProvider>`, inside `LanguageProvider`)
- Test: `src/app/core/context/__tests__/SubscriptionContext.test.tsx`, `src/app/core/services/audio/__tests__/stt-broker.test.ts`

**Interfaces:**
- Produces:
  - `revenuecat.service.ts`:
    - `configureRevenueCat(): Promise<void>` — once; chooses the key by platform.
    - `fetchCustomerInfo(): Promise<CustomerInfo>`
    - `onCustomerInfo(cb): Promise<() => void>` — returns an unsubscribe.
    - `fetchOfferingPackages(): Promise<PurchasesPackage[]>` — `current?.availablePackages ?? []`.
    - `buyPackage(pkg): Promise<CustomerInfo>`
    - `restore(): Promise<CustomerInfo>`
    - `fetchAppUserId(): Promise<string>`
    - `isProFromCustomerInfo(info: CustomerInfo): boolean` — true when `info.entitlements.active["pro"]` is present.
    - `managementUrl(info): string | null`
    - Re-export the SDK types it uses.
  - `pro-gate.ts`: `isProGateOn(): boolean`.
  - `SubscriptionContext.tsx`:
    - `useSubscription(): { isPro: boolean; ready: boolean; appUserId: string | null; managementUrl: string | null; packages: PurchasesPackage[]; purchase(pkg: PurchasesPackage): Promise<"purchased" | "cancelled">; restore(): Promise<boolean>; markNotPro(): void; noteOpen: boolean; openNote(): void; closeNote(): void }`
    - `purchase` throws on non-cancel errors. A cancel is the SDK error with `userCancelled === true`.
    - `restore` returns the new `isPro`.
    - Both `purchase` and `restore` set `isPro` from the `CustomerInfo` they get back, and write the cache, right away. They don't wait for the listener (Review Focus 2).
    - `markNotPro` sets `isPro` false for the session only. It doesn't write the cache.
  - `broker.ts`:
    - `NOT_SUBSCRIBED_MESSAGE = "Subscription required"`
    - `setBrokerUserId(id: string | null): void`
    - `brokerHeaders(): Record<string, string>` — `{ "x-rafeeq-user": id }` when set, else `{}`.
    - `fetchBrokerKey` sends `brokerHeaders()` and maps 402 → `NOT_SUBSCRIBED_MESSAGE`.
  - `whisper.adapter.ts` `transcribeSegment`: merges `brokerHeaders()` with its existing content-type, and maps 402 → `NOT_SUBSCRIBED_MESSAGE`.
  - The provider calls `setBrokerUserId(appUserId)` once the id is known.

- [ ] **Step 1: Write the failing tests.**
  - Mock `@revenuecat/purchases-capacitor` (`Purchases` methods) and `@capacitor/core` (`Capacitor.getPlatform`), with implementations set in `beforeEach`.
  - Render a probe component that prints `useSubscription()` fields.

```ts
it("is Pro on web without configuring RevenueCat", ...)          // getPlatform "web" → isPro true, Purchases.configure not called
it("starts from the cached Pro flag on native", ...)              // localStorage rafiq_pro_v1="1", getCustomerInfo never resolves → isPro true, ready false   (Review Focus 1)
it("replaces the cache with the live answer and writes it", ...)  // cache "1", customerInfo without "pro" → isPro false, rafiq_pro_v1 === "0"
it("applies listener updates live", ...)                          // listener fires with "pro" active → isPro true
it("exposes the app-user id and hands it to the broker", ...)     // getAppUserID → "$RCAnonymousID:abc" ; brokerHeaders() → { "x-rafeeq-user": "$RCAnonymousID:abc" }
it("markNotPro flips isPro for the session without touching the cache", ...)
```
  In `stt-broker.test.ts`, with `fetch` mocked:

```ts
it("sends x-rafeeq-user when an id is set", ...)
it("maps a 402 to NOT_SUBSCRIBED_MESSAGE", ...)   // rejects with Error(NOT_SUBSCRIBED_MESSAGE)
it("keeps the 503 message", ...)
```
  Extend the existing whisper adapter test file with one test: `transcribeSegment` on a 402 rejects with `NOT_SUBSCRIBED_MESSAGE`, and the request carries the header.

- [ ] **Step 2: Run** `--testPathPattern "SubscriptionContext|stt-broker|whisper.adapter"`. Expected: FAIL (modules or exports missing).
- [ ] **Step 3: Implement.**
  - The provider holds `noteOpen` state so any screen can open the note (Task 2 renders it).
  - `isProGateOn()` is a one-liner, but it lives in its own module so tests can `jest.mock` it.
- [ ] **Step 4: Run** the same tests, the full suite once, and `npx tsc --noEmit`. Expected: all PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(pro): RevenueCat subscription state and broker identity header`

---

### Task 2: Gate building blocks — strings, badge, note, `useProGate`

**Files:**
- Create: `src/app/features/subscription/useProGate.ts`, `ProBadge.tsx`, `ProNote.tsx`, `ProNote.css`
- Modify: `src/app/core/i18n/strings.ts` (add `subscription` to `AppStrings` + ar + en), `src/App.tsx` (render `<ProNote />` once, inside `IonReactRouter` next to `MainRouterOutlet`)
- Test: `src/app/features/subscription/__tests__/useProGate.test.tsx`, `__tests__/ProNote.test.tsx`

**Interfaces:**
- Consumes: `useSubscription()`, `isProGateOn()` (Task 1); `NOT_SUBSCRIBED_MESSAGE` (Task 1).
- Produces:
  - `useProGate(): { locked: boolean; requirePro(start: () => void): void; handleNotSubscribed(message: string | null): boolean }`:
    - `locked` = `isProGateOn() && !isPro`.
    - `requirePro(start)` calls `start()` when not locked, and calls `openNote()` otherwise.
    - `handleNotSubscribed(msg)` returns `true` and does `markNotPro()` + `openNote()` when `msg === NOT_SUBSCRIBED_MESSAGE`; it returns `false` otherwise.

    The 402 path works even when the app switch is off. If the server says no, the user gets the note, not a raw error.
  - `<ProBadge />`: a small gold `PRO` pill, absolutely positioned on its parent's top corner. The parent must be `position: relative`.
  - `<ProNote />`:
    - Reads `noteOpen` / `closeNote`.
    - When open, shows a card fixed near the bottom centre of the screen, above the bottom toolbar and nav, where all three mics live.
    - Card contents: 🔒 title, the note line, and a green "View subscription" button → `history.push("/subscribe")` + `closeNote()`.
    - A tap on the dimmed backdrop closes it.
  - `strings.ts` `subscription` keys: `noteTitle, noteLine, noteCta, title, pitch, point1, point2, point3, subscribe, restore, restoreNone, purchaseFailed, legal, yearly, monthly, save, accountTitle, accountActive, accountFree, manage, view, supportId, copied`.
    - Arabic and English values for the first eleven keys come from Global Constraints.
    - The rest are the builder's wording. `legal` = "auto-renews; cancel anytime in the store" in both languages.

- [ ] **Step 1: Write the failing tests.**
  - Mock `../../core/services/subscription/pro-gate`, and use a test `SubscriptionContext` value or a wrapper that injects one.

```ts
it("is not locked when the switch is off, even for non-Pro", ...)         // isProGateOn false, isPro false → requirePro calls start
it("opens the note instead of starting when locked", ...)                  // switch on, isPro false → start not called, openNote called
it("starts for Pro users with the switch on", ...)
it("turns a not-subscribed error into the note", ...)                     // handleNotSubscribed(NOT_SUBSCRIBED_MESSAGE) → true, markNotPro + openNote called
it("ignores other errors", ...)                                            // handleNotSubscribed("Recording error") → false
// ProNote
it("renders nothing when closed and the Arabic copy when open", ...)
it("navigates to /subscribe and closes", ...)                             // MemoryRouter; click CTA → location /subscribe, closeNote called
```
- [ ] **Step 2: Run** `--testPathPattern "useProGate|ProNote"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Invoke the frontend-design skill first, for the badge and note CSS, within Global Constraints' visual rules.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pro): PRO badge, subscriber note and recite gate hook`

---

### Task 3: Wire the gate into the three recite surfaces

**Files:**
- Modify: `src/app/features/viewer/PageViewer.tsx`
  - `handlePlayPressEnd` ~L215-230: the `recite.startRecording()` branch only.
  - the mic button ~L983-1007: badge when `reciteMode && locked`.
  - the micError toast effect ~L190-199.
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx`
  - `handleReciteToggle` ~L259: the start branch only.
  - the mic button ~L536: badge when `locked && !recite.isArmed`.
  - the micError effect ~L317.
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx` (the same three spots, ~L231 / ~L567 / its micError effect).
- Test: `src/app/features/subscription/__tests__/gate-wiring.test.tsx` (or per-page tests if the pages already have harnesses; check `__tests__` next to each page first).

**Interfaces:**
- Consumes: `useProGate()`, `<ProBadge />` (Task 2); `NOT_SUBSCRIBED_MESSAGE` (Task 1).
- Pattern:
  - Wrap only the start call, e.g. `requirePro(() => recite.startRecording())`.
  - In each micError effect, `if (handleNotSubscribed(recite.micError)) return;` comes before the existing toast.
  - The mic buttons get `position: relative` if needed for the badge.

- [ ] **Step 1: Write the failing tests.**
  - If a full page render is too heavy, test through the smallest seam the pages allow. For example, extract nothing, but render the page with `useReciteMode` / `useQuizRecite` mocked to return spy functions, and `useProGate` mocked.

```ts
it("viewer: a locked tap on the armed mic opens the note and does not start recording", ...)
it("viewer: stopping a running session is never gated", ...)               // recite.status "recording", locked → stopRecording called
it("viewer: no PRO badge on the play button before recite mode is armed", ...)
it("Akmel al-Ayah: locked start opens the note; stop is not gated", ...)
it("Mutashabihat: locked start opens the note; stop is not gated", ...)
it("viewer + one quiz: a not-subscribed micError opens the note and shows no toast", ...)   // Review Focus 4
```
- [ ] **Step 2: Run** `--testPathPattern gate-wiring` (or the page tests). Expected: FAIL.
- [ ] **Step 3: Implement.** Make the minimal edits at the named spots. Change no other logic in these files.
- [ ] **Step 4: Run** the tests, the full suite once, and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pro): gate starting recite in the viewer and both quizzes`

---

### Task 4: The `/subscribe` page

**Files:**
- Create: `src/app/features/subscription/Subscribe.tsx`, `Subscribe.css`
- Modify: `src/App.tsx` (`<Route exact path="/subscribe" component={Subscribe} />`)
- Test: `src/app/features/subscription/__tests__/Subscribe.test.tsx`

**Interfaces:**
- Consumes: `useSubscription()` (Task 1): `packages`, `purchase`, `restore`, `isPro`. Uses strings from Task 2.
- Behaviour:
  - **Layout:** ✕ (`history.goBack()`, or `/` when there's no history), the mic icon, the title, the pitch and three ✓ points.
  - **Package cards:** one per package. Label by `packageType` (`ANNUAL` → yearly, `MONTHLY` → monthly, otherwise `product.title`). Show `product.priceString`. Yearly is preselected. Show a "save" tag on yearly only when `annual.product.price / 12 < monthly.product.price`.
  - **Buttons and small print:** a green Subscribe button, a Restore link, and the `legal` small print.
  - **Purchase:**
    - `"purchased"` → close (goBack).
    - `"cancelled"` → nothing.
    - A throw → toast `purchaseFailed`.
  - **Restore:** true → close; false → toast `restoreNone`.
  - **No packages:** with no packages (e.g. on web or before setup), the plan cards are replaced by a muted line and Subscribe is disabled.

- [ ] **Step 1: Write the failing tests** with a mocked `useSubscription`.

```ts
it("lists packages with store price strings and preselects yearly", ...)
it("shows the save tag only when yearly is cheaper per month", ...)
it("closes after a successful purchase", ...)                  // Review Focus 2
it("stays open with no toast when the purchase is cancelled", ...)   // Review Focus 3
it("toasts on a failed purchase", ...)
it("closes after a restore that finds Pro, and toasts when it finds nothing", ...)
it("disables Subscribe when there are no packages", ...)
```
- [ ] **Step 2: Run** `--testPathPattern Subscribe`. Expected: FAIL.
- [ ] **Step 3: Implement.** Invoke the frontend-design skill first. Follow the mockup ("Full page" in the brainstorm) and the Global Constraints visual rules. The bottom nav is the builder's call, with its padding rule if shown.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pro): Rafeeq Pro subscribe page`

---

### Task 5: Account → Subscription row

**Files:**
- Create: `src/app/features/account/SubscriptionRow.tsx` (styles in `Account.css`, matching existing rows)
- Modify: `src/app/features/account/Account.tsx` (render the row in the page's existing card list)
- Test: `src/app/features/account/__tests__/SubscriptionRow.test.tsx`

**Interfaces:**
- Consumes: `useSubscription()`: `isPro`, `managementUrl`, `restore`, `appUserId`.
- Behaviour:
  - **Pro:** `accountActive` + a "Manage subscription" button. It opens `managementUrl` with `window.open(url, "_system")`, and is hidden when the URL is null.
  - **Free:** `accountFree` + "View subscription" (`/subscribe`) + "Restore purchases" (toast `restoreNone` when nothing was found).
  - **Support ID:** shown always on native when `appUserId` is set, in a shortened form (the last 8 chars). The copy button copies the **full** id with `navigator.clipboard.writeText`, then toasts `copied`.
  - The row works regardless of `REACT_APP_PRO_GATE`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("shows active + Manage for Pro and opens the management URL", ...)
it("shows Free + View subscription + Restore for non-Pro", ...)
it("copies the full app-user id", ...)                 // clipboard.writeText called with the full id
it("hides Support ID when there is no app-user id", ...)
```
- [ ] **Step 2: Run** `--testPathPattern SubscriptionRow`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, the full suite once, and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pro): subscription status, manage and support id in Account`

---

### Task 6: Server enforcement, the dev Worker, and release notes

**Files:**
- Modify: `token-broker/src/index.ts`, `token-broker/wrangler.toml`, `token-broker/verify-deploy.sh`
- Modify: `PLAY-CONSOLE-PREP.md` (Data safety: purchase history → RevenueCat / Google; release order)
- Create: `.env.example` entries, or add them if the file exists (it doesn't today): `REACT_APP_REVENUECAT_ANDROID_KEY=`, `REACT_APP_REVENUECAT_IOS_KEY=`, `REACT_APP_PRO_GATE=off`, plus a comment that `.env.development.local` should hold the dev broker URL.

**Interfaces:**
- Worker `Env` gains `REQUIRE_PRO?: string; REVENUECAT_SECRET_KEY?: string`.
- `requirePro(req, env): Promise<Response | null>`:
  - returns null when allowed, or a 402 `Response` (JSON body from Global Constraints, CORS headers included);
  - called first in the `/deepgram/token`, `/soniox/token` and `/whisper/transcribe` handlers;
  - no-op unless `env.REQUIRE_PRO === "true"`.
- A pure helper `isProSubscriber(body: unknown, nowMs: number): boolean`.
- Cache: Pro answers only, 5 minutes.
  - Use an in-isolate `Map<id, expiresAtMs>`, plus the Workers Cache API keyed by a synthetic URL `https://rc-cache.internal/{id}`.
  - Using only the Map is acceptable if the Cache API complicates the dry run; record which one was used.
- CORS `access-control-allow-headers` becomes `"content-type, x-rafeeq-user"`.
- **`wrangler.toml`:**
  - `[vars] REQUIRE_PRO = "false"`.
  - `[env.dev]` with `name = "rafeeq-token-broker-dev"`, `[env.dev.vars] REQUIRE_PRO = "false"`, and `[env.dev.ai] binding = "AI"` (bindings aren't inherited by environments).
  - Comments: the dev Worker needs its own secrets (`wrangler secret put <NAME> --env dev`) and `ALLOWED_ORIGIN` including `http://localhost:3000`.
  - Release order: ship the app build with `REACT_APP_PRO_GATE=on` first, then set `REQUIRE_PRO="true"` and deploy.
  - Add `wrangler secret put REVENUECAT_SECRET_KEY` to the header's secret list in `index.ts`.

- [ ] **Step 1: Implement** `isProSubscriber`, `requirePro`, the route calls, CORS, the cache, and the toml changes.
- [ ] **Step 2: Verify with a scratch run** of the bundled Worker, outside the repo, the same way the engine-picker fix wave did. Mock `fetch` to RevenueCat and check all of these:
  - the switch off → unchanged (Deepgram route reaches its upstream);
  - on + no header → 402 with the exact body;
  - on + non-Pro → 402;
  - on + Pro → passes;
  - on + Pro with `expires_date: null` → passes;
  - on + expired → 402;
  - on + RevenueCat 500 → passes (fail open);
  - a non-Pro answer followed by Pro for the same id within 5 minutes → the second request passes (Review Focus 5);
  - an OPTIONS preflight lists `x-rafeeq-user`.

  Record the outputs.
- [ ] **Step 3: Run** `npx wrangler deploy --dry-run --outdir <scratch>` and `npx wrangler deploy --env dev --dry-run --outdir <scratch2>` from `token-broker/`. Expected: both bundle; the dev bundle lists the AI binding.
- [ ] **Step 4: Extend `verify-deploy.sh`.**
  - New check: POST `/deepgram/token` with no `x-rafeeq-user`. Report `PASS (enforcement on)` on 402 with `not_subscribed`, or `INFO (enforcement off)` on 200. Don't fail either way, since the switch is the owner's.
  - Add a usage note on `BROKER_URL=<dev url>` for the dev Worker.
  - Run `bash -n token-broker/verify-deploy.sh`.
- [ ] **Step 5: Docs.**
  - `PLAY-CONSOLE-PREP.md` Data safety: "Purchase history — collected, shared with Google Play / RevenueCat, for app functionality (subscription)".
  - Add the owner setup and release-order steps from the spec, including iPhone's `npx cap add ios` / `NSMicrophoneUsageDescription` / App Store products as future owner steps.
- [ ] **Step 6: Final check.** Run the full suite and `npx tsc --noEmit`. Expected: all green.
- [ ] **Step 7: Commit** `feat(token-broker): enforce Rafeeq Pro behind REQUIRE_PRO, dev Worker env`
