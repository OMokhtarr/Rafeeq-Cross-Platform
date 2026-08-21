# Content Sync — Design

Date: 2026-08-21
Status: Designed. Not yet implemented.

## Problem

Section 3.1(3)(b) of the Quran Foundation Developer Terms caps offline retention
of QF content at one week, unless the content is maintained through the Content
Sync APIs — synced at least every 7 days, with all available changes applied.

Rafeeq handles four kinds of QF content. Two of them are in scope here:

- tafsirs
- recitations

**Translations are being removed from the app entirely** (decision of
2026-08-21) — the panel, the tab, the settings, and the fetch layer all go. See
"Translation removal" below. Content that is never fetched is content that never
needs syncing, so translations leave the compliance surface altogether rather
than joining it.

The fourth — the Quran script and page-layout/glyph data from `/verses/by_page/`
— is **out of scope**. It is not a supported resource group, and on 2026-08-21
QF (Basit Minhas) granted Rafeeq express permission under Section 3.1(3)(a) to
retain it locally beyond one week until Content Sync supports it. See
"Related obligations" at the end.

### What is actually cached today

Verified against the code on 2026-08-21 (the `.understand-anything` knowledge
graph is from June and is stale here — it still lists a `quran-sdk-client.ts`
that no longer exists):

| Group | Retained offline today? | Where |
|---|---|---|
| Tafsirs | **No** for text | `tafsir-cache.service.ts` caches the resource *list* and a "downloaded" flag in localStorage. The text is fetched live in `VerseActionSheet`. |
| Recitations | **Yes** | IDB `audio` blobs (web/iOS) and `quran-audio/` files on Android. |
| Translations | **No** | `getPageTranslations` calls the API on every read; the IDB `translations` store exists but is never read or written. Being removed. |

So only recitations currently retain content past one week — they are the sole
present compliance gap. Tafsir text is not in breach; it simply has no offline
support. For tafsirs, this work is not a migration but the first implementation
of offline caching, built on the sync protocol from the start.

A consequence worth stating plainly: `isTafsirDownloaded()` currently returns
true for a tafsir whose text was never stored. The flag records intent, not
fact. This design makes it truthful.

## The API

`GET https://apis.quran.foundation/content/api/v4/resources/sync`

Authenticated with the same `x-auth-token` + `x-client-id` headers the existing
client already sends via the token broker.

- Bootstrap: `?bootstrap=true&resources=...&per_page=...`
- Incremental: `?sync_token=...&resources=...&per_page=...`
- Snapshots: `GET /resources/snapshots/{resource_group}/{resource_id}`

`resources` is a filter over specific resource ids, e.g.
`translations:19;tafsirs:151`. Supported groups are `translations`,
`word_by_word_translations`, `tafsirs`, `recitations`, `articles`.

Responses page via `has_more` / `next_page_url`. Each carries
`next_sync_token` (**store only from the final page**) and
`sync_until_sequence`. Mutations carry `sequence` and must be applied in
ascending order.

Mutation types:

| Type | Handling |
|---|---|
| `RESOURCE_CREATE` | Fetch `snapshot_url`, replace all local rows |
| `RESOURCE_INVALIDATE` | Fetch `snapshot_url`, replace all local rows |
| `RESOURCE_DELETE` | Purge rows, untrack the resource |
| `RESOURCE_UPDATE` | Freshness marker — keep existing rows |
| `ROW_CREATE` / `ROW_UPDATE` | Upsert by (`resource_group`, `resource_id`, `record_type`, `record_key`) |
| `ROW_DELETE` | Delete by the same key |

### Known gap in the documentation

The docs give no example response bodies, and say nothing about `sync_token`
lifetime or expiry. Mutation handling below is designed from the documented
description of each type; the exact JSON field nesting is **inferred**.

Mitigation: all wire parsing is isolated in a single `parseMutation` function so
a shape surprise is a one-function fix. Verify against a real bootstrap response
before building on top of it.

One documentation note relevant to the email thread: the anchor
`#content-available-for-offline-sync` now resolves, and lists **five** groups
including `word_by_word_translations`. Rafeeq does not use word-by-word
translations — every `wordFields` value in `mushaf.config.ts` is an Arabic
script variant (`code_v2`, `text_uthmani`, `text_indopak`, `text_imlaei`) plus
layout fields, which is script data covered by the 3.1(3)(a) permission. Neither
group is used by Rafeeq, so scope remains tafsirs and recitations.

## Architecture

A sync engine over a uniform row store, with per-group adapters.

The API's mutation vocabulary is already uniform — `resource_group`,
`resource_id`, `record_type`, `record_key` for every group. Mirroring that shape
in storage means applying a mutation is one upsert or delete, with the engine
knowing nothing about tafsirs vs recitations. Adding another group later is an
adapter, not engine surgery.

```
content-sync.service.ts     engine: fetch, paginate, order, apply, persist state
  adapters/tafsirs.ts       bootstrap + read path
  adapters/recitations.ts   write-side only: blob eviction on invalidate
```

Rejected alternatives:

- **Writing directly into each existing cache.** The mutation logic would need
  to know each storage shape, and `RESOURCE_INVALIDATE` ("replace all local
  rows") would mean deleting audio across two backends from inside the engine.
- **Full rewrite onto a normalized schema.** Cleanest end state, but it would
  touch the Android filesystem cache and the ExoPlayer cold-start queue — both
  working, both hard-won, both a bad thing to disturb before release.

## Storage

**IDB v8** adds two stores:

```
content_sync  keyPath "id"   →  `${group}:${resourceId}:${recordType}:${recordKey}`
sync_meta     keyPath "key"  →  single "state" record
```

Row shape: `{ id, resourceGroup, resourceId, recordType, recordKey, data, sequence }`.

Index on `[resourceGroup, resourceId]` — reads are always "every row for this
resource", and without the index each read scans the whole store (a full tafsir
runs to ~6,236 rows).

The v8 upgrade **deletes the `translations` store**, which the translation
removal leaves permanently dead. `pages`, `fonts`, `audio`, `verses`, `hifz`,
and `meta` are untouched — `pages`/`fonts` hold the script data covered by the
separate permission and must not change here.

Verse keys are not lexically ordered (`"2:10"` sorts before `"2:9"`), so reads
fetch a resource's rows through the index and build a `Map` keyed by verse key,
rather than attempting range queries. One indexed read per resource, then O(1)
lookups.

### Audio stays where it is

Recitation blobs remain in the IDB `audio` store (web/iOS) and `quran-audio/`
(Android). `content_sync` holds only recitation *metadata* rows. On invalidate,
the adapter deletes affected blobs from whichever backend is live and they
re-download on next play. This boundary keeps the Android cold-start path and
ExoPlayer's direct file access out of this change entirely.

### Storage cost

A full tafsir can run to tens of MB — considerably heavier per row than the
short verse texts of a translation. This is why bootstrap is per-selection
rather than eager, and why tafsir download shows progress rather than appearing
to hang.

## Sync state

One record in `sync_meta`. In IDB, not localStorage — it must live alongside the
rows it describes, and a partial write here corrupts sync correctness.

```ts
interface SyncState {
  syncToken: string | null;       // next_sync_token from the last COMPLETED run
  lastSyncedAt: number | null;    // epoch ms, last successful completion
  lastAttemptAt: number | null;   // epoch ms, success or failure
  lastError: string | null;
  trackedResources: TrackedResource[];  // { group, resourceId, bootstrappedAt }
}
```

### `lastSyncedAt` advances only on a fully completed run

The API says to persist `next_sync_token` only from the final page. If a run
dies on page 3, keep the old token and old timestamp; the next run redoes the
window. Mutations are ordered by `sequence` and applied in ascending order, so
replay is safe — whereas advancing the token early loses changes permanently
with no way to detect it.

### `trackedResources` tracks data, not selection

The sync scope is persisted, not derived from settings at call time. The
invariant is:

> **tracked ⟺ rows on disk.** Never one without the other.

Deriving the `resources` filter from live settings is simpler, but fails badly.
A user downloads tafsir 151, later downloads tafsir 168 and reads that instead,
but 151's rows are still on disk. They go offline for two weeks. QF issues a
correction to 151. Because 151 is no longer the active selection, it is not in
the filter, so the correction never arrives — and the next time the user opens
151, Rafeeq serves the uncorrected text indefinitely, with no signal and no
self-correction.

That is retained-but-unmaintained content: precisely what the 3.1(3)(b)
exception does not cover. For Qur'anic commentary specifically, serving text QF
has since corrected is worse than an ordinary staleness bug.

The cost of tracking independently is that scope only grows. Closing that loop:

- Untrack when rows are **deleted**, not when a selection changes.
- Explicit removal (user deletes a downloaded tafsir) → purge rows, untrack.
- `RESOURCE_DELETE` from the API → purge rows, untrack.
- **No time-based sweep.** Auto-deleting content a user may be relying on
  offline is its own hazard. YAGNI until there is evidence of real growth; the
  tracked count is visible in Settings so growth is observable.

Both designs can be made correct; they differ in how they fail. Derived-from-
settings fails silently and unfixably. Tracked-with-eviction fails as wasted
bandwidth — visible, cheap, and fixable without any user having read a wrong
ayah.

## Engine behaviour

```
runSync(opts?: { force?: boolean }): Promise<SyncResult>
bootstrapResource(group, resourceId): Promise<void>
getSyncState(): SyncState
```

**Throttle:** run when `force || now - lastSyncedAt > 24h`. Twenty-four hours
against a 7-day obligation leaves six missed windows of headroom.

**Concurrency:** a single in-flight guard, mirroring the `tokenInflight` pattern
already in `quran-api.client.ts`. Resume and `visibilitychange` both firing on
Android is therefore harmless.

**Errors**, reusing the client's existing vocabulary:

- `QuranApiOffline` — not a failure. Record `lastAttemptAt`, leave `lastError`
  null, return quietly. Being offline is not a sync error.
- `QuranApiError` — record the message in `lastError`.
- **Invalid/expired `sync_token`** — undocumented, so treat any 4xx on an
  incremental sync as "token no longer valid": clear it and re-bootstrap tracked
  resources on the next run. Self-healing; the alternative is being permanently
  stuck.

## Adapters

### Tafsirs

Read rows for `tafsirs:{resourceId}` through the index, build the verse-key map,
return the verse's text — replacing the live fetch at `VerseActionSheet.tsx:279`.
Falls back to the API only when the resource is not tracked (user selected a
tafsir while offline, never bootstrapped). The user-visible effect: tafsir works
offline for the first time.

`isTafsirDownloaded()` becomes a real query — tracked **and** rows present. The
existing localStorage list remains the user's *intent* to have the tafsir;
presence in the store is the *fact*. When they diverge (interrupted bootstrap),
Settings shows "download incomplete" and offers resume, instead of lying.

The tafsir resource *list* keeps its localStorage cache unchanged. It is a
catalogue, not retained content, and it is small.

### Recitations

No read-path change; playback continues through the existing caches. The adapter
is write-side only: on `RESOURCE_INVALIDATE` or `RESOURCE_DELETE`, delete the
affected cached blobs from the active backend so the next play re-downloads
corrected audio. This is what brings recitations — the one group actually
retaining content today — into compliance.

The synced recitation rows are **not** consulted when resolving an audio URL.
`fetchAudioForAyah` continues to be the source of truth for playback, exactly as
today. The rows exist so the engine can tell *which* blobs a mutation
invalidates; they are an eviction index, not a lookup table. If a future change
wants synced rows to drive URL resolution, that is a separate decision — making
it implicitly here would put the sync engine on the audio hot path, which this
design deliberately avoids.

## Triggers

`useContentSync()`, mounted once at app root, following the existing pattern in
`PlaybackContext.tsx:533-549`:

- `CapApp.addListener("resume")` — native
- `visibilitychange` — web
- once on mount — cold start

All call `runSync()`, which self-throttles.

**Bootstrap-on-selection**, two call sites, both fire-and-forget so no UI blocks
on the network:

- Tafsir downloaded in `TafsirSettings.tsx` → `bootstrapResource("tafsirs", id)`, with progress
- Reciter first cached → `bootstrapResource("recitations", id)`

Being offline at selection time is not an error: the resource is tracked, and
the next successful sync bootstraps it.

## Settings UI

A new section between Quran and Recite, using the existing
`settings-section` / `settings-card` / row components, with strings added to
`strings.ts` in EN and AR.

- Last synced — relative date, or "Never"
- Tracked resources count
- **Sync now** button, with a spinner while running

Button states carry real weight: this is the surface that reveals a silent
throttled sync failing for weeks.

- *Synced just now*
- *Offline — will sync when connected* (neutral, not an error)
- *Failed: {reason}*

The tracked-resources count is what makes unbounded tracking growth observable,
per the eviction decision above.

Follows the CSS rules in CLAUDE.md: no new scrollable containers, existing row
components, `var(--max-width-mobile, 600px)` inherited from the page wrapper.

## Translation removal

Translations are removed from Rafeeq entirely. This lands **first, as its own
commit**, before any sync work: it shrinks the surface the sync engine touches,
and mixing "delete a feature" with "add a subsystem" in one changeset makes both
harder to review and to revert.

Four parts:

1. **UI** — the translation tab in `VerseActionSheet.tsx` and the optional
   panel in `PageViewer.tsx`. With translations gone the sheet has one tab left,
   so the tab bar is removed and tafsir becomes a plain titled panel; a one-tab
   tab bar reads as broken.
2. **State** — the `translation` and `showTranslation` fields and their
   `rafiq_settings_v1` reads. Stale keys left in existing installs are harmless,
   so there is no migration.
3. **Data layer** — `getPageTranslations` (`quran.service.ts`),
   `fetchTranslationsByPage` in both `quran-api.client.ts` and
   `quran-data-provider.ts`, and the dead IDB `translations` store (dropped in
   the v8 upgrade).
4. **Copy** — the translation strings in `strings.ts` (EN + AR), and the legal
   text in `Account.tsx`. The privacy policy, third-party list, and attribution
   sections currently state that Rafeeq displays and caches translations. Once
   it does not, that copy is inaccurate and must be corrected — this is
   user-facing legal text, not incidental wording.

Explicitly **not** touched: `Azkar.tsx`, whose `zikr.translation` is its own
bundled content and unrelated to the QF translations API.

## Testing

TDD, engine before UI. Tests colocated, matching `mushaf-layout.test.ts` and
`backup.service.test.ts`.

- **Mutation application** — each of the seven types against a fake store;
  `RESOURCE_INVALIDATE` replaces all rows; ROW ops upsert/delete by composite key
- **Ordering** — applied in ascending `sequence` regardless of arrival order
- **Pagination** — token persisted only from the final page; mid-run failure
  leaves the old token and old `lastSyncedAt` intact
- **Throttle** — skips inside 24h, runs on `force`
- **Offline** — `QuranApiOffline` leaves `lastError` null, does not advance
  `lastSyncedAt`
- **Token recovery** — 4xx on incremental clears the token, re-bootstraps
- **Tracking** — untrack only on explicit removal or `RESOURCE_DELETE`; never on
  deselection

For the removal, the check is that the app builds and the viewer and verse sheet
render with no translation affordance and no dead imports.

Not covered by automated tests, to be checked manually on device:

- Live network calls against the real endpoint
- The Android filesystem blob-eviction path

## Non-goals

- **The Quran script.** Covered by the 3.1(3)(a) permission; `pages`/`fonts`
  are untouched. Revisit when QF adds script support to Content Sync.
- **`articles` and `word_by_word_translations`.** Not used by Rafeeq.
- **Translations.** Removed from the app rather than synced; see above. If
  translations are ever reinstated, they return as a third adapter — the engine
  needs no change to accommodate one.
- **Background scheduled sync.** A native periodic task would add a
  background-work permission and Play Store scrutiny right before release, to
  solve a problem that does not exist: the 7-day rule is conditioned on
  connectivity being available, and a user who has not opened Rafeeq in 7 days
  is not being served stale content. The engine has one entry point, so this
  can be added later as one extra caller.
- **Time-based eviction.** See the tracking decision above.

## Related obligations

Arising from the QF correspondence of 2026-08-15 → 2026-08-21, and not
satisfied by this design:

0. **Tell QF that translations are gone.** The 2026-08-15 email told Basit that
   translations, tafsirs, and recitations would all move onto Content Sync.
   Removing the feature is a stronger answer than syncing it, but if the thread
   continues it is worth a line saying Rafeeq no longer fetches or caches
   translations at all, rather than leaving him expecting that integration.
1. **Weekly documentation check.** QF asked that the Content Sync docs be
   checked approximately weekly for Quran script support. When it lands, migrate
   the script off the 3.1(3)(a) permission and onto Content Sync.
2. **The 3.1(3)(a) permission should be recorded in-repo.** It currently exists
   only as an email. It is scoped to the QF-provided script and page-layout/glyph
   data inside Rafeeq, and does not permit modification, sale, sublicensing,
   export, or redistribution.
3. **KFGQPC surah-header ornament — unresolved release blocker.** QF declined to
   rule on the traced ornament and deferred entirely to KFGQPC's terms. Contact
   with KFGQPC is still outstanding. Unrelated to this design, but it gates the
   same release.
4. **The "sync promptly on reconnect" reading is unconfirmed** for the syncable
   groups. QF confirmed offline readability only for the script, and via
   the separate 3.1(3)(a) grant. Do not assume it carries over: the 24h throttle
   is deliberately conservative for this reason.
