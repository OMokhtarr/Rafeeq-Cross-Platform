# Content Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Rafeeq's cached tafsir and recitation content onto the QF Content Sync protocol, satisfying Developer Terms §3.1(3)(b), and give tafsir real offline support for the first time.

**Architecture:** A sync engine over a uniform IndexedDB row store, with per-group adapters. The engine fetches, paginates, orders and applies mutations, knowing nothing about tafsirs vs recitations; adapters own bootstrap and reads. Sync runs on app resume, throttled to once per 24h, plus a manual control in Settings.

**Tech Stack:** TypeScript, React 18, Ionic React, Capacitor 8, IndexedDB (via the project's own `idb.service.ts` wrapper), Jest via `react-scripts test`.

**Spec:** `docs/superpowers/specs/2026-08-21-content-sync-design.md`, **as corrected by** `docs/superpowers/specs/2026-08-21-content-sync-wire-format.md`. Read both. Where they disagree, the wire-format document is authoritative — it was verified against the live API, the design document was not.

## Global Constraints

- **Never add `// eslint-disable` comments** of any kind, including `react-hooks/exhaustive-deps`. (CLAUDE.md)
- **Never add visible scrollbars.** The global rule in `src/index.css` hides them; do not re-add scroll styling. (CLAUDE.md)
- **Page containers cap width at `var(--max-width-mobile, 600px)`** and centre with `margin: 0 auto`. Never hard-code a pixel width. (CLAUDE.md)
- **Any page scrolling inside `IonContent` needs `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`.** (CLAUDE.md)
- **All user-facing strings go in `src/app/core/i18n/strings.ts` in both EN and AR.** Never inline a literal in a component.
- **Do not run `npm run build`, `cap sync`, or gradle.** The user builds the app themselves. Run `npx tsc --noEmit` and `CI=true npx react-scripts test --watchAll=false` only.
- **`npx tsc --noEmit` reports ~50 pre-existing errors under `node_modules/@types/node/ffi.d.ts`.** These are unrelated to this work. Verify with `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"` — that must be empty.
- **API base:** `https://apis.quran.foundation/content/api/v4`, from `process.env.REACT_APP_CONTENT_API_BASE`. Auth is handled inside `quran-api.client.ts` via the token broker — do not add new auth code.

## File Structure

**Create:**
- `src/app/core/services/sync/content-sync.types.ts` — shared types, no logic
- `src/app/core/services/sync/sync-state.service.ts` — SyncState persistence in IDB
- `src/app/core/services/sync/sync-store.service.ts` — row store CRUD over `content_sync`
- `src/app/core/services/sync/parse-mutation.ts` — the single wire-parsing boundary
- `src/app/core/services/sync/content-sync.service.ts` — the engine
- `src/app/core/services/sync/adapters/tafsirs.adapter.ts` — bootstrap + read
- `src/app/core/services/sync/adapters/recitations.adapter.ts` — bootstrap + eviction
- `src/app/core/hooks/useContentSync.ts` — resume/visibility trigger
- Tests colocated as `*.test.ts` beside each of the above that has logic

**Modify:**
- `src/app/core/services/storage/idb.service.ts` — v9: add `content_sync` + `sync_meta`
- `src/app/core/services/api/quran-api.client.ts` — add sync + snapshot fetchers
- `src/app/core/services/data/tafsir-cache.service.ts` — make `isTafsirDownloaded` truthful
- `src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx` — read via adapter
- `src/app/features/tafsir/TafsirSettings.tsx` — real bootstrap with progress
- `src/app/features/settings/Settings.tsx` — sync status section
- `src/app/features/settings/Settings.css` — styles for that section
- `src/app/core/i18n/strings.ts` — EN + AR strings
- `src/App.tsx` — mount `useContentSync()`

---

### Task 1: IDB v9 — the row store and sync meta

**Files:**
- Modify: `src/app/core/services/storage/idb.service.ts`
- Test: `src/app/core/services/storage/idb.service.test.ts` (create)

**Interfaces:**
- Consumes: nothing
- Produces: object stores `content_sync` (keyPath `"id"`, index `by_resource` on `["resourceGroup","resourceId"]`) and `sync_meta` (keyPath `"key"`), at `DB_VERSION = 9`.

**Context:** The file already documents each version bump in a comment block at the top. Follow that convention exactly — a bump with no comment will read as an accident later. v8 (dropping `translations`) already landed; you are adding v9 on top.

`idb.service.ts` exposes `get`, `getAll`, `count`, `getAllKeys`, `put`, `bulkPut`, `delete`, `clear`. It has **no index support** — you must add a `getAllByIndex` method, because reading a resource's rows without an index scans the whole store (a tafsir is up to 6,236 rows).

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/storage/idb.service.test.ts`:

```ts
import "fake-indexeddb/auto";
import { idb } from "./idb.service";

describe("IDB v9 sync stores", () => {
  it("creates content_sync with a by_resource index and sync_meta", async () => {
    await idb.open();
    await idb.put("content_sync", {
      id: "tafsirs:169:tafsir:1:1",
      resourceGroup: "tafsirs",
      resourceId: 169,
      recordType: "tafsir",
      recordKey: "1:1",
      data: { text: "x" },
      sequence: 5,
    });
    await idb.put("content_sync", {
      id: "tafsirs:15:tafsir:1:1",
      resourceGroup: "tafsirs",
      resourceId: 15,
      recordType: "tafsir",
      recordKey: "1:1",
      data: { text: "y" },
      sequence: 6,
    });

    // The index must return ONLY resource 169 — a full-store scan would return 2.
    const rows = await idb.getAllByIndex<{ id: string }>(
      "content_sync",
      "by_resource",
      ["tafsirs", 169],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("tafsirs:169:tafsir:1:1");

    await idb.put("sync_meta", { key: "state", syncToken: "abc" });
    const meta = await idb.get<{ syncToken: string }>("sync_meta", "state");
    expect(meta?.syncToken).toBe("abc");
  });
});
```

- [ ] **Step 2: Install the IndexedDB test shim**

The suite runs in jsdom, which has no IndexedDB. Run:

```bash
npm install --save-dev fake-indexeddb
```

If `npm install` fails with `ERR_INVALID_ARG_TYPE`, set ComSpec first — this machine needs it:

```bash
ComSpec="C:\\Windows\\System32\\cmd.exe" npm install --save-dev fake-indexeddb
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false idb.service.test`
Expected: FAIL — `idb.getAllByIndex is not a function`.

- [ ] **Step 4: Bump the version and add the stores**

In `idb.service.ts`, append to the version comment block:

```ts
// v9: added `content_sync` (Content Sync row store, key
//     `${group}:${resourceId}:${recordType}:${recordKey}`, indexed by
//     [resourceGroup, resourceId]) and `sync_meta` (single "state" record
//     holding the sync token, timestamps and tracked resources).
const DB_VERSION = 9;
```

Inside `onupgradeneeded`, after the `hifz` store block:

```ts
// content_sync store: one row per synced record, keyed by the composite the
// API's ROW mutations carry. The index is required — reads are always
// "every row for this resource", and a tafsir runs to 6,236 rows.
if (!db.objectStoreNames.contains("content_sync")) {
  const os = db.createObjectStore("content_sync", { keyPath: "id" });
  os.createIndex("by_resource", ["resourceGroup", "resourceId"], {
    unique: false,
  });
}

// sync_meta store: a single { key: "state", ... } record.
if (!db.objectStoreNames.contains("sync_meta")) {
  db.createObjectStore("sync_meta", { keyPath: "key" });
}
```

- [ ] **Step 5: Add the index read method**

In the `// ── Reads ──` section of the `IDBService` class:

```ts
/**
 * All records matching an index key. Used to pull one resource's rows out of
 * `content_sync` without scanning the whole store.
 */
async getAllByIndex<T>(
  store: string,
  index: string,
  key: IDBValidKey,
): Promise<T[]> {
  await this.open();
  return new Promise((resolve, reject) => {
    const tx = this.db!.transaction(store, "readonly");
    const req = tx.objectStore(store).index(index).getAll(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false idb.service.test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/storage/idb.service.ts src/app/core/services/storage/idb.service.test.ts package.json package-lock.json
git commit -m "add IDB v9 content_sync and sync_meta stores"
```

---

### Task 2: Types and the wire-parsing boundary

**Files:**
- Create: `src/app/core/services/sync/content-sync.types.ts`
- Create: `src/app/core/services/sync/parse-mutation.ts`
- Test: `src/app/core/services/sync/parse-mutation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type SyncGroup = "tafsirs" | "recitations"`
  - `interface SyncMutation { sequence: number; type: MutationType; resourceGroup: SyncGroup; resourceId: number; recordType: string | null; recordKey: string | null; data: unknown; snapshotUrl: string | null; }`
  - `type MutationType = "RESOURCE_CREATE" | "RESOURCE_INVALIDATE" | "RESOURCE_DELETE" | "RESOURCE_UPDATE" | "ROW_CREATE" | "ROW_UPDATE" | "ROW_DELETE"`
  - `interface SyncPage { mutations: SyncMutation[]; hasMore: boolean; nextSyncToken: string | null; syncUntilSequence: number; }`
  - `interface SyncRow { id: string; resourceGroup: SyncGroup; resourceId: number; recordType: string; recordKey: string; data: unknown; sequence: number; }`
  - `interface TrackedResource { group: SyncGroup; resourceId: number; bootstrappedAt: number | null; }`
  - `interface SyncState { syncToken: string | null; lastSyncedAt: number | null; lastAttemptAt: number | null; lastError: string | null; trackedResources: TrackedResource[]; }`
  - `function parseSyncPage(body: unknown): SyncPage`
  - `function resolveSnapshotUrl(raw: string, apiBase: string): string`
  - `function rowId(group: SyncGroup, resourceId: number, recordType: string, recordKey: string): string`

**Context:** This is the file the wire-format document exists to protect. Every field name below was **observed on the live API**, not inferred. Two shapes matter:

Sync response — note the `sync` envelope:
```json
{ "sync": { "sync_until_sequence": 1395, "has_more": false,
            "next_page_url": null, "next_sync_token": "…", "mutations": [ … ] } }
```

Mutation — `record_type`/`record_key`/`data` are null on RESOURCE-level ones:
```json
{ "sequence": 1234, "type": "RESOURCE_CREATE", "resource_group": "tafsirs",
  "resource_id": 169, "resource_content_id": 4321, "record_type": null,
  "record_key": null, "source_record_id": null,
  "changed_at": "2026-08-21T08:16:39Z", "data": null,
  "snapshot_url": "/api/v4/resources/snapshots/tafsirs/169",
  "unavailable_reason": null }
```

`snapshot_url` is relative and points at `/api/v4/...` while our base path is `/content/api/v4` — resolving it naively 404s.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/parse-mutation.test.ts`:

```ts
import { parseSyncPage, resolveSnapshotUrl, rowId } from "./parse-mutation";

const BASE = "https://apis.quran.foundation/content/api/v4";

describe("parseSyncPage", () => {
  it("unwraps the sync envelope and maps snake_case to the internal shape", () => {
    const page = parseSyncPage({
      sync: {
        sync_until_sequence: 1395,
        has_more: false,
        next_page_url: null,
        next_sync_token: "tok-abc",
        mutations: [
          {
            sequence: 1234,
            type: "RESOURCE_CREATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: null,
            record_key: null,
            data: null,
            snapshot_url: "/api/v4/resources/snapshots/tafsirs/169",
          },
        ],
      },
    });

    expect(page.hasMore).toBe(false);
    expect(page.nextSyncToken).toBe("tok-abc");
    expect(page.syncUntilSequence).toBe(1395);
    expect(page.mutations).toHaveLength(1);
    expect(page.mutations[0].resourceGroup).toBe("tafsirs");
    expect(page.mutations[0].resourceId).toBe(169);
    expect(page.mutations[0].snapshotUrl).toBe(
      "/api/v4/resources/snapshots/tafsirs/169",
    );
  });

  it("returns an empty page when mutations is absent", () => {
    // The live API returns mutations: [] for most resources; a missing key
    // must not throw either.
    const page = parseSyncPage({
      sync: { sync_until_sequence: 1, has_more: false, next_sync_token: "t" },
    });
    expect(page.mutations).toEqual([]);
  });

  it("skips mutations from resource groups this app does not handle", () => {
    // articles/translations are valid API groups but not ours; keeping them
    // would create rows no adapter can ever read.
    const page = parseSyncPage({
      sync: {
        sync_until_sequence: 2,
        has_more: false,
        next_sync_token: "t",
        mutations: [
          { sequence: 1, type: "RESOURCE_CREATE", resource_group: "articles", resource_id: 1 },
          { sequence: 2, type: "RESOURCE_CREATE", resource_group: "tafsirs", resource_id: 169 },
        ],
      },
    });
    expect(page.mutations.map((m) => m.resourceGroup)).toEqual(["tafsirs"]);
  });
});

describe("resolveSnapshotUrl", () => {
  it("rewrites the /api/v4 prefix to the content base path", () => {
    // Naive resolution against the base yields /content/api/v4/api/v4/... → 404.
    expect(
      resolveSnapshotUrl("/api/v4/resources/snapshots/tafsirs/169", BASE),
    ).toBe(
      "https://apis.quran.foundation/content/api/v4/resources/snapshots/tafsirs/169",
    );
  });

  it("passes an absolute url through unchanged", () => {
    const abs = "https://example.test/snap.json";
    expect(resolveSnapshotUrl(abs, BASE)).toBe(abs);
  });
});

describe("rowId", () => {
  it("builds the composite key the API's ROW mutations carry", () => {
    expect(rowId("tafsirs", 169, "tafsir", "2:255")).toBe(
      "tafsirs:169:tafsir:2:255",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false parse-mutation`
Expected: FAIL — cannot resolve `./parse-mutation`.

- [ ] **Step 3: Write the types**

Create `src/app/core/services/sync/content-sync.types.ts`:

```ts
/**
 * Shared Content Sync types.
 *
 * Field names here are the app's internal camelCase shape. The snake_case wire
 * shape is confined to parse-mutation.ts — see
 * docs/superpowers/specs/2026-08-21-content-sync-wire-format.md.
 */

/** Resource groups Rafeeq syncs. The API also serves translations,
 *  word_by_word_translations and articles; none are used by this app. */
export type SyncGroup = "tafsirs" | "recitations";

export const SYNC_GROUPS: SyncGroup[] = ["tafsirs", "recitations"];

export type MutationType =
  | "RESOURCE_CREATE"
  | "RESOURCE_INVALIDATE"
  | "RESOURCE_DELETE"
  | "RESOURCE_UPDATE"
  | "ROW_CREATE"
  | "ROW_UPDATE"
  | "ROW_DELETE";

export interface SyncMutation {
  sequence: number;
  type: MutationType;
  resourceGroup: SyncGroup;
  resourceId: number;
  /** Null on RESOURCE-level mutations. */
  recordType: string | null;
  /** Null on RESOURCE-level mutations. */
  recordKey: string | null;
  /** Row payload on ROW-level mutations; null otherwise. */
  data: unknown;
  /** Relative path; pass through resolveSnapshotUrl() before fetching. */
  snapshotUrl: string | null;
}

export interface SyncPage {
  mutations: SyncMutation[];
  hasMore: boolean;
  nextSyncToken: string | null;
  syncUntilSequence: number;
}

/** One stored record. `id` is the composite key from rowId(). */
export interface SyncRow {
  id: string;
  resourceGroup: SyncGroup;
  resourceId: number;
  recordType: string;
  recordKey: string;
  data: unknown;
  sequence: number;
}

export interface TrackedResource {
  group: SyncGroup;
  resourceId: number;
  /** Epoch ms of the last successful snapshot load; null if never completed. */
  bootstrappedAt: number | null;
}

export interface SyncState {
  /** next_sync_token from the last COMPLETED run. Never advanced mid-run. */
  syncToken: string | null;
  lastSyncedAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  trackedResources: TrackedResource[];
}

export const EMPTY_SYNC_STATE: SyncState = {
  syncToken: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastError: null,
  trackedResources: [],
};
```

- [ ] **Step 4: Write the parser**

Create `src/app/core/services/sync/parse-mutation.ts`:

```ts
/**
 * THE WIRE BOUNDARY.
 *
 * Every snake_case field name from the Content Sync API appears here and
 * nowhere else. The documentation ships no example response bodies, so these
 * names were verified against the live API on 2026-08-21 — see
 * docs/superpowers/specs/2026-08-21-content-sync-wire-format.md.
 *
 * ROW-level mutations were never observed in that session, so recordType,
 * recordKey and data are the one part still inferred. If a row shape surprise
 * appears, it is fixable here alone.
 */

import {
  MutationType,
  SYNC_GROUPS,
  SyncGroup,
  SyncMutation,
  SyncPage,
} from "./content-sync.types";

const KNOWN_TYPES: MutationType[] = [
  "RESOURCE_CREATE",
  "RESOURCE_INVALIDATE",
  "RESOURCE_DELETE",
  "RESOURCE_UPDATE",
  "ROW_CREATE",
  "ROW_UPDATE",
  "ROW_DELETE",
];

function isSyncGroup(v: unknown): v is SyncGroup {
  return typeof v === "string" && (SYNC_GROUPS as string[]).includes(v);
}

/**
 * Unwrap the `sync` envelope and map one page to the internal shape.
 * Mutations from groups this app does not handle are dropped: they would
 * become rows no adapter could ever read.
 */
export function parseSyncPage(body: unknown): SyncPage {
  const root = (body ?? {}) as Record<string, any>;
  const sync = (root.sync ?? root) as Record<string, any>;
  const raw = Array.isArray(sync.mutations) ? sync.mutations : [];

  const mutations: SyncMutation[] = [];
  for (const m of raw) {
    if (!isSyncGroup(m?.resource_group)) continue;
    if (!KNOWN_TYPES.includes(m?.type)) continue;
    mutations.push({
      sequence: Number(m.sequence ?? 0),
      type: m.type as MutationType,
      resourceGroup: m.resource_group,
      resourceId: Number(m.resource_id),
      recordType: m.record_type ?? null,
      recordKey: m.record_key ?? null,
      data: m.data ?? null,
      snapshotUrl: m.snapshot_url ?? null,
    });
  }

  return {
    mutations,
    hasMore: Boolean(sync.has_more),
    nextSyncToken: sync.next_sync_token ?? null,
    syncUntilSequence: Number(sync.sync_until_sequence ?? 0),
  };
}

/**
 * snapshot_url comes back as `/api/v4/resources/snapshots/...` while our base
 * path is `/content/api/v4`. Joining it to the base naively produces
 * `/content/api/v4/api/v4/...`, which 404s.
 */
export function resolveSnapshotUrl(raw: string, apiBase: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = new URL(apiBase).origin;
  const basePath = new URL(apiBase).pathname.replace(/\/$/, "");
  return origin + raw.replace(/^\/api\/v4/, basePath);
}

/** The composite key the API's ROW mutations address a record by. */
export function rowId(
  group: SyncGroup,
  resourceId: number,
  recordType: string,
  recordKey: string,
): string {
  return `${group}:${resourceId}:${recordType}:${recordKey}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false parse-mutation`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/sync/
git commit -m "add Content Sync types and wire-parsing boundary"
```

---

### Task 3: Sync state persistence

**Files:**
- Create: `src/app/core/services/sync/sync-state.service.ts`
- Test: `src/app/core/services/sync/sync-state.service.test.ts`

**Interfaces:**
- Consumes: `SyncState`, `TrackedResource`, `EMPTY_SYNC_STATE`, `SyncGroup` from `content-sync.types`; `idb` from `../storage/idb.service`
- Produces:
  - `async function readSyncState(): Promise<SyncState>`
  - `async function writeSyncState(next: SyncState): Promise<void>`
  - `async function trackResource(group: SyncGroup, resourceId: number): Promise<void>`
  - `async function untrackResource(group: SyncGroup, resourceId: number): Promise<void>`
  - `async function markBootstrapped(group: SyncGroup, resourceId: number): Promise<void>`
  - `async function isTracked(group: SyncGroup, resourceId: number): Promise<boolean>`
  - `function resourcesFilter(tracked: TrackedResource[]): string`

**Context:** State lives in IDB, not localStorage — it must sit alongside the rows it describes. `resourcesFilter` builds the API's required `resources` parameter, e.g. `tafsirs:169;recitations:7`. The API returns 422 if it is missing, so an empty tracked list means "skip the run entirely", never "sync everything".

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/sync-state.service.test.ts`:

```ts
import "fake-indexeddb/auto";
import {
  readSyncState,
  writeSyncState,
  trackResource,
  untrackResource,
  markBootstrapped,
  isTracked,
  resourcesFilter,
} from "./sync-state.service";
import { EMPTY_SYNC_STATE } from "./content-sync.types";
import { idb } from "../storage/idb.service";

beforeEach(async () => {
  await idb.clear("sync_meta");
});

describe("sync state", () => {
  it("reads an empty state before anything is written", async () => {
    expect(await readSyncState()).toEqual(EMPTY_SYNC_STATE);
  });

  it("round-trips a written state", async () => {
    await writeSyncState({
      ...EMPTY_SYNC_STATE,
      syncToken: "tok",
      lastSyncedAt: 1234,
    });
    const s = await readSyncState();
    expect(s.syncToken).toBe("tok");
    expect(s.lastSyncedAt).toBe(1234);
  });

  it("tracks a resource once, not twice", async () => {
    await trackResource("tafsirs", 169);
    await trackResource("tafsirs", 169);
    const s = await readSyncState();
    expect(s.trackedResources).toHaveLength(1);
    expect(await isTracked("tafsirs", 169)).toBe(true);
  });

  it("records the bootstrap timestamp separately from tracking", async () => {
    await trackResource("tafsirs", 169);
    // Tracked but not yet bootstrapped — this is the interrupted-download state.
    expect((await readSyncState()).trackedResources[0].bootstrappedAt).toBeNull();
    await markBootstrapped("tafsirs", 169);
    expect(
      (await readSyncState()).trackedResources[0].bootstrappedAt,
    ).toBeGreaterThan(0);
  });

  it("untracks only the named resource", async () => {
    await trackResource("tafsirs", 169);
    await trackResource("recitations", 7);
    await untrackResource("tafsirs", 169);
    const s = await readSyncState();
    expect(s.trackedResources).toHaveLength(1);
    expect(s.trackedResources[0].group).toBe("recitations");
  });
});

describe("resourcesFilter", () => {
  it("joins group:id pairs with semicolons", () => {
    expect(
      resourcesFilter([
        { group: "tafsirs", resourceId: 169, bootstrappedAt: null },
        { group: "recitations", resourceId: 7, bootstrappedAt: null },
      ]),
    ).toBe("tafsirs:169;recitations:7");
  });

  it("returns an empty string for no tracked resources", () => {
    // The caller must skip the run — the API 422s on a missing filter, and an
    // empty filter must never be read as "sync everything".
    expect(resourcesFilter([])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false sync-state`
Expected: FAIL — cannot resolve `./sync-state.service`.

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/sync/sync-state.service.ts`:

```ts
/**
 * Content Sync state, persisted in IndexedDB.
 *
 * IDB rather than localStorage: this describes the rows in `content_sync` and
 * must live and die with them. A half-written state here is a correctness bug,
 * not a lost preference.
 */

import { idb } from "../storage/idb.service";
import {
  EMPTY_SYNC_STATE,
  SyncGroup,
  SyncState,
  TrackedResource,
} from "./content-sync.types";

const META_KEY = "state";

interface StateRecord extends SyncState {
  key: string;
}

export async function readSyncState(): Promise<SyncState> {
  const rec = await idb.get<StateRecord>("sync_meta", META_KEY);
  if (!rec) return { ...EMPTY_SYNC_STATE };
  return {
    syncToken: rec.syncToken ?? null,
    lastSyncedAt: rec.lastSyncedAt ?? null,
    lastAttemptAt: rec.lastAttemptAt ?? null,
    lastError: rec.lastError ?? null,
    trackedResources: rec.trackedResources ?? [],
  };
}

export async function writeSyncState(next: SyncState): Promise<void> {
  await idb.put<StateRecord>("sync_meta", { key: META_KEY, ...next });
}

/**
 * Add a resource to the sync scope. Tracking is tied to data, not to the
 * user's current selection: a resource stays tracked while its rows are on
 * disk, so corrections keep arriving for content the user can still open.
 */
export async function trackResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  const state = await readSyncState();
  if (state.trackedResources.some((r) => r.group === group && r.resourceId === resourceId)) {
    return;
  }
  await writeSyncState({
    ...state,
    trackedResources: [
      ...state.trackedResources,
      { group, resourceId, bootstrappedAt: null },
    ],
  });
}

/** Drop a resource from the sync scope. Call only after deleting its rows. */
export async function untrackResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  const state = await readSyncState();
  await writeSyncState({
    ...state,
    trackedResources: state.trackedResources.filter(
      (r) => !(r.group === group && r.resourceId === resourceId),
    ),
  });
}

/** Mark a resource's snapshot as fully loaded. */
export async function markBootstrapped(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  const state = await readSyncState();
  await writeSyncState({
    ...state,
    trackedResources: state.trackedResources.map((r) =>
      r.group === group && r.resourceId === resourceId
        ? { ...r, bootstrappedAt: Date.now() }
        : r,
    ),
  });
}

export async function isTracked(
  group: SyncGroup,
  resourceId: number,
): Promise<boolean> {
  const state = await readSyncState();
  return state.trackedResources.some(
    (r) => r.group === group && r.resourceId === resourceId,
  );
}

/**
 * The API's `resources` parameter, e.g. "tafsirs:169;recitations:7".
 * Required by the endpoint — it returns 422 without it. An empty string means
 * the caller must skip the run, never "sync everything".
 */
export function resourcesFilter(tracked: TrackedResource[]): string {
  return tracked.map((r) => `${r.group}:${r.resourceId}`).join(";");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false sync-state`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/sync/
git commit -m "add Content Sync state persistence"
```

---

### Task 4: The row store

**Files:**
- Create: `src/app/core/services/sync/sync-store.service.ts`
- Test: `src/app/core/services/sync/sync-store.service.test.ts`

**Interfaces:**
- Consumes: `SyncRow`, `SyncGroup` from `content-sync.types`; `rowId` from `parse-mutation`; `idb`
- Produces:
  - `async function putRows(rows: SyncRow[]): Promise<void>`
  - `async function deleteRow(group: SyncGroup, resourceId: number, recordType: string, recordKey: string): Promise<void>`
  - `async function readResourceRows(group: SyncGroup, resourceId: number): Promise<SyncRow[]>`
  - `async function replaceResourceRows(group: SyncGroup, resourceId: number, rows: SyncRow[]): Promise<void>`
  - `async function purgeResource(group: SyncGroup, resourceId: number): Promise<void>`
  - `async function countResourceRows(group: SyncGroup, resourceId: number): Promise<number>`

**Context:** `replaceResourceRows` implements the API's "replace all local rows" semantics for `RESOURCE_CREATE` / `RESOURCE_INVALIDATE`. It must delete the resource's existing rows before inserting, or a shrinking resource leaves orphans behind. Use `idb.bulkPut` for the insert — a tafsir is up to 6,236 rows and a single transaction of that size fails on some WebViews.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/sync-store.service.test.ts`:

```ts
import "fake-indexeddb/auto";
import {
  putRows,
  deleteRow,
  readResourceRows,
  replaceResourceRows,
  purgeResource,
  countResourceRows,
} from "./sync-store.service";
import { SyncRow } from "./content-sync.types";
import { idb } from "../storage/idb.service";

function row(resourceId: number, key: string, text: string): SyncRow {
  return {
    id: `tafsirs:${resourceId}:tafsir:${key}`,
    resourceGroup: "tafsirs",
    resourceId,
    recordType: "tafsir",
    recordKey: key,
    data: { text },
    sequence: 1,
  };
}

beforeEach(async () => {
  await idb.clear("content_sync");
});

describe("sync store", () => {
  it("writes and reads back a resource's rows", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(2);
  });

  it("isolates resources from each other", async () => {
    await putRows([row(169, "1:1", "a"), row(15, "1:1", "b")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("a");
  });

  it("upserts a row by composite key rather than duplicating", async () => {
    await putRows([row(169, "1:1", "old")]);
    await putRows([row(169, "1:1", "new")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("new");
  });

  it("deletes a single row", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await deleteRow("tafsirs", 169, "tafsir", "1:1");
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows.map((r) => r.recordKey)).toEqual(["1:2"]);
  });

  it("replaceResourceRows drops rows absent from the new set", async () => {
    // A shrinking resource must not leave orphans — this is what
    // RESOURCE_INVALIDATE's "replace all local rows" means.
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await replaceResourceRows("tafsirs", 169, [row(169, "1:1", "fresh")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("fresh");
  });

  it("replaceResourceRows leaves other resources untouched", async () => {
    await putRows([row(15, "1:1", "keep")]);
    await replaceResourceRows("tafsirs", 169, [row(169, "1:1", "new")]);
    expect(await countResourceRows("tafsirs", 15)).toBe(1);
  });

  it("purges a resource entirely", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await purgeResource("tafsirs", 169);
    expect(await countResourceRows("tafsirs", 169)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false sync-store`
Expected: FAIL — cannot resolve `./sync-store.service`.

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/sync/sync-store.service.ts`:

```ts
/**
 * The Content Sync row store.
 *
 * One uniform shape for every resource group, mirroring the composite key the
 * API's ROW mutations address records by. The engine writes here knowing
 * nothing about tafsirs vs recitations; adapters read in their own shape.
 */

import { idb } from "../storage/idb.service";
import { SyncGroup, SyncRow } from "./content-sync.types";
import { rowId } from "./parse-mutation";

/** Chunked internally by idb.bulkPut — a tafsir runs to 6,236 rows. */
export async function putRows(rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) return;
  await idb.bulkPut("content_sync", rows);
}

export async function deleteRow(
  group: SyncGroup,
  resourceId: number,
  recordType: string,
  recordKey: string,
): Promise<void> {
  await idb.delete("content_sync", rowId(group, resourceId, recordType, recordKey));
}

export async function readResourceRows(
  group: SyncGroup,
  resourceId: number,
): Promise<SyncRow[]> {
  return idb.getAllByIndex<SyncRow>("content_sync", "by_resource", [
    group,
    resourceId,
  ]);
}

export async function countResourceRows(
  group: SyncGroup,
  resourceId: number,
): Promise<number> {
  return (await readResourceRows(group, resourceId)).length;
}

/**
 * "Replace all local rows" — the semantics of RESOURCE_CREATE and
 * RESOURCE_INVALIDATE. Deletes first so a resource that shrank does not leave
 * orphaned rows behind.
 */
export async function replaceResourceRows(
  group: SyncGroup,
  resourceId: number,
  rows: SyncRow[],
): Promise<void> {
  await purgeResource(group, resourceId);
  await putRows(rows);
}

export async function purgeResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  const existing = await readResourceRows(group, resourceId);
  for (const r of existing) {
    await idb.delete("content_sync", r.id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false sync-store`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/sync/
git commit -m "add Content Sync row store"
```

---

### Task 5: API client — sync and snapshot fetchers

**Files:**
- Modify: `src/app/core/services/api/quran-api.client.ts`

**Interfaces:**
- Consumes: the file's existing private `apiFetch`, `getAccessToken`, `timedFetch`, `assertMaybeOnline`, `QuranApiError`, `QuranApiOffline`, and the module constants `CONTENT_API_BASE` / `CLIENT_ID_HEADER`
- Produces:
  - `export async function fetchSyncPage(params: { resources: string; bootstrap?: boolean; syncToken?: string; perPage?: number }): Promise<unknown>` — the raw body, parsed by `parseSyncPage`
  - `export async function fetchSnapshot(url: string): Promise<{ records: unknown[]; syncSequence: number }>`
  - `export const CONTENT_API_BASE_URL: string` — re-export so `resolveSnapshotUrl` can be called without re-reading env

**Context:** Auth already works here — reuse it, do not add new token code. Two wrinkles:

1. Snapshots are large (tafsir ~11.8 MB) and the module's `REQUEST_TIMEOUT_MS` is 4000 ms, tuned for small JSON on a bad connection. A snapshot will exceed it on any real network. `fetchSnapshot` must pass a longer timeout (use 120000).
2. `apiFetch` builds its URL from `CONTENT_API_BASE + path`. `fetchSnapshot` receives an already-absolute URL from `resolveSnapshotUrl`, so it cannot use `apiFetch` — write it against `timedFetch` directly, with the same headers and the same 401-retry.

- [ ] **Step 1: Add the fetchers**

Append to `quran-api.client.ts`, before the final export block:

```ts
// ─── Content Sync ─────────────────────────────────────────────────────────────

/** Exposed so callers can resolve the API's relative snapshot_url values. */
export const CONTENT_API_BASE_URL = CONTENT_API_BASE;

/**
 * One page of the sync feed. Returns the raw body — parsing lives in
 * parse-mutation.ts, the single wire boundary.
 *
 * `resources` is required by the endpoint; omitting it is a 422.
 */
export async function fetchSyncPage(params: {
  resources: string;
  bootstrap?: boolean;
  syncToken?: string;
  perPage?: number;
}): Promise<unknown> {
  return apiFetch<unknown>("/resources/sync", {
    resources: params.resources,
    bootstrap: params.bootstrap ? "true" : undefined,
    sync_token: params.syncToken,
    per_page: params.perPage,
  });
}

/**
 * A resource snapshot: every current row for one resource.
 *
 * Takes an absolute URL (from resolveSnapshotUrl) rather than a path, so it
 * cannot go through apiFetch. Payloads are large — a tafsir snapshot measured
 * ~11.8 MB — so the module's 4 s default timeout would abort every call.
 */
export async function fetchSnapshot(
  url: string,
): Promise<{ records: unknown[]; syncSequence: number }> {
  assertMaybeOnline();

  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < 2) {
    attempt++;
    try {
      const token = await getAccessToken(attempt > 1);
      const res = await timedFetch(
        url,
        {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
            "x-auth-token": token,
            ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
          },
        },
        120000,
      );

      if (res.status === 401 && attempt === 1) {
        tokenState = null;
        continue;
      }
      if (!res.ok) {
        throw new QuranApiError(res.status, `snapshot failed: ${res.status}`);
      }
      const body = (await res.json()) as {
        records?: unknown[];
        sync_sequence?: number;
      };
      return {
        records: body.records ?? [],
        syncSequence: Number(body.sync_sequence ?? 0),
      };
    } catch (err) {
      lastErr = err;
      if (isNetworkFailure(err)) {
        markOffline();
        throw new QuranApiOffline();
      }
      if (attempt >= 2) throw err;
    }
  }
  throw lastErr ?? new QuranApiError(0, "snapshot failed");
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output. If `tokenState`, `isNetworkFailure`, `markOffline`, `getAccessToken`, `timedFetch` or `assertMaybeOnline` are reported as undefined, they are declared later in the file than your insertion point — move the block below them.

- [ ] **Step 3: Run the full suite to confirm nothing regressed**

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/api/quran-api.client.ts
git commit -m "add Content Sync fetchers to the API client"
```

---

### Task 6: The sync engine

**Files:**
- Create: `src/app/core/services/sync/content-sync.service.ts`
- Test: `src/app/core/services/sync/content-sync.service.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5
- Produces:
  - `async function runSync(opts?: { force?: boolean }): Promise<SyncResult>`
  - `async function bootstrapResource(group: SyncGroup, resourceId: number, onProgress?: (pct: number) => void): Promise<void>`
  - `async function getSyncStatus(): Promise<SyncState>`
  - `interface SyncResult { ran: boolean; reason?: "throttled" | "no-resources" | "offline"; applied: number; }`
  - `const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000`
  - `function registerAdapter(group: SyncGroup, adapter: SyncAdapter): void`
  - `interface SyncAdapter { toRows(records: unknown[], resourceId: number, sequence: number): SyncRow[]; onInvalidate?(resourceId: number): Promise<void>; }`

**Context — the correctness rules this task exists to enforce:**

1. **Bootstrap fetches the snapshot directly.** Verified on the live API: bootstrap returns **zero mutations** for most resources (all 12 recitations, tafsirs 16 and 926) even though every one has a full snapshot. Relying on the feed would track a resource holding zero rows.
2. **`syncToken` and `lastSyncedAt` advance only after the final page.** If a run dies mid-pagination, keep the old token and redo the window. Mutations are ordered by `sequence` and applied ascending, so replay is safe; advancing early loses changes permanently.
3. **Offline is not a failure.** `QuranApiOffline` records `lastAttemptAt` and returns quietly with `lastError` untouched.
4. **A 4xx on an incremental sync means the token is dead.** Clear it and re-bootstrap tracked resources next run. Undocumented, so this is the defensive stance.
5. **Empty tracked list → skip.** `resources` is required; never call with an empty filter.

Adapters are registered rather than imported, so the engine keeps no dependency on either group.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/content-sync.service.test.ts`:

```ts
import "fake-indexeddb/auto";
import {
  runSync,
  bootstrapResource,
  registerAdapter,
  SYNC_INTERVAL_MS,
} from "./content-sync.service";
import { readSyncState, writeSyncState, trackResource } from "./sync-state.service";
import { readResourceRows } from "./sync-store.service";
import { EMPTY_SYNC_STATE, SyncRow } from "./content-sync.types";
import { idb } from "../storage/idb.service";
import * as api from "../api/quran-api.client";

jest.mock("../api/quran-api.client", () => ({
  __esModule: true,
  CONTENT_API_BASE_URL: "https://apis.quran.foundation/content/api/v4",
  fetchSyncPage: jest.fn(),
  fetchSnapshot: jest.fn(),
  QuranApiOffline: class QuranApiOffline extends Error {
    status = 0;
  },
  QuranApiError: class QuranApiError extends Error {
    constructor(public status: number, msg: string) {
      super(msg);
    }
  },
}));

const mockSync = api.fetchSyncPage as jest.Mock;
const mockSnap = api.fetchSnapshot as jest.Mock;

// A trivial adapter: one row per record, keyed by its verse_key.
registerAdapter("tafsirs", {
  toRows: (records, resourceId, sequence): SyncRow[] =>
    (records as { verse_key: string; text: string }[]).map((r) => ({
      id: `tafsirs:${resourceId}:tafsir:${r.verse_key}`,
      resourceGroup: "tafsirs",
      resourceId,
      recordType: "tafsir",
      recordKey: r.verse_key,
      data: { text: r.text },
      sequence,
    })),
});

function page(over: Record<string, unknown> = {}) {
  return {
    sync: {
      sync_until_sequence: 100,
      has_more: false,
      next_page_url: null,
      next_sync_token: "tok-final",
      mutations: [],
      ...over,
    },
  };
}

beforeEach(async () => {
  await idb.clear("sync_meta");
  await idb.clear("content_sync");
  jest.clearAllMocks();
});

describe("bootstrapResource", () => {
  it("fetches the snapshot directly even when the feed has no mutations", async () => {
    // The live API returns zero mutations for most resources. If bootstrap
    // trusted the feed, the resource would be tracked holding no rows.
    mockSync.mockResolvedValue(page());
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "alpha" }],
      syncSequence: 42,
    });

    await bootstrapResource("tafsirs", 169);

    expect(mockSnap).toHaveBeenCalled();
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    const state = await readSyncState();
    expect(state.trackedResources[0].bootstrappedAt).toBeGreaterThan(0);
  });

  it("leaves bootstrappedAt null when the snapshot fails", async () => {
    mockSnap.mockRejectedValue(new Error("boom"));
    await expect(bootstrapResource("tafsirs", 169)).rejects.toThrow();
    const state = await readSyncState();
    expect(state.trackedResources[0].bootstrappedAt).toBeNull();
  });
});

describe("runSync", () => {
  it("skips when no resources are tracked", async () => {
    const res = await runSync();
    expect(res).toMatchObject({ ran: false, reason: "no-resources" });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("skips inside the throttle window", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - 1000,
    });
    const res = await runSync();
    expect(res).toMatchObject({ ran: false, reason: "throttled" });
  });

  it("runs when forced inside the throttle window", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - 1000,
    });
    mockSync.mockResolvedValue(page());
    const res = await runSync({ force: true });
    expect(res.ran).toBe(true);
  });

  it("runs once the throttle window has elapsed", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - SYNC_INTERVAL_MS - 1,
    });
    mockSync.mockResolvedValue(page());
    expect((await runSync()).ran).toBe(true);
  });

  it("applies ROW mutations in ascending sequence regardless of arrival order", async () => {
    await trackResource("tafsirs", 169);
    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 2,
            type: "ROW_UPDATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: "tafsir",
            record_key: "1:1",
            data: { text: "second" },
          },
          {
            sequence: 1,
            type: "ROW_CREATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: "tafsir",
            record_key: "1:1",
            data: { text: "first" },
          },
        ],
      }),
    );

    await runSync({ force: true });

    const rows = await readResourceRows("tafsirs", 169);
    // Out-of-order application would leave "first" as the survivor.
    expect((rows[0].data as { text: string }).text).toBe("second");
  });

  it("persists the token only from the final page", async () => {
    await trackResource("tafsirs", 169);
    mockSync
      .mockResolvedValueOnce(
        page({ has_more: true, next_sync_token: "tok-page-1" }),
      )
      .mockResolvedValueOnce(
        page({ has_more: false, next_sync_token: "tok-page-2" }),
      );

    await runSync({ force: true });

    expect((await readSyncState()).syncToken).toBe("tok-page-2");
  });

  it("keeps the old token and lastSyncedAt when a mid-run page fails", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      syncToken: "tok-old",
      lastSyncedAt: 5000,
    });
    mockSync
      .mockResolvedValueOnce(
        page({ has_more: true, next_sync_token: "tok-page-1" }),
      )
      .mockRejectedValueOnce(new Error("network died"));

    await runSync({ force: true });

    const s = await readSyncState();
    // Advancing early would silently lose every change in the missed window.
    expect(s.syncToken).toBe("tok-old");
    expect(s.lastSyncedAt).toBe(5000);
    expect(s.lastError).toContain("network died");
  });

  it("treats offline as a non-event, not an error", async () => {
    await trackResource("tafsirs", 169);
    mockSync.mockRejectedValue(new api.QuranApiOffline());

    const res = await runSync({ force: true });

    const s = await readSyncState();
    expect(res).toMatchObject({ ran: false, reason: "offline" });
    expect(s.lastError).toBeNull();
    expect(s.lastAttemptAt).toBeGreaterThan(0);
  });

  it("clears a rejected sync token so the next run re-bootstraps", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({ ...(await readSyncState()), syncToken: "stale" });
    mockSync.mockRejectedValue(new api.QuranApiError(400, "bad sync_token"));

    await runSync({ force: true });

    // Token lifetime is undocumented; a dead token must self-heal rather than
    // wedge sync permanently.
    expect((await readSyncState()).syncToken).toBeNull();
  });

  it("purges rows and untracks on RESOURCE_DELETE", async () => {
    await trackResource("tafsirs", 169);
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "x" }],
      syncSequence: 1,
    });
    await bootstrapResource("tafsirs", 169);

    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 9,
            type: "RESOURCE_DELETE",
            resource_group: "tafsirs",
            resource_id: 169,
          },
        ],
      }),
    );
    await runSync({ force: true });

    expect(await readResourceRows("tafsirs", 169)).toHaveLength(0);
    expect((await readSyncState()).trackedResources).toHaveLength(0);
  });

  it("refetches the snapshot on RESOURCE_INVALIDATE", async () => {
    await trackResource("tafsirs", 169);
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "corrected" }],
      syncSequence: 10,
    });
    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 10,
            type: "RESOURCE_INVALIDATE",
            resource_group: "tafsirs",
            resource_id: 169,
            snapshot_url: "/api/v4/resources/snapshots/tafsirs/169",
          },
        ],
      }),
    );

    await runSync({ force: true });

    const rows = await readResourceRows("tafsirs", 169);
    expect((rows[0].data as { text: string }).text).toBe("corrected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false content-sync.service`
Expected: FAIL — cannot resolve `./content-sync.service`.

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/sync/content-sync.service.ts`:

```ts
/**
 * THE CONTENT SYNC ENGINE.
 *
 * Fetches the sync feed, applies mutations in sequence order, and persists the
 * checkpoint. Knows nothing about tafsirs or recitations — groups register an
 * adapter that converts snapshot records into rows.
 *
 * Satisfies Developer Terms §3.1(3)(b): retained content is maintained through
 * Content Sync rather than expiring after one week. See
 * docs/superpowers/specs/2026-08-21-content-sync-design.md.
 */

import {
  CONTENT_API_BASE_URL,
  QuranApiError,
  QuranApiOffline,
  fetchSnapshot,
  fetchSyncPage,
} from "../api/quran-api.client";
import { parseSyncPage, resolveSnapshotUrl } from "./parse-mutation";
import {
  markBootstrapped,
  readSyncState,
  resourcesFilter,
  trackResource,
  untrackResource,
  writeSyncState,
} from "./sync-state.service";
import {
  deleteRow,
  purgeResource,
  putRows,
  replaceResourceRows,
} from "./sync-store.service";
import {
  SyncGroup,
  SyncMutation,
  SyncRow,
  SyncState,
} from "./content-sync.types";

/** 24 h against a 7-day obligation — six missed windows of headroom. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const PER_PAGE = 200;

export interface SyncResult {
  ran: boolean;
  reason?: "throttled" | "no-resources" | "offline";
  applied: number;
}

export interface SyncAdapter {
  /** Convert a snapshot's records into rows. */
  toRows(records: unknown[], resourceId: number, sequence: number): SyncRow[];
  /** Optional side effect when a resource's content is replaced or removed. */
  onInvalidate?(resourceId: number): Promise<void>;
}

const adapters = new Map<SyncGroup, SyncAdapter>();

export function registerAdapter(group: SyncGroup, adapter: SyncAdapter): void {
  adapters.set(group, adapter);
}

function adapterFor(group: SyncGroup): SyncAdapter {
  const a = adapters.get(group);
  if (!a) throw new Error(`no sync adapter registered for "${group}"`);
  return a;
}

/** Guards against a resume and a visibilitychange both firing a run. */
let inflight: Promise<SyncResult> | null = null;

export async function getSyncStatus(): Promise<SyncState> {
  return readSyncState();
}

/**
 * Load a resource's full content and start tracking it.
 *
 * Goes to the snapshot endpoint directly rather than through the sync feed:
 * verified against the live API, bootstrap returns no mutations for most
 * resources even though they all have snapshots, so trusting the feed would
 * leave the resource tracked while holding zero rows.
 */
export async function bootstrapResource(
  group: SyncGroup,
  resourceId: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  await trackResource(group, resourceId);
  onProgress?.(10);

  const url = resolveSnapshotUrl(
    `/api/v4/resources/snapshots/${group}/${resourceId}`,
    CONTENT_API_BASE_URL,
  );
  const snap = await fetchSnapshot(url);
  onProgress?.(70);

  const rows = adapterFor(group).toRows(
    snap.records,
    resourceId,
    snap.syncSequence,
  );
  await replaceResourceRows(group, resourceId, rows);
  onProgress?.(95);

  await markBootstrapped(group, resourceId);
  onProgress?.(100);
}

export async function runSync(opts?: { force?: boolean }): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = doRun(opts?.force ?? false).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRun(force: boolean): Promise<SyncResult> {
  const state = await readSyncState();

  if (state.trackedResources.length === 0) {
    return { ran: false, reason: "no-resources", applied: 0 };
  }
  if (
    !force &&
    state.lastSyncedAt !== null &&
    Date.now() - state.lastSyncedAt < SYNC_INTERVAL_MS
  ) {
    return { ran: false, reason: "throttled", applied: 0 };
  }

  const filter = resourcesFilter(state.trackedResources);
  let applied = 0;
  let token = state.syncToken;
  let finalToken: string | null = null;

  try {
    let hasMore = true;
    let first = true;
    while (hasMore) {
      const body = await fetchSyncPage({
        resources: filter,
        bootstrap: token === null && first ? true : undefined,
        syncToken: token ?? undefined,
        perPage: PER_PAGE,
      });
      first = false;
      const parsed = parseSyncPage(body);

      // Ascending sequence: the API's stated contract, and the reason a failed
      // run can be safely replayed from the old token.
      const ordered = [...parsed.mutations].sort(
        (a, b) => a.sequence - b.sequence,
      );
      for (const m of ordered) {
        await applyMutation(m);
        applied++;
      }

      hasMore = parsed.hasMore;
      finalToken = parsed.nextSyncToken;
      token = parsed.nextSyncToken ?? token;
    }
  } catch (err) {
    return handleRunError(err, state);
  }

  // Only now — a mid-run failure above leaves the previous checkpoint intact.
  await writeSyncState({
    ...(await readSyncState()),
    syncToken: finalToken ?? state.syncToken,
    lastSyncedAt: Date.now(),
    lastAttemptAt: Date.now(),
    lastError: null,
  });

  return { ran: true, applied };
}

async function handleRunError(
  err: unknown,
  before: SyncState,
): Promise<SyncResult> {
  const now = Date.now();

  // Offline is not a sync failure — the user simply has no connection.
  if (err instanceof QuranApiOffline) {
    await writeSyncState({
      ...(await readSyncState()),
      lastAttemptAt: now,
      lastError: null,
    });
    return { ran: false, reason: "offline", applied: 0 };
  }

  // A 4xx on an incremental run means the token is no longer valid. Its
  // lifetime is undocumented, so clear it and let the next run re-bootstrap
  // rather than wedging sync permanently.
  const rejectedToken =
    err instanceof QuranApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    before.syncToken !== null;

  await writeSyncState({
    ...(await readSyncState()),
    syncToken: rejectedToken ? null : before.syncToken,
    lastAttemptAt: now,
    lastError: err instanceof Error ? err.message : String(err),
  });

  return { ran: false, applied: 0 };
}

async function applyMutation(m: SyncMutation): Promise<void> {
  switch (m.type) {
    case "RESOURCE_CREATE":
    case "RESOURCE_INVALIDATE": {
      const url = resolveSnapshotUrl(
        m.snapshotUrl ??
          `/api/v4/resources/snapshots/${m.resourceGroup}/${m.resourceId}`,
        CONTENT_API_BASE_URL,
      );
      const snap = await fetchSnapshot(url);
      const rows = adapterFor(m.resourceGroup).toRows(
        snap.records,
        m.resourceId,
        snap.syncSequence,
      );
      await replaceResourceRows(m.resourceGroup, m.resourceId, rows);
      await adapters.get(m.resourceGroup)?.onInvalidate?.(m.resourceId);
      return;
    }

    case "RESOURCE_DELETE": {
      await purgeResource(m.resourceGroup, m.resourceId);
      await adapters.get(m.resourceGroup)?.onInvalidate?.(m.resourceId);
      // tracked ⟺ rows on disk: the rows are gone, so the tracking goes too.
      await untrackResource(m.resourceGroup, m.resourceId);
      return;
    }

    case "RESOURCE_UPDATE":
      // Freshness marker only — the rows we hold are still current.
      return;

    case "ROW_CREATE":
    case "ROW_UPDATE": {
      if (!m.recordType || !m.recordKey) return;
      await putRows([
        {
          id: `${m.resourceGroup}:${m.resourceId}:${m.recordType}:${m.recordKey}`,
          resourceGroup: m.resourceGroup,
          resourceId: m.resourceId,
          recordType: m.recordType,
          recordKey: m.recordKey,
          data: m.data,
          sequence: m.sequence,
        },
      ]);
      return;
    }

    case "ROW_DELETE": {
      if (!m.recordType || !m.recordKey) return;
      await deleteRow(
        m.resourceGroup,
        m.resourceId,
        m.recordType,
        m.recordKey,
      );
      return;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false content-sync.service`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/sync/
git commit -m "add Content Sync engine"
```

---

### Task 7: Tafsir adapter and offline reads

**Files:**
- Create: `src/app/core/services/sync/adapters/tafsirs.adapter.ts`
- Test: `src/app/core/services/sync/adapters/tafsirs.adapter.test.ts`
- Modify: `src/app/core/services/data/tafsir-cache.service.ts`

**Interfaces:**
- Consumes: `registerAdapter` from `../content-sync.service`; `readResourceRows` from `../sync-store.service`; `SyncRow` from `../content-sync.types`
- Produces:
  - `function tafsirRowsFrom(records: unknown[], resourceId: number, sequence: number): SyncRow[]`
  - `async function readCachedTafsir(resourceId: number, verseKey: string): Promise<string | null>`
  - `async function hasCachedTafsir(resourceId: number): Promise<boolean>`
  - side effect: registers the `tafsirs` adapter on import

**Context — the range problem.** A tafsir record does **not** map one-to-one onto verses. Verified record fields:

```
verse_key: "1:1", text: "…", group_verse_key_from: "1:1",
group_verse_key_to: "1:1", group_verses_count: 1, updated_at, …
```

`group_verse_key_from`/`_to` can span a range — one commentary covering 2:1–2:5. Storing only under `verse_key` would leave 2:2–2:5 with no tafsir even though the content is present. Expand the range into one row per covered verse, all sharing the same text.

Verse keys are `"{surah}:{ayah}"`; both bounds are always within one surah.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/adapters/tafsirs.adapter.test.ts`:

```ts
import "fake-indexeddb/auto";
import { tafsirRowsFrom, readCachedTafsir, hasCachedTafsir } from "./tafsirs.adapter";
import { putRows } from "../sync-store.service";
import { idb } from "../../storage/idb.service";

beforeEach(async () => {
  await idb.clear("content_sync");
});

describe("tafsirRowsFrom", () => {
  it("creates one row per verse for a single-verse record", () => {
    const rows = tafsirRowsFrom(
      [{ verse_key: "1:1", text: "bismillah", group_verse_key_from: "1:1", group_verse_key_to: "1:1" }],
      169,
      7,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("tafsirs:169:tafsir:1:1");
    expect(rows[0].sequence).toBe(7);
  });

  it("expands a grouped record across every verse in its range", () => {
    // One commentary covering 2:1-2:5. Storing only under verse_key would
    // leave 2:2-2:5 blank despite the text being present.
    const rows = tafsirRowsFrom(
      [{ verse_key: "2:1", text: "on the opening", group_verse_key_from: "2:1", group_verse_key_to: "2:5" }],
      169,
      1,
    );
    expect(rows.map((r) => r.recordKey)).toEqual(["2:1", "2:2", "2:3", "2:4", "2:5"]);
    expect(new Set(rows.map((r) => (r.data as { text: string }).text)).size).toBe(1);
  });

  it("falls back to verse_key when the group bounds are missing", () => {
    const rows = tafsirRowsFrom([{ verse_key: "3:7", text: "x" }], 169, 1);
    expect(rows.map((r) => r.recordKey)).toEqual(["3:7"]);
  });

  it("skips records with no usable verse key", () => {
    const rows = tafsirRowsFrom([{ text: "orphan" }], 169, 1);
    expect(rows).toHaveLength(0);
  });
});

describe("readCachedTafsir", () => {
  it("returns the stored text for a verse", async () => {
    await putRows(tafsirRowsFrom([{ verse_key: "1:1", text: "hello" }], 169, 1));
    expect(await readCachedTafsir(169, "1:1")).toBe("hello");
  });

  it("returns null for a verse with no cached row", async () => {
    expect(await readCachedTafsir(169, "9:9")).toBeNull();
  });

  it("hasCachedTafsir reflects whether any rows are present", async () => {
    expect(await hasCachedTafsir(169)).toBe(false);
    await putRows(tafsirRowsFrom([{ verse_key: "1:1", text: "hi" }], 169, 1));
    expect(await hasCachedTafsir(169)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false tafsirs.adapter`
Expected: FAIL — cannot resolve `./tafsirs.adapter`.

- [ ] **Step 3: Write the adapter**

Create `src/app/core/services/sync/adapters/tafsirs.adapter.ts`:

```ts
/**
 * Tafsir adapter.
 *
 * Tafsir records can cover a verse RANGE, not a single verse
 * (group_verse_key_from / group_verse_key_to). A record for 2:1-2:5 is
 * expanded into five rows sharing one text, so a lookup for 2:3 finds it.
 */

import { registerAdapter } from "../content-sync.service";
import { readResourceRows } from "../sync-store.service";
import { SyncRow } from "../content-sync.types";

interface TafsirRecord {
  verse_key?: string;
  text?: string;
  group_verse_key_from?: string | null;
  group_verse_key_to?: string | null;
}

/** ["2", 5] from "2:5"; null when unparseable. */
function splitKey(key: string): { surah: string; ayah: number } | null {
  const [s, a] = key.split(":");
  const ayah = Number(a);
  if (!s || !Number.isFinite(ayah)) return null;
  return { surah: s, ayah };
}

/** Every verse key from `from` to `to` inclusive. Both bounds share a surah. */
function expandRange(from: string, to: string): string[] {
  const a = splitKey(from);
  const b = splitKey(to);
  if (!a || !b || a.surah !== b.surah || b.ayah < a.ayah) return [from];
  const out: string[] = [];
  for (let n = a.ayah; n <= b.ayah; n++) out.push(`${a.surah}:${n}`);
  return out;
}

export function tafsirRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const raw of records as TafsirRecord[]) {
    const anchor = raw.verse_key ?? raw.group_verse_key_from ?? null;
    if (!anchor) continue;
    const from = raw.group_verse_key_from ?? anchor;
    const to = raw.group_verse_key_to ?? from;
    const text = raw.text ?? "";
    for (const key of expandRange(from, to)) {
      rows.push({
        id: `tafsirs:${resourceId}:tafsir:${key}`,
        resourceGroup: "tafsirs",
        resourceId,
        recordType: "tafsir",
        recordKey: key,
        data: { text },
        sequence,
      });
    }
  }
  return rows;
}

export async function readCachedTafsir(
  resourceId: number,
  verseKey: string,
): Promise<string | null> {
  const rows = await readResourceRows("tafsirs", resourceId);
  const hit = rows.find((r) => r.recordKey === verseKey);
  const text = (hit?.data as { text?: string } | undefined)?.text;
  return text ?? null;
}

export async function hasCachedTafsir(resourceId: number): Promise<boolean> {
  const rows = await readResourceRows("tafsirs", resourceId);
  return rows.length > 0;
}

registerAdapter("tafsirs", { toRows: tafsirRowsFrom });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false tafsirs.adapter`
Expected: PASS, 7 tests.

- [ ] **Step 5: Make `isTafsirDownloaded` truthful**

In `tafsir-cache.service.ts`, the existing `isTafsirDownloaded(id)` returns true whenever the id is in a localStorage list — even though no text was ever stored. Add a real check alongside it, keeping the sync one for the fast render path:

```ts
import { hasCachedTafsir } from "../sync/adapters/tafsirs.adapter";

/**
 * The localStorage list records the user's INTENT to have a tafsir offline.
 * This asks whether the text is actually present — the two diverge when a
 * bootstrap is interrupted, and the UI should say "incomplete" rather than
 * claim a download that never finished.
 */
export async function isTafsirAvailableOffline(id: string): Promise<boolean> {
  if (!isTafsirDownloaded(id)) return false;
  return hasCachedTafsir(Number(id));
}
```

- [ ] **Step 6: Verify types and full suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output.

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/sync/ src/app/core/services/data/tafsir-cache.service.ts
git commit -m "add tafsir sync adapter with verse-range expansion"
```

---

### Task 8: Recitation adapter — eviction only

**Files:**
- Create: `src/app/core/services/sync/adapters/recitations.adapter.ts`
- Test: `src/app/core/services/sync/adapters/recitations.adapter.test.ts`

**Interfaces:**
- Consumes: `registerAdapter` from `../content-sync.service`; `SyncRow`
- Produces:
  - `function recitationRowsFrom(records: unknown[], resourceId: number, sequence: number): SyncRow[]`
  - `async function evictRecitation(resourceId: number): Promise<void>`
  - side effect: registers the `recitations` adapter on import

**Context — the boundary that must not move.** Recitations are the one group actually retaining content past a week today, so this is the compliance fix. But playback must not change:

- `fetchAudioForAyah` stays the source of truth for audio URLs. The synced rows are an **eviction index**, not a lookup table. Putting sync on the audio hot path is explicitly out of scope.
- Blobs live in two places: the IDB `audio` store (web/iOS) and `quran-audio/` files on Android. `usesFileCache()` in `audio-file-cache.service.ts` distinguishes them.
- Do **not** touch the Android cold-start queue or ExoPlayer's file access.

Verified record fields: `recitation_id`, `verse_key`, `url` (relative CDN path), `duration`, `format`, `mime_type`, `segments`, `record_type: "audio_file"`.

Eviction deletes cached blobs so the next play re-downloads corrected audio. Android eviction needs a device and is not unit-testable here — the test covers row mapping and the IDB path only.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/sync/adapters/recitations.adapter.test.ts`:

```ts
import "fake-indexeddb/auto";
import { recitationRowsFrom, evictRecitation } from "./recitations.adapter";
import { idb } from "../../storage/idb.service";

jest.mock("../../audio/audio-file-cache.service", () => ({
  __esModule: true,
  usesFileCache: () => false,
}));

beforeEach(async () => {
  await idb.clear("content_sync");
  await idb.clear("audio");
});

describe("recitationRowsFrom", () => {
  it("maps one row per verse, keyed by verse_key", () => {
    const rows = recitationRowsFrom(
      [
        { recitation_id: 7, verse_key: "1:1", url: "Alafasy/mp3/001001.mp3", duration: 6 },
        { recitation_id: 7, verse_key: "1:2", url: "Alafasy/mp3/001002.mp3", duration: 4 },
      ],
      7,
      3,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("recitations:7:audio_file:1:1");
    expect(rows[0].recordType).toBe("audio_file");
    expect((rows[0].data as { url: string }).url).toBe("Alafasy/mp3/001001.mp3");
  });

  it("skips records with no verse key", () => {
    expect(recitationRowsFrom([{ url: "x.mp3" }], 7, 1)).toHaveLength(0);
  });
});

describe("evictRecitation", () => {
  it("deletes only the named reciter's cached blobs", async () => {
    // Audio blob keys are `${reciter}:${sura}:${aya}` — see audio-cache.service.
    await idb.put("audio", { id: "7:1:1", blob: null, mime: "audio/mpeg" });
    await idb.put("audio", { id: "7:1:2", blob: null, mime: "audio/mpeg" });
    await idb.put("audio", { id: "4:1:1", blob: null, mime: "audio/mpeg" });

    await evictRecitation(7);

    const keys = await idb.getAllKeys("audio");
    expect(keys).toEqual(["4:1:1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false recitations.adapter`
Expected: FAIL — cannot resolve `./recitations.adapter`.

- [ ] **Step 3: Write the adapter**

Create `src/app/core/services/sync/adapters/recitations.adapter.ts`:

```ts
/**
 * Recitation adapter — WRITE SIDE ONLY.
 *
 * Playback is unchanged: fetchAudioForAyah remains the source of truth for
 * audio URLs, and the rows stored here are an eviction index, not a lookup
 * table. Putting the sync store on the audio hot path is deliberately out of
 * scope — see docs/superpowers/specs/2026-08-21-content-sync-design.md.
 *
 * Recitations are the one group that actually retains content past a week
 * today, so this is what brings them under §3.1(3)(b).
 */

import { idb } from "../../storage/idb.service";
import { usesFileCache } from "../../audio/audio-file-cache.service";
import { registerAdapter } from "../content-sync.service";
import { SyncRow } from "../content-sync.types";

interface RecitationRecord {
  recitation_id?: number;
  verse_key?: string;
  url?: string;
  duration?: number;
  format?: string;
  mime_type?: string;
  segments?: unknown;
}

export function recitationRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const raw of records as RecitationRecord[]) {
    if (!raw.verse_key) continue;
    rows.push({
      id: `recitations:${resourceId}:audio_file:${raw.verse_key}`,
      resourceGroup: "recitations",
      resourceId,
      recordType: "audio_file",
      recordKey: raw.verse_key,
      data: {
        url: raw.url ?? "",
        duration: raw.duration ?? 0,
        format: raw.format ?? "mp3",
        mimeType: raw.mime_type ?? "audio/mpeg",
        segments: raw.segments ?? null,
      },
      sequence,
    });
  }
  return rows;
}

/**
 * Drop every cached blob for one reciter so the next play re-downloads
 * corrected audio.
 *
 * Web/iOS keep blobs in the IDB `audio` store keyed `${reciter}:${sura}:${aya}`.
 * Android keeps one file per verse under `quran-audio/` instead; that path
 * needs a device and is verified manually.
 */
export async function evictRecitation(resourceId: number): Promise<void> {
  const prefix = `${resourceId}:`;
  const keys = await idb.getAllKeys("audio");
  for (const key of keys) {
    if (typeof key === "string" && key.startsWith(prefix)) {
      await idb.delete("audio", key);
    }
  }

  if (usesFileCache()) {
    // Android: files live under quran-audio/{reciter}_{sura}_{aya}.mp3.
    // Deleting them here would need the Filesystem plugin and a device to
    // verify; the cached files are re-fetched on demand, so a stale file is
    // corrected on the next play after the row data changes.
    // Tracked as a manual verification step in the plan.
  }
}

registerAdapter("recitations", {
  toRows: recitationRowsFrom,
  onInvalidate: evictRecitation,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false recitations.adapter`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/sync/
git commit -m "add recitation sync adapter for cache eviction"
```

---

### Task 9: Resume trigger

**Files:**
- Create: `src/app/core/hooks/useContentSync.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `runSync` from `../services/sync/content-sync.service`
- Produces: `function useContentSync(): void`

**Context:** Follow the existing pattern in `PlaybackContext.tsx:533-549` — `CapApp.addListener("resume")` for native plus `visibilitychange` for web, with the listener handle cleaned up on unmount. Both firing on Android is harmless: `runSync` self-throttles and has an in-flight guard.

Importing the adapters here is what registers them — the engine has no static dependency on either group, so something must pull them in. Do it at the top of the hook module.

- [ ] **Step 1: Write the hook**

Create `src/app/core/hooks/useContentSync.ts`:

```ts
/**
 * Drives Content Sync from the app lifecycle.
 *
 * Mounted once at the app root. Runs on cold start and whenever the app comes
 * back to the foreground; runSync() throttles to once per 24 h, so firing on
 * both the Capacitor resume and the WebView becoming visible is harmless.
 *
 * The adapter imports below are load-bearing: importing them is what registers
 * them with the engine.
 */

import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { runSync } from "../services/sync/content-sync.service";
import "../services/sync/adapters/tafsirs.adapter";
import "../services/sync/adapters/recitations.adapter";

export function useContentSync(): void {
  useEffect(() => {
    const attempt = () => {
      runSync().catch(() => {
        /* state records the failure; never surface it as a crash */
      });
    };

    attempt();

    const onVisible = () => {
      if (document.visibilityState === "visible") attempt();
    };
    document.addEventListener("visibilitychange", onVisible);

    let handle: { remove: () => void } | undefined;
    CapApp.addListener("resume", attempt)
      .then((h) => {
        handle = h;
      })
      .catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      handle?.remove();
    };
  }, []);
}
```

- [ ] **Step 2: Mount it in App.tsx**

Add the import beside the other core imports:

```ts
import { useContentSync } from "./app/core/hooks/useContentSync";
```

Then call it inside the same component that holds the existing `useEffect` blocks (around line 87), with the other hooks:

```ts
useContentSync();
```

- [ ] **Step 3: Verify types and suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output.

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/hooks/useContentSync.ts src/App.tsx
git commit -m "run Content Sync on app resume"
```

---

### Task 10: Tafsir reads from cache, and real download progress

**Files:**
- Modify: `src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx`
- Modify: `src/app/features/tafsir/TafsirSettings.tsx`
- Modify: `src/app/core/i18n/strings.ts`

**Interfaces:**
- Consumes: `readCachedTafsir` from the tafsir adapter; `bootstrapResource`, `getSyncStatus` from the engine; `untrackResource` from sync state; `purgeResource` from the row store

**Context:** Two user-visible changes.

**1. The sheet reads cache first.** `VerseActionSheet.tsx` currently calls `fetchTafsirForAyah` directly (~line 279 before the translation removal; find the tafsir fetch effect). Try the cache, fall back to the network only on a miss. This is what makes tafsir work offline.

**2. Downloading actually downloads.** `TafsirSettings.tsx`'s `handleSave` fakes it with a 400 ms `setTimeout` and then marks the tafsir downloaded — the flag has never meant anything. Replace it with a real `bootstrapResource` call carrying progress. Note a tafsir snapshot is ~11.8 MB, so this takes real time and the progress readout is not decorative.

`handleRemove` must also purge rows and untrack, maintaining `tracked ⟺ rows on disk`.

- [ ] **Step 1: Add the strings**

In `strings.ts`, add to the tafsir/mushaf section of the type declaration:

```ts
    tafsirDownloading: string;
    tafsirDownloadFailed: string;
    tafsirIncomplete: string;
```

Arabic values:

```ts
    tafsirDownloading: "جاري التنزيل…",
    tafsirDownloadFailed: "تعذّر التنزيل",
    tafsirIncomplete: "التنزيل غير مكتمل",
```

English values:

```ts
    tafsirDownloading: "Downloading…",
    tafsirDownloadFailed: "Download failed",
    tafsirIncomplete: "Download incomplete",
```

- [ ] **Step 2: Read tafsir from cache in the sheet**

In `VerseActionSheet.tsx`, add the import:

```ts
import { readCachedTafsir } from "../../../core/services/sync/adapters/tafsirs.adapter";
```

In the tafsir fetch effect, try the cache before the network:

```ts
    setTafsirLoading(true);
    setTafsirError(null);
    readCachedTafsir(Number(effectiveResourceId), currentKey)
      .then((cached) => {
        if (cancelled) return null;
        // Offline-first: a downloaded tafsir renders with no network at all.
        if (cached) {
          setTafsir(cached);
          return null;
        }
        return fetchTafsirForAyah(s, a, effectiveResourceId);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setTafsir(res.text);
      })
      .catch(() => {
        if (cancelled) return;
        setTafsirError(t.mushaf.tafsirError);
      })
      .finally(() => {
        if (!cancelled) setTafsirLoading(false);
      });
```

Keep the existing `cancelled` flag and cleanup exactly as they are.

- [ ] **Step 3: Make the download real**

In `TafsirSettings.tsx`, add imports:

```ts
import { bootstrapResource } from "../../core/services/sync/content-sync.service";
import { untrackResource } from "../../core/services/sync/sync-state.service";
import { purgeResource } from "../../core/services/sync/sync-store.service";
```

Add progress state beside the existing `saving` state:

```ts
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
```

Replace `handleSave` — the old version faked a 400 ms wait and never fetched anything:

```ts
  const handleSave = async (id: string) => {
    setSaving((prev) => new Set(prev).add(id));
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      // A tafsir snapshot runs to ~12 MB, so this is a real download and the
      // progress readout matters.
      await bootstrapResource("tafsirs", Number(id), (pct) =>
        setProgress((p) => ({ ...p, [id]: pct })),
      );
      addDownloadedTafsir(id);
      setDownloadedIds(getDownloadedTafsirIds());
    } catch {
      setFailed((prev) => new Set(prev).add(id));
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setProgress((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  };
```

Replace `handleRemove` so rows and tracking go together:

```ts
  const handleRemove = async (id: string) => {
    // tracked ⟺ rows on disk — never leave one without the other.
    await purgeResource("tafsirs", Number(id));
    await untrackResource("tafsirs", Number(id));
    removeDownloadedTafsir(id);
    setDownloadedIds(getDownloadedTafsirIds());
  };
```

Update the save button's label to show progress. Find the `onClick={() => handleSave(r.id)}` button and render, where it currently shows a saving state:

```tsx
{saving.has(r.id)
  ? `${t.mushaf.tafsirDownloading} ${progress[r.id] ?? 0}%`
  : failed.has(r.id)
    ? t.mushaf.tafsirDownloadFailed
    : existingLabel}
```

Replace `existingLabel` with whatever the button already renders in its idle state — do not change that text.

- [ ] **Step 4: Verify types and suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output.

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx src/app/features/tafsir/TafsirSettings.tsx src/app/core/i18n/strings.ts
git commit -m "read tafsir from the sync cache and download for real"
```

---

### Task 11: Settings sync status and manual control

**Files:**
- Modify: `src/app/features/settings/Settings.tsx`
- Modify: `src/app/features/settings/Settings.css`
- Modify: `src/app/core/i18n/strings.ts`

**Interfaces:**
- Consumes: `runSync`, `getSyncStatus` from the engine; `SyncState` from the types

**Context:** This is the surface that reveals a silent throttled sync failing for weeks, and the record of compliance if QF ever asks when Rafeeq last synced. Place the section between the Quran and Recite sections (around line 726 in `Settings.tsx`), using the existing `settings-section` / `settings-card` / `settings-row` markup. Do not invent new row components.

Button states, per the design:
- *Synced just now* / a relative date
- *Offline — will sync when connected* — **neutral**, not an error
- *Failed: {reason}*

- [ ] **Step 1: Add the strings**

Type declaration, in the settings section:

```ts
    sectionSync: string;
    syncLastSynced: string;
    syncNever: string;
    syncNow: string;
    syncRunning: string;
    syncOffline: string;
    syncFailed: string;
    syncTracked: string;
```

Arabic:

```ts
    sectionSync: "المحتوى دون اتصال",
    syncLastSynced: "آخر مزامنة",
    syncNever: "لم تتم المزامنة بعد",
    syncNow: "مزامنة الآن",
    syncRunning: "جاري المزامنة…",
    syncOffline: "دون اتصال — ستتم المزامنة عند الاتصال",
    syncFailed: "تعذّرت المزامنة",
    syncTracked: "المصادر المتتبَّعة",
```

English:

```ts
    sectionSync: "Offline content",
    syncLastSynced: "Last synced",
    syncNever: "Not synced yet",
    syncNow: "Sync now",
    syncRunning: "Syncing…",
    syncOffline: "Offline — will sync when connected",
    syncFailed: "Sync failed",
    syncTracked: "Tracked sources",
```

- [ ] **Step 2: Add state and the handler**

In `Settings.tsx`, add imports:

```ts
import { runSync, getSyncStatus } from "../../core/services/sync/content-sync.service";
import type { SyncState } from "../../core/services/sync/content-sync.types";
```

Add state beside the other `useState` calls:

```ts
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
```

Load the status on mount:

```ts
  useEffect(() => {
    getSyncStatus().then(setSyncState).catch(() => {});
  }, []);
```

Add the handler:

```ts
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await runSync({ force: true });
      // Offline is a neutral outcome, not a failure.
      if (res.reason === "offline") setSyncNote(ts.syncOffline);
      setSyncState(await getSyncStatus());
    } catch {
      setSyncNote(ts.syncFailed);
    } finally {
      setSyncing(false);
    }
  };
```

- [ ] **Step 3: Render the section**

Insert between the Quran section's closing `</div>` and the Recite section:

```tsx
            {/* ── Offline content (Content Sync) ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionSync}</p>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-icon">{ICONS.book}</span>
                    <div className="settings-row-text">
                      <p className="settings-row-label">{ts.syncLastSynced}</p>
                      <p className="settings-row-desc">
                        {syncState?.lastSyncedAt
                          ? new Date(syncState.lastSyncedAt).toLocaleDateString(
                              lang === "ar" ? "ar" : "en",
                              { year: "numeric", month: "short", day: "numeric" },
                            )
                          : ts.syncNever}
                      </p>
                    </div>
                  </div>
                  <div className="settings-row-controls">
                    <button
                      type="button"
                      className="settings-sync-btn"
                      onClick={handleSyncNow}
                      disabled={syncing}
                    >
                      {syncing ? ts.syncRunning : ts.syncNow}
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-text">
                      <p className="settings-row-label">{ts.syncTracked}</p>
                      <p className="settings-row-desc">
                        {syncState?.trackedResources.length ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
                {(syncNote || syncState?.lastError) && (
                  <div className="settings-row">
                    <p className="settings-sync-note">
                      {syncNote ?? `${ts.syncFailed}: ${syncState?.lastError}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
```

- [ ] **Step 4: Add the styles**

Append to `Settings.css`, following the file's existing token usage:

```css
/* ── Content Sync ─────────────────────────────────────────────────────────── */

.settings-sync-btn {
  background: transparent;
  border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.12));
  border-radius: var(--radius-md, 8px);
  padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--text-sm, 0.85rem);
  cursor: pointer;
}

.settings-sync-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.settings-sync-note {
  margin: 0;
  font-size: var(--text-sm, 0.85rem);
  color: var(--color-text-secondary, #6b7280);
}
```

- [ ] **Step 5: Verify types and suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output.

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/settings/Settings.tsx src/app/features/settings/Settings.css src/app/core/i18n/strings.ts
git commit -m "add Content Sync status and manual sync to Settings"
```

---

### Task 12: Bootstrap reciters on first cache, and final verification

**Files:**
- Modify: `src/app/core/services/audio/audio-cache.service.ts`

**Interfaces:**
- Consumes: `isTracked` from sync state; `bootstrapResource` from the engine

**Context:** A reciter becomes tracked the first time its audio is cached. Fire-and-forget — playback must never block on a sync call, and being offline at that moment is not an error (the resource is tracked, and the next successful run bootstraps it).

Find `downloadAndCache` in `audio-cache.service.ts` and hook the successful path.

- [ ] **Step 1: Track the reciter on first cache**

Add imports:

```ts
import { isTracked } from "../sync/sync-state.service";
import { bootstrapResource } from "../sync/content-sync.service";
```

Add the helper and call it after a successful cache write in `downloadAndCache`:

```ts
/**
 * Bring a reciter under Content Sync the first time we keep audio for it.
 * Fire-and-forget: playback must never wait on this, and being offline here is
 * fine — the resource is tracked and the next successful run bootstraps it.
 */
function ensureRecitationTracked(reciter: string): void {
  const id = Number(reciter);
  if (!Number.isFinite(id)) return;
  isTracked("recitations", id)
    .then((tracked) => {
      if (!tracked) return bootstrapResource("recitations", id);
    })
    .catch(() => {});
}
```

- [ ] **Step 2: Verify types and full suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^node_modules/"`
Expected: no output.

Run: `CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass, including every sync suite added in Tasks 1–8.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/audio/audio-cache.service.ts
git commit -m "track reciters for Content Sync on first cache"
```

- [ ] **Step 4: Hand off the manual checks**

These need a device or live network and are **not** covered by the suite. Report them to the user rather than attempting them:

1. **Live sync against the real API** — download a tafsir in Settings, confirm the progress readout advances and the text then renders with the network disabled.
2. **Android blob eviction** — `evictRecitation` clears the IDB `audio` store; the `quran-audio/` filesystem path on Android is stubbed and needs verifying on hardware.
3. **Pagination** — every observed response had `has_more: false`. The multi-page path is implemented but has never run against real data.
4. **`sync_token` expiry** — undocumented. The 4xx-clears-token path is defensive and unverified.

---

## Manual verification summary

| Check | Why it is not automated |
|---|---|
| Live sync end-to-end | Needs network + credentials |
| Offline tafsir render | Needs a real device/browser offline mode |
| Android audio eviction | Needs Capacitor Filesystem on hardware |
| Multi-page sync | Never observed; API returns single pages today |
| Token expiry recovery | Undocumented API behaviour |
