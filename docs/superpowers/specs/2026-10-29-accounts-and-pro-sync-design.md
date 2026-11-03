# Accounts, Pro-on-an-account and Pro Sync — Design

Date: 2026-10-29
Branch: to be created from `main`
Status: design — awaiting approval
Builds on: `2026-10-20-subscription-pro-design.md` (Rafeeq Pro via RevenueCat,
merged in PR #65). Reverses part of the August 2026 decision to have no
sign-in at all (see "Local-only user data" in `PLAY-CONSOLE-PREP.md` §4).

## Why

Rafeeq Pro (recite mode) currently belongs to an **anonymous RevenueCat id**.
"Restore purchases" can bring it back on the same store account, but it
can't follow a person to another platform (Android ↔ iPhone), and the
token broker trusts an unauthenticated `x-rafeeq-user` header, so a copied
Support ID unlocks paid speech minutes for anyone.

The owner wants:

1. **Pro always tied to a real account.** You sign in before you subscribe.
2. **Pro subscribers' data synced to that account.** This replaces the
   manual JSON backup as their way to move between devices.
3. **Everything Google Play and the App Store require** once accounts
   exist, done properly, so neither store rejects the app.

Pro has **not launched**: both switches (`REACT_APP_PRO_GATE`,
`REQUIRE_PRO`) are off and nothing is deployed. Nobody holds an anonymous
subscription today, so **no existing subscribers need migrating**.

## Goals

### Part 1 — Accounts, Pro on the account, store compliance

1. **Sign-in providers:** Google and **Sign in with Apple, on both
   platforms**. Nothing else: no email/password. (Owner's decision.)
   - Google: native account sheet on Android and iOS.
   - Apple: native sheet on iOS. On Android, Apple's web sign-in in a
     browser window (Apple has no native Android sheet). This way an
     account made on iPhone with Apple, including Hide My Email, can always
     be opened on Android, so Pro and synced data follow the person.
   - Apple on Android needs the Apple developer setup, so until that
     exists the Android build shows Google only, with Apple added by config
     and no code change.
   - Linking several sign-in methods to one account is not needed.
2. **The free app never needs an account.** Reading, quizzes, Hifz, prayer
   times, tracker, backup file: all work signed out, exactly as today.
3. **Pro requires an account.** Flow from the recite mic:
   1. PRO badge → the existing short note ("Recite is for subscribers").
   2. "View subscription" → if signed out, a **sign-in step** (Google, or
      Google + Apple on iOS) comes first.
   3. Then the RevenueCat Paywall opens, already linked to the account.
   The same applies to the Account → Subscription "View" row.
4. **RevenueCat identity = the account id.** After sign-in the app calls
   RevenueCat `logIn(<account user id>)`; on sign-out, `logOut()`. On
   launch, a signed-in person's RevenueCat is configured with their account
   id from the start (no anonymous id flash).
5. **The token broker verifies a real sign-in token.** The app sends the
   account's access token (`Authorization: Bearer …`) on speech requests.
   The broker verifies it and uses the token's user id as the RevenueCat
   app-user id for the Pro check. `x-rafeeq-user` is removed. This closes
   the known Support-ID reuse gap.
6. **Account section on the Account page:**
   - Signed out: "Sign in" row (explains it's needed for Pro and sync).
   - Signed in: who is signed in (name/email, provider), "Sign out",
     "Delete account". The Subscription rows stay (Manage / View /
     Restore). The Support ID becomes the account id (still copyable, the
     owner uses it to grant promo Pro).
7. **Account deletion, fully:**
   - In-app "Delete account" with a clear confirm. It warns that deleting
     the account does **not** cancel a store subscription, and links to
     Manage/Customer Center first if they're subscribed (Apple requires
     telling users this).
   - Server-side deletion of everything: the auth user, all synced data,
     and the RevenueCat customer record.
   - **Sign in with Apple token revocation** (Apple's REST
     `/auth/revoke`) for Apple accounts. Designed and built server-side
     now; exercised when the iOS app exists.
   - After deletion the phone signs out. **Local data stays on the phone**
     (it's theirs; it becomes ordinary free-user local data). *(My call.)*
   - A **public account-deletion web page** (AR + EN) for Play, hosted
     next to the privacy policy on the `gh-pages` branch. It explains the
     in-app path and gives an email route (the policy's contact address)
     for people who already uninstalled. For those email requests, the
     owner runs a small script that calls the same server-side deletion by
     user id or email, plus a short runbook in `PLAY-CONSOLE-PREP.md`.
     *(My call.)*
8. **Ships dark behind a switch.** A build-time switch
   `REACT_APP_ACCOUNTS=on` (default off) hides all sign-in UI. *(My call.)*
   The reason: the moment a build lets someone create an account, the
   store obligations apply. So the code can merge before the deletion page,
   privacy policy and Data safety answers are live. Release order goes in
   `PLAY-CONSOLE-PREP.md`.
   **Pro never launches without accounts** (follows from "Pro should
   always be with an account"):
   - The Pro gate only takes effect when the accounts switch is on.
   - The anonymous purchase path and `x-rafeeq-user` are deleted, so the
     broker accepts only the token.
   - Release order: accounts + compliance live → Pro gate on →
     `REQUIRE_PRO="true"`.

### Part 2 — Pro Sync

9. **Who syncs:** signed in **and** Pro. Free signed-in users don't sync.
   (Owner's decision.)
10. **What syncs: everything the backup file carries.** That's user
    content, Hifz and streaks, recitation history, worship tracker, azkar
    favourites, quiz range sets, **and app settings** (theme, language,
    last page, search recents, tafsir choices, `rafiq_settings_v1`). The
    owner confirmed settings sync too. The `BACKED_UP_KEYS` list in
    `backup.service.ts` (plus quiz presets in Capacitor Preferences and the
    native/IndexedDB Hifz stores) is the starting inventory. Content caches
    never sync.
11. **First sign-in on a device merges**, never replaces: local data and
    the account's data are combined so nothing is lost. (Owner's decision.)
12. **Everyday merge rules** *(my call; user can override)*:
    - **Items with ids** (notes, bookmarks, hidden verses, azkar
      favourites, quiz range sets, recitation history entries, tracker
      days): per-item, **most recent edit wins**. **A delete on one device
      deletes everywhere** (deletes are recorded, not just absent).
    - **Day sets** (Hifz streak dates, quiz streak days, tracker "active"
      days): **union**. A day is never lost through sync.
    - **Hifz plans hold progress** (`sessions[]` with `done`/`doneDate`),
      so they do not simply win whole *(my call)*:
      - Same plan on both devices (same `createdAt`): sessions merge one by
        one, and **done-ness is never undone by sync**. Other plan fields
        follow the most recent edit.
      - Different plans (first sign-in, each device had its own): the more
        recently active plan becomes current. The other is **kept, not
        dropped**: archived in the cloud and recoverable, never silently
        destroyed.
    - **Single objects** (best/latest plan, reading session, each settings
      key, theme, language, last page): the most recently updated copy wins
      as a whole.
    - **Counters with rules** (Hifz freeze tokens, session counts, freeze
      state): must never lose progress **and never mint extra freezes**
      through merging. The exact rule is left to the builder, documented
      in the plan.
13. **When sync runs:** on sign-in (first merge), on app launch/resume, and
    shortly after local changes (debounced). Offline, changes queue and go
    up later; the app never blocks or slows on sync.
14. **When Pro ends:** syncing stops; the cloud copy is **kept** so it's
    waiting if they resubscribe (then a normal merge). It's deleted only by
    Delete account. (Owner's decision.)
15. **Signing out:** data stays on the phone as local data; sync stops.
    Signing into a different account on that phone later merges that local
    data into the new account, same as a fresh phone. *(My call.)*
16. **Account page shows sync status** for Pro users ("Synced · 2 min
    ago", "Waiting for connection", error). The **Backup file stays for
    everyone** as a fallback. On a **synced** device, importing a file
    **adds and overwrites only; it never records deletes** *(my call)*. An
    old backup can't wipe newer notes from the cloud and every other
    device. Items missing from the file stay. The import confirm says so
    on synced devices. Signed-out/free devices keep today's
    replace behaviour.

## Non-goals

- Email/password sign-in; linking several sign-in methods to one account.
- Sync for free users.
- Live, real-time sync between two open devices (sync on the triggers above
  is enough).
- Building the iOS app (`ios/` needs a Mac). Part 1 is built so iOS only
  needs `cap add ios`, the native Apple sign-in config and store setup.
- Server-side enforcement of "Pro only" for sync. In v1 the app decides
  whether to sync; the database only enforces "your own rows". A server
  check (e.g. a RevenueCat webhook writing a Pro-until date that row
  security checks) is a later option. *(My call; known limit.)*
- Recovering notes from the old (deleted) Quran Foundation account.
- Production web sign-in. Web is a development target; sign-in on web may
  use the provider's redirect flow for testing only.

## Anti-goals (failure even if it "works")

- Any merge or sync bug that **loses a user's notes, Hifz progress or
  streak days**.
- Login becoming a wall in front of free features.
- A build that can create accounts reaching the store **before** the
  deletion page, privacy policy, terms and Data safety answers are live.
- Sign-in or sync making the app slower to open, or broken offline.
- Showing a person's email anywhere other than their own Account page.

## Constraints

- **Stack:** React + Ionic + Capacitor 8, CRA (react-scripts), Jest 27.
  Token broker = Cloudflare Worker (`token-broker/`). Android only today.
- **Backend: Supabase** (owner agreed after the pricing check). Supabase
  Auth for Google/Apple, Postgres with row-level security for sync, an Edge
  Function for account deletion.
  - Launch on the **Free plan**. It has 50k MAU and 500 MB DB, and pauses
    after 7 idle days, which only affects the dev project. It has **no
    backups**: move production to **Pro (~$25/mo)** before real
    subscribers' data accumulates. Re-check limits on supabase.com/pricing.
  - Two projects: dev and production.
- **Native sign-in wherever the platform has it.** It uses the system
  Google account sheet, and the native Apple sheet on iOS, yielding an ID
  token handed to Supabase (`signInWithIdToken`). Apple on Android is the
  one browser flow. It returns to the app via a deep link, and the
  `com.rafeeq.quranquiz` intent-filter and the `appUrlOpen` handler from
  commit `d1aba6f` are the reference. Needs a Capacitor
  plugin that supports Capacitor 8. The choice is left to the builder, and
  **the owner approves any new dependency** (as with RevenueCat).
  `npm install` on this machine needs `$env:ComSpec` set first.
- **Hifz data lives in native storage** (Android filesystem; IndexedDB on
  web/iOS). Sync must read and write it through `hifz.service.ts`'s async
  loaders and savers, as `backup.service.ts` does.
- **RevenueCat:** entitlement `com_rafeeq_quranquiz_pro`; SDK + UI pinned
  together (13.7.x). The dashboard's **restore/transfer behaviour** must be
  set so a purchase stays with the account that bought it. A different
  account on the same store account must not silently take it over. The
  exact dashboard option is to be verified by the builder; the owner sets
  it.
- **Broker:** CORS must allow `authorization`. Verifying Supabase tokens in
  the Worker must not add a network round-trip per request beyond today's
  (cached keys). The unused `/oauth2/token` route and its QF user-token
  plumbing can be removed.
- **Project rules (CLAUDE.md):** no visible scrollbars; no eslint-disable
  comments; page width via `var(--max-width-mobile, 600px)`; bottom padding
  for the fixed BottomNavBar; Arabic + English strings for every new piece
  of UI; green only as fills, gold for text/borders (unified controls).
- **Owner builds the app** (no `npm run build` / `cap sync` / gradle by
  default).

## Store compliance checklist (must all be true before accounts go live)

**Google Play**
- In-app account deletion (Goal 7) and the public deletion URL entered in
  Play Console → Data safety → Data deletion.
- Data safety form redone: Personal info → Name, Email, User IDs (account
  management); App activity → user-generated content (notes, synced) and
  app interactions (Hifz/tracker); Purchase history (already planned). All
  "encrypted in transit"; "users can request deletion" = yes.
- App access section: reviewer instructions plus a test Google account
  with promotional Pro granted in RevenueCat.
- `PLAY-CONSOLE-PREP.md` §1, §2, §4 and §9 rewritten to match.

**Apple (when iOS ships)**
- 4.8: Sign in with Apple offered alongside Google.
- 5.1.1(v): in-app deletion + Apple token revocation.
- Review notes explaining that Pro is account-based (synced across devices)
  and the free app needs no login.
- Privacy nutrition labels matching the Play answers.

**Both**
- `privacy.html` / `privacy-ar.html` / `terms*.html` on `gh-pages` and the
  in-app `PRIVACY_SECTIONS` mirror updated. They must name Supabase
  (storage location/region, retention until deletion), Google/Apple
  sign-in, what syncs, and how to delete. The current "no account
  required" section changes to "no account required for the free app".

## Owner setup (outside the code)

- Supabase: dev + prod projects (choose region), Google provider, and Apple
  provider later.
- Google Cloud: OAuth client IDs (web + Android). The Android client needs
  SHA-1s for the debug key **and** Play App Signing's key.
- Apple (later): Services ID / key for Sign in with Apple, plus the key
  for token revocation.
- RevenueCat: transfer behaviour (above); a promo-Pro test account for
  store reviewers.
- Broker secrets/vars for Supabase token verification (prod + `--env dev`).
- Host the deletion page; update the legal pages; redo Data safety.

## Left to the builder

- Database schema. A single generic "synced items" table (user, collection,
  item key, value, updated-at, deleted flag) is one obvious shape; anything
  that satisfies the merge rules with row-level security is fine.
- How local changes get timestamps and delete markers. Many local stores
  have no `updatedAt` today, so a small local change ledger or similar is
  needed.
- The sign-in plugin, session storage on native, and the exact
  freeze/counter merge rule.
- How the deletion Edge Function and the broker share secrets, and the
  exact Apple revocation mechanics (e.g. re-authenticating with Apple at
  delete time to get a fresh authorization code).
- Splitting into plans: Part 1 then Part 2, each shippable on its own.
