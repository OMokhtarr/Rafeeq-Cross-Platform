# Accounts Part 2 — Pro Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in Pro subscribers' data (everything the backup file carries, including settings) syncs to their Supabase account: it merges on first sign-in, follows the per-kind merge rules, works offline-first, and stays in the cloud when Pro lapses.

**Architecture:**
- **Server:** one Postgres table `sync_items` holds a row per synced item: `(user_id, collection, item_key, value jsonb, edited_at, deleted, server_at)`. Row-level security limits it to the owner. A `sync_push` RPC enforces last-write-wins server-side, and a trigger stamps `server_at`, which is the pull cursor.
- **Client stores:** the client does **not** touch the dozens of existing writers. A thin adapter per store turns each local store into a keyed item map. Local edits are detected two ways:
  - by diffing against a per-user snapshot of the last synced state;
  - by a one-time hook on `localStorage.setItem/removeItem`, which stamps each edit time and schedules a debounced sync.
- **Merging and status:** pure merge functions implement the spec's rules. A `SyncProvider` runs sync on these triggers and exposes the status:
  - sign-in plus Pro
  - launch
  - resume
  - coming back online
  - shortly after a local write

**Tech Stack:** React + Ionic + Capacitor 8 (CRA / Jest 27), `@supabase/supabase-js` v2 (already installed), Supabase Postgres + RLS, Capacitor Preferences (quiz presets), the existing Hifz async stores.

**Spec:** `docs/superpowers/specs/2026-10-29-accounts-and-pro-sync-design.md`. Part 2 is Goals 9–16. Part 1, whose plan is `docs/superpowers/plans/2026-10-29-accounts-part1.md`, is built on this branch.

## Global Constraints

- **Who syncs:** sync runs only when `useAuth().enabled && user && useSubscription().isPro`. Free users and signed-out devices never sync. Pro-only is enforced in the app only; the database enforces "own rows" only (spec non-goal).
- **What syncs:** everything `BACKED_UP_KEYS` in `src/app/core/services/storage/backup.service.ts` lists, plus quiz presets (`PRESETS_KEY`, Capacitor Preferences) and `rafeeq.tracker.weights`. Never sync these:
  - `rafiq_pro_v1`, `rafiq_account_v1`, `rafiq_onboarding_v1`, `rafiq_downloaded_tafsirs_v1`
  - content caches
  - sync's own state
- **First sync for a user on a device merges and never replaces.** A user's first sync on a device, after sign-in, an account switch, or a backup import, must not delete anything locally or remotely.
- **Merge rules** (spec Goal 12, verbatim intent):
  - **Items with ids:** the most recent edit wins per item, and deletes propagate.
  - **Day sets:** union, never removed.
  - **Single objects:** the most recent edit wins whole.
  - **Hifz plans:** sessions merge one by one, and done-ness is never undone. A different plan is archived, not dropped.
  - **Freeze/counter state:** never lose progress, and never mint extra freezes.
- **When Pro ends:** sync stops and the cloud data is kept. It is deleted only by Delete account; `sync_items` cascades from `auth.users`.
- **Backup import on a synced device adds and overwrites only; it never records deletes.**
- **Offline:** the app never blocks or slows on sync. Failures leave local data untouched and retry on the next trigger.
- **Strings:** every new string has Arabic and English in `src/app/core/i18n/strings.ts`.
- **CLAUDE.md CSS rules:** no visible scrollbars and no eslint-disable comments. Green only as fills; gold for text and borders.
- **No new npm dependencies.**
- **Testing:**
  - App tests: `CI=true npx react-scripts test --watchAll=false <pattern>`. Jest 27, so there is no `advanceTimersByTimeAsync`. `resetMocks` is on.
  - Load `supabase:supabase-postgres-best-practices` before writing the migration.
- **The owner builds the app.** Don't run build, cap sync or gradle. Commit; never push.

## Review Focus

1. **The same note edited offline on two phones, then both sync:** one copy remains, holding the later edit. Deleted on one phone and edited later on the other: the later edit wins and the note comes back. Tests in Task 2.
2. **The app is killed after applying remote changes but before pushing local ones:** the next sync still pushes them, and nothing is lost or duplicated. Tests in Task 6.
3. **First sign-in with lots of local data and an empty cloud** (or the reverse): everything is uploaded (or downloaded), and nothing is deleted on either side. Tests in Task 6.
4. **Pro lapses, then the user resubscribes:** there is no sync while lapsed, the cloud is untouched, and a normal merge happens on resubscribe. Tests in Task 7.
5. **A remote value this build can't read** (written by a newer app version, or corrupt): it is skipped. No crash, no overwriting local data with garbage, and the rest of the sync completes. Tests in Task 3.

---

### Task 1: Database — `sync_items` table, row-level security, `sync_push` RPC

**Files:**
- Create: `supabase/migrations/20261101000000_sync_items.sql`
- Modify: `PLAY-CONSOLE-PREP.md` §9 owner setup ("apply both migrations")

**Interfaces:**
- **Produces:** table `public.sync_items`:
  - `user_id uuid not null default auth.uid() references auth.users on delete cascade`
  - `collection text not null`
  - `item_key text not null`
  - `value jsonb`
  - `edited_at timestamptz not null`
  - `deleted boolean not null default false`
  - `server_at timestamptz not null default now()`
  - primary key `(user_id, collection, item_key)`
  - index `(user_id, server_at)`
- **Produces:** trigger `sync_items_stamp` (BEFORE INSERT OR UPDATE) that sets `server_at = clock_timestamp()`.
- **Produces:** RLS enabled, with select/insert/update/delete policies `using (user_id = (select auth.uid()))` / `with check (user_id = (select auth.uid()))`. Grant to `authenticated` only; revoke from `anon`.
- **Produces:** `public.sync_push(items jsonb) returns setof public.sync_items`, declared `security invoker`.
  - `items` is a JSON array of `{collection, item_key, value, edited_at, deleted}`.
  - For each element it upserts on the primary key. On conflict it updates **only when `excluded.edited_at > sync_items.edited_at`**.
  - It returns the stored rows for the pushed keys, so the client learns which side won.

- [ ] **Step 1: Load `supabase:supabase-postgres-best-practices`.** Write the migration to the interfaces above, with a header comment explaining each part.
- [ ] **Step 2: Add a SQL self-check block at the end of the migration file as a comment.** It holds the statements the owner runs in the SQL editor after applying it. As user A, expect:
  - an insert with another user's `user_id` fails RLS;
  - `sync_push` with an older `edited_at` leaves the row unchanged;
  - deleting the auth user removes the rows.

  There is no local Postgres, so this is the verification artifact.
- [ ] **Step 3: Update `PLAY-CONSOLE-PREP.md` §9** to say apply `20261101000000_sync_items.sql`, then run its self-check.
- [ ] **Step 4: Commit:** `feat(sync): sync_items table with RLS and last-write-wins push`

### Task 2: Merge rules (pure)

**Files:**
- Create: `src/app/core/services/sync/types.ts`, `src/app/core/services/sync/merge.ts`
- Test: `src/app/core/services/sync/__tests__/merge.test.ts`

**Interfaces:**
- **Produces (`types.ts`):**
  - `type SyncKind = "items" | "days" | "object" | "hifzPlan" | "freezePool"`
  - `interface Versioned { value: unknown; editedAt: string /* ISO */; deleted: boolean }`
  - `interface SyncRow { collection: string; item_key: string; value: unknown; edited_at: string; deleted: boolean; server_at?: string }`
- **Produces (`merge.ts`):**
  - `mergeVersioned(kind: SyncKind, local: Versioned | undefined, remote: Versioned | undefined): { winner: Versioned; pushLocal: boolean; applyRemote: boolean }`
  - `mergeHifzPlan(newer: HifzPlan, older: HifzPlan): { current: HifzPlan; archived: HifzPlan | null }`. `newer` is the copy with the greater `editedAt`, as the caller decides.
  - `mergeFreezePool(local: FreezePool, remote: FreezePool): FreezePool`
  - `HifzPlan`/`PlanSession` come from `src/app/features/hifz/hifz.service.ts`. `FreezePool` comes from `src/app/core/services/storage/streak-freeze.service.ts` (export it if needed).
- **Rules:**
  - **`items` and `object`:**
    - The greater `editedAt` wins, and a delete counts as an edit.
    - On a tie, the remote wins. This settles it deterministically across devices.
    - `pushLocal` is true when the local copy won and differs from the remote; `applyRemote` is true when the remote won and differs from the local.
  - **`days`:**
    - The result is never deleted.
    - If both values are arrays, the result is the union, de-duplicated and in stable order.
    - Otherwise the result is `true`.
    - `editedAt` is the max of the two.
  - **`hifzPlan`:**
    - Same `createdAt`: sessions are merged by `id`. `done` = newer.done || older.done, and `doneDate` = the earliest non-empty one. Every other field comes from `newer`. Sessions that exist only in `older` are dropped, because `newer`'s session list is authoritative.
    - Different `createdAt`: `current` is the one whose latest `doneDate` (or `createdAt`) is later, and `archived` is the other.
  - **`freezePool`:**
    - `earnedOn` = the max per day.
    - `spentOn` = the union.
    - `count` = `min(local.count, remote.count)`. This never mints freezes. The cost is that a freeze earned concurrently on both devices can be lost, which is acceptable for a safety net. Add a comment saying so.

- [ ] **Step 1: Write the failing tests.**
  - LWW: newer local wins → `pushLocal`; newer remote wins → `applyRemote`; a tie → remote; a local delete newer than a remote edit → a deleted winner; **a remote delete older than a local edit → the local edit wins (the note comes back)** (Review Focus 1).
  - Days: `["2026-10-01"]` + `["2026-10-02"]` gives both; a remote `deleted: true` is ignored.
  - `mergeHifzPlan` with the same createdAt: session 5 done on local and session 6 done on remote → both done; a done session stays done when the other side has it undone.
  - `mergeHifzPlan` with different plans → the later-active one is current and the other is archived.
  - `mergeFreezePool({count:2,earnedOn:{a:1},spentOn:["x"]}, {count:3,earnedOn:{a:2,b:1},spentOn:["y"]})` → `{count:2, earnedOn:{a:2,b:1}, spentOn:["x","y"]}`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): merge rules`

### Task 3: Collection adapters

**Files:**
- Create: `src/app/core/services/sync/collections.ts`
- Modify: `src/app/core/services/storage/backup.service.ts` (export `BACKED_UP_KEYS` if it isn't already)
- Test: `src/app/core/services/sync/__tests__/collections.test.ts`

**Interfaces:**
- **Produces:** `interface SyncCollection { id: string; kind: SyncKind; storageKeys: string[]; read(): Promise<Record<string, unknown>>; write(items: Record<string, unknown>): Promise<void>; validate(value: unknown): boolean }`
- **Produces:** `SYNC_COLLECTIONS: SyncCollection[]`, plus `collectionForStorageKey(key: string): SyncCollection | undefined`.
- **Collections:** the item key is in brackets; "object" means the single item key `"value"`.

| id | kind | source | item key / value |
|---|---|---|---|
| `notes` | items | `rafiq_notes_v1` (array of `Note`) | `[note.id]` → Note |
| `bookmarks` | items | `rafiq_bookmarks_v1` (map) | `[verseKey]` → stored string |
| `hiddenVerses` | items | `rafiq_hidden_verses_v1` (array of keys) | `[verseKey]` → `true` |
| `recitationHistory` | items | `rafiq_recitation_history_v1` (array) | `[session.id]` → session |
| `azkarFavorites` | items | `azkar:favorites` (array of ids) | `[id]` → `true` |
| `quizPresets` | items | Preferences `PRESETS_KEY` (array) | `[preset.id]` → preset |
| `trackerDays` | items | `rafeeq.tracker.days` (map day→ids) | `[day]` → ids |
| `hifzStreakDates` | days | `rafiq_hifz_streak_dates_v1` (array) | `[date]` → `true` |
| `hifzBridgedDates` | days | `rafiq_hifz_streak_freeze_v1` (array) | `[date]` → `true` |
| `hifzSessionCounts` | days | `rafiq_hifz_session_counts_v1` (map day→ids) | `[day]` → ids |
| `hifzPlan` | hifzPlan | `loadPlanAsync`/`savePlan`+`savePlanAsync` | `current` → HifzPlan; archived plans go to `archive:<createdAt>` |
| `hifzFreezePool` | freezePool | `rafiq_hifz_freeze_tokens_v1` | object |
| `hifzBest`, `hifzLatest`, `hifzReading` | object | the async loaders/savers, as `backup.service.ts` does | object |
| `settings` | object | `rafiq_settings_v1` | object |
| `theme`, `lang`, `lastPage`, `searchRecents`, `tafsirResources` | object | the matching `rafiq_*_v1` key | object |
| `trackerSettings`, `trackerSince`, `trackerWeights` | object | `rafeeq.tracker.*` | object |

- **Behaviour details:**
  - **`write` keeps local order where order exists:** surviving items stay in their existing order, and new items are appended in key order.
  - **`write` follows the same dual-write rules as `restoreBackup`:** the Hifz stores go through both the sync and async savers.
  - **`validate`:** each collection's checks are the minimum shape the store's own loader accepts. For example, Note needs string `id`/`body`, an array `ranges`, and string `updatedAt`. Days need an ISO `YYYY-MM-DD` key. Objects accept any non-null JSON.
  - **Tracker `since`:** an object whose merge keeps the **earliest** date. Special-case it in Task 6 by passing the earlier one as the winner.

- [ ] **Step 1: Write the failing tests** (localStorage plus mocked Preferences and Hifz async functions).
  - Round trip: `read()` then `write()` of the same items leaves the stored string semantically equal, for notes, bookmarks, tracker days, streak dates and settings.
  - `write` preserves the existing order and appends new items.
  - `validate` rejects a Note without `id`, a malformed day key, and a non-array days value for `hifzSessionCounts` (Review Focus 5).
  - `collectionForStorageKey("rafiq_notes_v1")` → `notes`; `collectionForStorageKey("rafiq_pro_v1")` → undefined.
  - Every key in `BACKED_UP_KEYS` maps to a collection (an inventory test, so a future backup key can't be silently left out of sync).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): collection adapters over the existing stores`

### Task 4: Local change tracking

**Files:**
- Create: `src/app/core/services/sync/local-changes.ts`
- Modify: `src/app/features/quiz/services/quiz-presets.service.ts` (call `markDirty(PRESETS_KEY)` after each write)
- Test: `src/app/core/services/sync/__tests__/local-changes.test.ts`

**Interfaces:**
- **Produces:**
  - `installWriteHook(): void`: idempotent. It wraps `Storage.prototype.setItem` and `removeItem` once. For keys with a collection, it records `dirtyAt[collectionId] = now` and calls the listener. Writes made inside `suppressHook(fn)` are not recorded.
  - `markDirty(storageKey: string): void`
  - `onLocalChange(cb: () => void): () => void`
  - `suppressHook<T>(fn: () => Promise<T>): Promise<T>`
  - `dirtyTime(collectionId: string): string | null`, plus `clearDirty(collectionId: string, upTo: string): void`. That clears only if no newer write happened.
  - `diffAgainstSnapshot(current: Record<string, unknown>, snapshot: Record<string, string /* stable JSON */>): { changed: string[]; removed: string[] }`
  - `stableStringify(value: unknown): string`, with sorted object keys.
- **Persistence:** dirty times persist in localStorage `rafiq_sync_dirty_v1`, so offline edits keep their edit time across restarts.

- [ ] **Step 1: Write the failing tests.**
  - The hook records a dirty time for `rafiq_notes_v1` writes but not for `rafiq_pro_v1`.
  - `suppressHook` writes are not recorded.
  - Installing twice doesn't double-wrap (one listener call per write).
  - `markDirty(PRESETS_KEY)` records `quizPresets`.
  - `clearDirty` with an older `upTo` keeps a newer dirty time.
  - `diffAgainstSnapshot` finds changed and removed keys, and is insensitive to key order.
  - Dirty times survive a module reload (`jest.isolateModules`).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): local change tracking`

### Task 5: Remote access

**Files:**
- Create: `src/app/core/services/sync/sync-remote.ts`
- Test: `src/app/core/services/sync/__tests__/sync-remote.test.ts`

**Interfaces:**
- **Consumes:** `getSupabase()` from `src/app/core/services/auth/supabase.client.ts`.
- **Produces:**
  - `pullSince(cursor: string | null): Promise<{ rows: SyncRow[]; cursor: string | null }>`
    - It pages with `.select("*").gt("server_at", cursor).order("server_at").limit(500)` until a short page.
    - Between pages, advance by the **exact last `server_at` string** of the previous page. Keep the PostgREST string with its microseconds; never round-trip it through a JS `Date`.
    - Apply the overlap only to the cursor that is finally returned: the max `server_at` **minus 10 seconds**. That is at least the `authenticated` statement_timeout (8 s), so rows committed late with an earlier stamp are caught. Merging is idempotent, so re-reading them is safe.
    - `null` means everything.
  - `push(rows: SyncRow[]): Promise<SyncRow[]>`: calls `rpc("sync_push", { items: rows })` in chunks of 200 and returns the stored rows.
    - The server rejects more than 500 items, and PostgREST's `max-rows` caps the rows returned, so never raise the chunk size.
    - `edited_at` must be an ISO-8601 string; the server rejects epoch numbers.
    - Values over 256 KB are rejected by a CHECK constraint, which fails the whole chunk. Skip oversized items client-side with a `console.warn`.
  - **Errors:** both throw `SyncOfflineError` on network failures and `SyncError` otherwise.

- [ ] **Step 1: Write the failing tests** (mock the Supabase query builder and `rpc`).
  - Paging stops on a short page.
  - The second page's `gt` uses the first page's exact last `server_at` string.
  - The returned cursor is the max `server_at` minus 10 s.
  - An item whose JSON is over 256 KB is not sent.
  - `null` cursor → no `gt` filter.
  - `push` chunks 450 rows into 3 calls.
  - A `fetch failed` / `TypeError` → `SyncOfflineError`; a PostgREST error → `SyncError`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): pull and push against sync_items`

### Task 6: The sync engine

**Files:**
- Create: `src/app/core/services/sync/sync.service.ts`
- Test: `src/app/core/services/sync/__tests__/sync.service.test.ts`

**Interfaces:**
- **Consumes:** Tasks 2–5.
- **Produces:**
  - `syncNow(userId: string): Promise<SyncResult>`
    - `type SyncResult = { status: "synced"; appliedCollections: string[] } | { status: "offline" } | { status: "error"; message: string }`
    - It never throws, and concurrent calls share the in-flight run.
  - `resetSyncState(): void`: forces the next sync to be a first merge.
  - `SYNC_APPLIED_EVENT = "rafeeq:sync-applied"`: dispatched on `window` with `detail: { collections: string[] }` when remote changes were written locally.
- **State** lives in localStorage `rafiq_sync_state_v1`: `{ userId, cursor, snapshot: Record<collectionId, Record<itemKey, stableJson>>, firstMerge: boolean }`.
  - A missing state, a different `userId`, or `firstMerge: true` means **first-merge mode**. In that mode local `removed` items are not turned into deletes and the pull starts from `null`.
- **Algorithm for one run:**
  1. Load the state (reset if `userId` differs) and pull since the cursor.
  2. For each collection:
     - `read()` the local items and validate them. Skip invalid remote rows with a `console.warn` (Review Focus 5).
     - Diff against the snapshot.
     - A local item's `editedAt` is `dirtyTime(collection) ?? its own timestamp`, where `Note.updatedAt` or `RecitationSession.recordedAt` exist, or the epoch otherwise.
     - Locally removed items (outside first-merge mode) become `deleted: true` with `editedAt = dirtyTime`.
  3. Merge each key with `mergeVersioned`, or the custom merges for `hifzPlan`'s `current` key, `hifzFreezePool` and `trackerSince`. `trackerSince` keeps the earlier date. Hifz plan conflicts write the archived plan as item `archive:<createdAt>`. Those archive keys merge as `items`.
  4. If any remote values won, write those collections locally inside `suppressHook`, then dispatch `SYNC_APPLIED_EVENT`.
  5. Push every item where the local side won, including deletes. Write the snapshot **only after the push succeeds**, from the stored rows the push returned. Then save the cursor, set `firstMerge: false`, and `clearDirty(…, runStartTime)`.

  Steps 4–5 ordering is Review Focus 2: if the run dies after step 4, the dirty times and the old snapshot mean the next run pushes again.

- [ ] **Step 1: Write the failing tests.** Mock `sync-remote` with an in-memory fake server that applies the `sync_push` LWW rule. Use real adapters on localStorage.
  - First sign-in, 3 local notes, empty cloud → 3 pushed, 0 deleted locally (Review Focus 3).
  - Empty local, 3 cloud notes → applied locally, `SYNC_APPLIED_EVENT` dispatched with `["notes"]`.
  - First merge where both sides have different notes → both sides end with all of them.
  - A delete after the first merge → a tombstone is pushed, and a second device's sync removes it.
  - A crash between apply and push (make `push` reject once) → the next `syncNow` pushes the pending local notes, and the cloud ends with the union (Review Focus 2).
  - An offline pull → `{status:"offline"}`, local data untouched, the snapshot unchanged.
  - A user switch → `resetSyncState` behaviour: the new user's first merge uploads local data, and nothing is deleted.
  - A corrupt remote note row → skipped, the other notes still apply (Review Focus 5).
  - Two concurrent `syncNow` calls → one network run.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): sync engine`

### Task 7: SyncProvider — triggers, status, refreshing the UI

**Files:**
- Create: `src/app/core/context/SyncContext.tsx`
- Modify:
  - `src/App.tsx`: put `<SyncProvider>` inside `SubscriptionProvider`, and call `installWriteHook()` once at module load.
  - `src/app/core/context/ThemeContext.tsx`, `LanguageContext.tsx` and `VerseVisibilityContext.tsx`: re-read their stored value on `SYNC_APPLIED_EVENT` when their collection is listed.
- Test:
  - `src/app/core/context/__tests__/SyncContext.test.tsx`
  - one test each in the three contexts' test files (create them if absent)

**Interfaces:**
- **Consumes:** `useAuth()` (`enabled`, `user`); `useSubscription()` (`isPro`, `ready`); `syncNow`, `onLocalChange`, `SYNC_APPLIED_EVENT`.
- **Produces:**
  - `useSync(): { active: boolean; status: "off" | "syncing" | "synced" | "offline" | "error"; lastSyncedAt: string | null; syncNow(): void }`
  - `active` = `enabled && !!user && isPro && ready`.
- **Triggers while active:**
  - becoming active (sign-in, Pro starting, or launch with both already true)
  - Capacitor App `resume`
  - `window` `online`
  - `onLocalChange`, debounced 5000 ms
- **When inactive:** do nothing and set status `"off"`. When Pro lapses, stop and keep the state (Review Focus 4).
- **`lastSyncedAt`:** persisted in the sync state.

- [ ] **Step 1: Write the failing tests** (mock `syncNow` and fake timers).
  - Not Pro → no sync, status off.
  - Becoming Pro while signed in → one sync.
  - A local change → a sync after 5 s, and three changes inside 5 s → one sync.
  - `resume` and `online` → a sync.
  - Pro lapses → status off, further changes don't sync, `resetSyncState` is **not** called; resubscribe → a sync (Review Focus 4).
  - An offline result → status `"offline"`.
  - Each context re-reads on `SYNC_APPLIED_EVENT` for its collection (theme switches from day to night).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** `feat(sync): SyncProvider with triggers and status`

### Task 8: Account page status, and backup import on synced devices

**Files:**
- Modify:
  - `src/app/features/account/AccountIdentityRow.tsx` (a sync status row when `useSync().active`)
  - `src/app/features/account/Account.tsx` (backup import)
  - `src/app/core/services/storage/backup.service.ts`
  - `src/app/core/i18n/strings.ts`
- Test:
  - `src/app/features/account/__tests__/AccountIdentityRow.test.tsx`
  - `src/app/core/services/storage/__tests__/backup.service.test.ts`

**Interfaces:**
- **Consumes:** `useSync()`, `resetSyncState()`.
- **Status row:** a static `ac-row` showing a status label, with a tap action of "Sync now" (`useSync().syncNow`). Labels:
  - `synced`: "Synced · {relative time}"
  - `syncing`: "Syncing…"
  - `offline`: "Waiting for connection"
  - `error`: "Couldn't sync — tap to retry"

  Each label needs an Arabic equivalent in the app's own register.
- **Backup import on a synced device (`useSync().active`):**
  - After `restoreBackup`, call `resetSyncState()`. The next sync is then a first merge: nothing is deleted, items missing from the file come back from the cloud, and the file's items win where they are newer. Spec Goal 16.
  - The restore confirm adds one line when active: "Synced data on your account is kept; the file adds to it."
- **Restore the `account.deleteWhat` wording.** Task 11 of Part 1 removed "synced data" from it because sync didn't exist yet. Add back an explicit mention of synced data, in both languages.

- [ ] **Step 1: Write the failing tests.**
  - The status row is absent when not active; for each status it shows the right label.
  - Tapping it calls `syncNow`.
  - An import while active calls `resetSyncState` and the confirm shows the extra line; an import while inactive does neither.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (invoke `frontend-design:frontend-design` first for the row).
- [ ] **Step 4: Run, expect PASS** (plus the full suite once). **Commit** `feat(sync): Account sync status and import that never deletes`

### Task 9: Paperwork for synced data

**Files:**
- Modify: `PLAY-CONSOLE-PREP.md` (§1, §2, §9), `TODO.md`
- On `gh-pages` (temporary worktree at `.superpowers/gh-pages-wt`; commit locally, never push): `privacy.html`, `privacy-ar.html`, `delete-account.html`, `delete-account-ar.html`

- [ ] **Step 1: Data safety.**
  - App activity → user-generated content (notes) and app interactions (Hifz progress, tracker), now **collected** for Pro subscribers.
  - Purpose: app functionality. Encrypted in transit. Deletable.
  - Note that it applies only to the build with accounts on and a Pro subscription.
- [ ] **Step 2: Privacy pages (EN + AR).**
  - Replace the "no sync yet / will be announced" text with what syncs: the backup categories, including settings.
  - Who syncs: Pro subscribers.
  - Where: Supabase `[REGION]`.
  - Retention: kept after Pro ends, until Delete account.
  - Merging behaviour, in one plain sentence.
- [ ] **Step 3: Deletion pages (EN + AR).** "Data stored with your account" now explicitly includes synced notes, bookmarks, Hifz progress, tracker and settings.
- [ ] **Step 4: TODO.md / §9.**
  - Add a device check: two phones, the same account, edit a note offline on each, sync, and confirm the later edit wins.
  - Add: import a backup on a synced phone, and confirm nothing disappears.
  - Add: Supabase Free → Pro before real subscribers' data accumulates (already listed; make sure it's next to sync).
- [ ] **Step 5: Commit on each branch:**
  - `docs: synced data in Data safety, privacy and deletion pages`
  - `docs(legal): synced data` (gh-pages, local only)
