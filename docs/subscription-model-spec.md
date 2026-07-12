# Subscription Model — Implementation Spec

Branch: `subscription-model`
Status: **SPEC — awaiting review before implementation**
Date: 2026-07-12

---

## 1. Goal

Gate **recite mode** (in the Quran viewer and in both quizzes) behind a paid
subscription, using a **general, reusable Pro-tier entitlement system** so any
future feature can be gated with one line.

Decisions locked in with the user:

| Decision | Choice |
|---|---|
| Billing rail | **RevenueCat** (App Store IAP + Play Billing) |
| Launch platforms | **iOS + Android** |
| Scope | **General Pro tier** (reusable `useEntitlements` + `<ProGate>`) |
| Web / Electron behavior | **Free / unlocked** (no IAP there; paywall only on iOS/Android) |

---

## 2. Why RevenueCat (the core constraint)

The app has **no backend of its own**. Auth and user data (streaks, notes,
goals) are all a client of **Quran Foundation's** platform:
- `src/app/core/services/auth/oauth.service.ts` — QF OAuth2 (login, tokens)
- `src/app/core/services/api/user-api.client.ts` — QF user API
- The Cloudflare token-broker only brokers OAuth tokens; it holds no DB.

A subscription needs a **trusted server** to (a) verify the payment and
(b) answer "is this user entitled right now?". We can't put that in the React
client (editable) and we don't own QF's servers. **RevenueCat's servers become
our entitlement source of truth** — they verify StoreKit/Play receipts
server-side and expose a single "is user Pro?" answer. The client `isPro` flag
is only a cache of that verified answer, so tampering with it is meaningless:
the gated capability (the actual purchase) already happened server-side.

---

## 3. Identity link (critical)

We already have a stable cross-device user id: the QF OAuth **`sub`** claim,
decoded in `oauth.service.ts` (`getUserProfileFromIdTokenAsync().sub`).

- On login / app start with a session → `Purchases.logIn(sub)`
- On logout → `Purchases.logOut()`

This makes the subscription **follow the QF account across devices** (buy on
Android → active on iOS after logging into the same account) instead of being
tied to one device/anonymous id.

Anonymous (not-signed-in) users still get an anonymous RevenueCat id and can
purchase; when they later sign in, `logIn(sub)` aliases/transfers the purchase
to their account (RevenueCat handles the alias).

---

## 4. New files

```
src/app/core/services/subscription/
  revenuecat.service.ts        # thin SDK wrapper, native-only guards

src/app/core/context/
  EntitlementContext.tsx       # provider + useEntitlements() hook

src/app/features/subscription/
  ProGate.tsx                  # <ProGate feature="recite"> wrapper
  Paywall.tsx                  # bottom-sheet paywall modal (reuses AccountModal style)
  Paywall.css
```

### 4.1 `revenuecat.service.ts`

Wraps `@revenuecat/purchases-capacitor`. All methods no-op / return "free-open"
on web + Electron (`Capacitor.getPlatform()` not in `["ios","android"]`).

```ts
const PRO_ENTITLEMENT = "pro";           // must match RevenueCat dashboard id
export const IAP_SUPPORTED = ["ios","android"].includes(Capacitor.getPlatform());

initialize(): Promise<void>              // Purchases.configure({ apiKey })  (once)
identify(sub: string): Promise<void>     // Purchases.logIn(sub)
logout(): Promise<void>                  // Purchases.logOut()
isPro(): Promise<boolean>                // getCustomerInfo → entitlements.active[PRO] != null
getOfferings(): Promise<Package[]>       // getOfferings().current.availablePackages
purchase(pkg): Promise<boolean>          // purchasePackage(pkg) → returns new isPro
restore(): Promise<boolean>              // restorePurchases() → returns isPro
addCustomerInfoListener(cb)              // live updates on renew/expire
```

- API keys from env: `REACT_APP_REVENUECAT_IOS_KEY`, `REACT_APP_REVENUECAT_ANDROID_KEY`
  (publishable public keys — safe in the client, sit alongside existing `REACT_APP_*`).
- On web/Electron: `IAP_SUPPORTED === false` → `isPro()` resolves per the
  "web/Electron = free/unlocked" decision (returns `true` = unlocked).

### 4.2 `EntitlementContext.tsx`

Mirrors the existing `PlaybackContext` / `VerseVisibilityContext` pattern.

```ts
interface EntitlementState {
  isPro: boolean;
  loading: boolean;
  refresh(): Promise<void>;
  openPaywall(): void;      // triggers the Paywall modal
}
export function useEntitlements(): EntitlementState
```

Responsibilities:
- On mount: `initialize()`, then if a QF session exists `identify(sub)`, then
  read `isPro()`.
- Subscribe to `addCustomerInfoListener` → update `isPro` live on renew/expire.
- Re-identify on auth change: listen to the **same `storage` event** that
  `Account.tsx` already uses for auth-state changes, and call `identify(sub)`
  / `logout()` accordingly.
- Owns the Paywall modal open/close state so any component can call
  `openPaywall()`.

Provider mounted high in the tree (next to the other context providers — check
`App.tsx` / the root where `PlaybackContext` is provided).

### 4.3 `ProGate.tsx`

```tsx
<ProGate feature="recite">
  <ReciteButton />
</ProGate>
```
- If `isPro` → render children.
- Else → render `fallback` (or a default locked chip) whose onClick calls
  `openPaywall()`. `feature` prop is passed to the paywall for analytics/copy.

### 4.4 `Paywall.tsx`

- Reuses `AccountModal` bottom-sheet styling for visual consistency.
- Lists packages from `getOfferings()`; each → `purchase(pkg)`.
- "Restore purchases" button → `restore()`.
- On success → close + `refresh()`.
- i18n strings added to `src/app/core/i18n/strings.ts` (Arabic + Latin, matching
  the existing dual-label convention).

---

## 5. Gate wiring (the 3 recite entry points)

Each is a single clean choke point. Pattern: intercept the toggle; if not Pro,
open the paywall instead of arming recite.

| File | Handler | Line (approx) |
|---|---|---|
| `src/app/features/viewer/PageViewer.tsx` | `handleReciteToggle` (`next = !reciteMode`) | ~178 |
| `src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx` | `handleReciteToggle` | ~225 |
| `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx` | `handleReciteToggle` | ~197 |

Edit inside each handler:
```ts
const { isPro, openPaywall } = useEntitlements();
const handleReciteToggle = useCallback(() => {
  if (!isPro) { openPaywall(); return; }   // ← gate
  /* ...existing arm/disarm logic unchanged... */
}, [/* + isPro, openPaywall */]);
```
The recite hooks (`useReciteMode`, `useQuizRecite`) and all downstream STT
logic are untouched — the gate sits entirely at the UI toggle.

---

## 6. How to add future Pro features

| Pattern | When | Example |
|---|---|---|
| `<ProGate feature="x">` | lock a UI block | hide advanced stats card |
| `if (!isPro){openPaywall();return;}` | guard an action | block an export tap |
| `useEntitlements()` in logic | conditional behavior | free: 3 quizzes/day; pro: ∞ |

Tiered plans later: define more entitlements in RevenueCat (`pro`, `pro_plus`)
and expose `has("pro_plus")` from the hook — gate mechanism unchanged.

---

## 7. Out-of-code prerequisites (user must do; blocks testing)

1. RevenueCat account → create **entitlement `pro`** + an **offering** with packages.
2. Create subscription products in **App Store Connect** + **Google Play Console**
   and link them in RevenueCat.
3. Provide **RevenueCat public API keys** (iOS + Android) for `.env`.
4. `npm install @revenuecat/purchases-capacitor && npx cap sync`
   (user builds — per project convention, Claude does not run build/sync).

Until 1–4 are done, the code compiles and web/Electron run (unlocked), but the
paywall/purchase can only be exercised on a real iOS/Android build.

---

## 8. Open questions / assumptions

- **Entitlement id** assumed `"pro"` — confirm the exact id when the RevenueCat
  dashboard is set up.
- **Paywall design**: default to reusing `AccountModal` sheet style; a bespoke
  design can be layered later (invoke frontend-design skill at that point).
- **Free trial / intro pricing**: configured in the stores + RevenueCat, no code
  change needed.
```
