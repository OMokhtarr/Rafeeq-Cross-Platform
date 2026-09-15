# Scope — migrating QCF V4 page data onto Content Sync (`mushafs:19`)

Date: 2026-09-11 (API verification), 2026-09-15 (QF answers + implementation)
Status: **Implemented.** Written against live API responses (see "Verified
facts") and QF's 2026-09-14 clarification (`docs/licensing-decisions.md` §1a).

## As built

| Piece | Where |
|---|---|
| `mushafs` sync group | `sync/content-sync.types.ts` |
| Layout adapter + `onInvalidate` | `sync/adapters/mushafs.adapter.ts` |
| Single-row read | `readRow()` in `sync/sync-store.service.ts` |
| Two-source merge | `data/merge-layout.ts` |
| Layout lookup | `data/page-layout.ts` |
| Derived-cache eviction | `data/page-cache.ts` |
| First-run bootstrap | `sync/mushaf-bootstrap.ts`, driven from `hooks/useContentSync.ts` |
| §8 refresh policy | `sync/cache-freshness.ts`, `data/page-refresh.ts`, `api/font.loader.ts` |

Tests live in `__tests__/` folders beside each module.

## QF's answers — both blockers resolved

Basit Minhas confirmed on 2026-09-14, in the original thread:

| Question | Answer |
|---|---|
| Provenance of the three notices | All genuinely from QF; rollback superseded; `mushafs:19` stands |
| `font_asset` missing | A gap on QF's side. Keep caching CDN fonts locally; QF will notify if records land |
| Word-level `text_uthmani` | **No Content Sync resource carries it.** Keep using `/verses/by_page/` |
| Retention of both | Covered by the 2026-08-21 permission, while used only inside Rafeeq |

**Consequences for this spec:**

- §4 option (2) — "sync a word-text resource" — is **ruled out**. Option (1) is
  confirmed as the design, endorsed by QF rather than merely forced.
- §5's two-source merge is therefore **permanent**, not a stopgap. The
  `position_in_page` join key finding below is load-bearing.
- A **new obligation** arrives with the answer: the font files and the
  `/verses/by_page/` word text must be re-fetched at least every 7 days
  (ideally on the existing 24 h cadence). Content Sync does not do this for
  them — see §8.

## Why

`docs/licensing-decisions.md` §1 records QF's express permission to cache Quran
script and page-layout data beyond one week, framed as lasting *until* that
content is available through Content Sync. It is now available: `mushafs:19`
returns a live snapshot. Migrating moves the **page-layout** cache onto the
Developer Terms §3.1(3)(b) footing the rest of the app already uses.

It does **not** discharge §1. The fonts and the word-level Uthmani text stay
outside Content Sync by QF's own answer, and remain covered by the §1
permission — with the §8 refresh duty attached. See `licensing-decisions.md`
§1a.

## Verified facts (live API, 2026-09-11)

Base `https://apis.quran.foundation/content/api/v4`, using the app's own broker
token and headers `authorization` / `x-auth-token` / `x-client-id`.

- `GET /resources/snapshots/mushafs/19` → **200**. `name: "QCF V4 Tajweed"`,
  `pages_count: 604`, `lines_per_page: 15`, `default_font_name: "v4-tajweed"`,
  `mapping_mode: "reference"`, `qirat: {id:1, name:"Hafs"}`, `sync_sequence: 1399`.
- Record counts: **84,270** total — `mushaf` 1, `mushaf_page` 604,
  `mushaf_word` 83,665.
- `mushaf_word` keys: `id, mushaf_id, word_id, verse_id, text, char_type_id,
  char_type_name, page_number, line_number, position_in_verse, position_in_line,
  position_in_page, css_class, css_style, record_type`.
- `mushaf_page` keys: `id, mushaf_id, page_number, first_verse_id, last_verse_id,
  first_word_id, last_word_id, verses_count, verse_mapping, updated_at`.
  `verse_mapping` is `{ "<surah>": "<from>-<to>" }`.
- `text` on word records is a **PUA glyph codepoint** (page 1 line 9 →
  U+FC41, U+FC42, U+FC43, U+FC44, then U+FC45 with `char_type_name: "end"`).
  Same values as the `code_v2` strings the renderer already draws.
- `sync?resources=mushafs:19&bootstrap=true` → 200, one `RESOURCE_CREATE`
  carrying `snapshot_url: /api/v4/resources/snapshots/mushafs/19`,
  `has_more: false`, valid `next_sync_token`.
- Delta with that token → 200, 0 mutations, token rotates.
- No `sync_token` → **410 `resync_required`** (bootstrap required first).

### No `font_asset` records — confirmed expected

**`font_asset` records: 0.** Neither `mushafs:19` nor `mushafs:1` returns any,
despite the snapshot API documenting the type. The per-page COLRv1 woff2 files
in `font.loader.ts` therefore stay on the `verses.quran.foundation` CDN, outside
Content Sync — as does the jsDelivr bismillah `QCF_BSML.TTF`.

**QF confirmed (2026-09-14)** this is a gap on their side, not a misuse of the
API. Keep caching the fonts from the CDN; QF will notify Rafeeq if `font_asset`
records land. Retention is covered by the §1 permission
(`licensing-decisions.md` §1a).

**Consequence:** this migration moves page layout only. **Do not describe the
result as "fully migrated to Content Sync"** — the fonts and the word-level
Uthmani text remain outside it, by QF's own design for now.

## Design

### 1. Third sync group

`content-sync.types.ts`:

```ts
export type SyncGroup = "tafsirs" | "recitations" | "mushafs";
export const SYNC_GROUPS: SyncGroup[] = ["tafsirs", "recitations", "mushafs"];
```

`parse-mutation.ts` needs no change — `isSyncGroup` reads `SYNC_GROUPS`.

### 2. Row shape

One row per **page**, not per word. 604 rows, each holding that page's words.

- `recordType: "mushaf_page"`, `recordKey: String(pageNumber)`
- Row id via existing `rowId()` → `mushafs:19:mushaf_page:1`
- `data`: `{ pageNumber, verseMapping, words: VerseWord[] }`

Rationale: the read path is `getPage(n)`, so page-keyed rows make it one `idb.get`.
Per-word rows would be 83,665 records and would repeat follow-up #2 in
`2026-08-22-content-sync-followups.md` (whole-resource deserialization per tap).

**Caveat:** ROW-level mutations from the API are addressed per *record*. If QF
ever emits `ROW_UPDATE` for a single `mushaf_word`, a page-keyed store cannot
apply it directly. Bootstrap returns only `RESOURCE_CREATE`, and layout changes
in practice arrive as a whole-resource replacement, so this is acceptable — but
the adapter should log loudly on an unexpected `ROW_*` for `mushafs` rather than
silently dropping it.

### 3. Adapter — `adapters/mushafs.adapter.ts`

`toRows(records, resourceId, sequence)`:

1. Partition by `record_type`.
2. Group `mushaf_word` by `page_number`.
3. Within a page, sort by **`position_in_page`** — not by
   `(line_number, position_in_line)`, which produces a wrong order on some pages.
   See §5 "Join key".
4. Map each word to the existing `VerseWord`:
   - `codeV2` ← `text` (the PUA glyph)
   - `lineNumber` ← `line_number`, `pageNumber` ← `page_number`
   - `position` ← `position_in_verse`
   - `charType` ← `char_type_name === "end" ? "end" : "word"`
     **Note:** `fetchVersesByPage` currently inverts this
     (`char_type_name === "end" ? "word" : "end"`, quran-api.client.ts:341).
     That inversion is load-bearing for the current renderer — do **not**
     "fix" it here in passing. Match observed rendering behaviour and settle
     the discrepancy separately.
   - `text_uthmani` ← **not present in the snapshot.** Leave empty in the row;
     it is filled by the merge in §5, not by the adapter. See §4.
5. Attach `verse_mapping` from the page record.

### 4. The `text_uthmani` gap — resolved by QF: keep `/verses/by_page/`

`mushaf_word` carries only the glyph `text`. It has no `text_uthmani`, and
`verse_id` is a **global** verse index, not a `sura:aya` key.

#### Where Uthmani text comes from today — two sources, one granularity each

| Level | Source | QF content? |
|---|---|---|
| `Verse.text` — per ayah | bundled `public/data/quran-text.json` (6,236 verses, ~1.7 MB, `{sura, aya, text}`), seeded to the IDB `verses` store on first launch by `seedTextCorpus()` | **No** — ships with the app |
| `VerseWord.text_uthmani` — per word | QF `/verses/by_page/` via `word_fields=...,text_uthmani,...` | **Yes** |

**The bundled corpus cannot fill the word-level field.** It is verse-level only.
Splitting a verse string on whitespace does not reliably reproduce QF's own word
boundaries, and the consumers below depend on those boundaries matching the
per-word records exactly:

- `recite-matcher.service.ts:92` — one normalized token per word
- `recite-matcher.service.ts:386` — per-word sequence for anchor scoring
- `useQuizRecite.ts:123,138` — accumulates word-by-word for prefix matching
- `mutashabihat/services/mutashabihat.service.ts:48`
- `MushafPage.tsx:569` — render fallback when `codeV2` is empty

Recite matching is tuned against this exact tokenization (see
`2026-07-*` recite specs). Feeding it re-split words is a subtle regression, not
a refactor.

#### Decision

The option of "join the snapshot layout to text we already have" **does not
exist at word level**. Options considered:

1. **Keep `/verses/by_page/` for word-level Uthmani text; take layout from the
   snapshot.** Two sources per page, merged at read time.
2. **Sync a second resource for word-level Uthmani text.** — **Ruled out. QF
   confirmed on 2026-09-14 that no Content Sync resource carries per-word
   Uthmani text.**
3. **Drop word-level Uthmani entirely** and rebuild matching on glyph codepoints.
   Rejected: it rewrites tuned recite logic to work around a data gap.

**Decided: (1).** QF explicitly endorsed this, noting that word-boundary
alignment being load-bearing for recite matching and quizzes makes it the right
call. This is the permanent design, not a stopgap — so the §5 merge and its
join key must be got right.

#### What this does to the rationale

Migrating to `mushafs:19` moves **page layout and glyph positions only**. Both
the QF per-word Uthmani text and the QF font files remain cached outside Content
Sync, under the §1 permission. **§1 therefore continues to do real work after
this migration and must not be treated as discharged** — see
`licensing-decisions.md` §1a.

### 5. Read path

Under option (1) the snapshot is **not** a standalone source for a page — it has
no word-level Uthmani text — so it cannot simply sit in front of
`fetchVersesByPage()` as a cache layer. Two sources must be combined:

```
mem → idb "pages"
        └─ miss → fetchVersesByPage()            (word text_uthmani)
                  + content_sync mushafs:19 row  (authoritative layout)
                  → merge → store in "pages"
```

Merge rule: take `codeV2`, `lineNumber`, `pageNumber` and ordering from the sync
row; take `text_uthmani` from the API response.

#### Join key — VERIFIED 2026-09-11

**Sort snapshot words by `position_in_page`. Do not sort by
`(line_number, position_in_line)`.**

Verified against the live API on 51 pages (every 12th page, 1→604, requested with
`mushaf=19`): **51/51 exact glyph match** on the `position_in_page` ordering, with
word counts equal on every page.

The obvious-looking key is wrong. `(line_number, position_in_line)` mismatched
4 of 9 pages in the first sample (50, 177, 255, 604), always as a **one-word
offset appearing at the start of line 4** and persisting to the end of the page.
Diagnosis:

- per-line word counts are **identical** between the two sources on every page
  checked — the disagreement is ordering *within* a line, not layout
- the glyph multiset per page is identical, confirming same data, different order
- `(line_number, word_id)` also matched the sample, but `word_id` alone failed on
  page 604 — it tracks surah order, which diverges from mushaf order at the end
  of the mushaf. `position_in_page` is the robust key; prefer it.

This matters because the failure is silent: counts match, so a naive
count-equality guard passes while every word after line 3 carries the wrong
Uthmani text. On the affected pages that is ~85% of the page mis-joined.

**Do not treat count equality as sufficient validation.** Keep the count guard,
but add a glyph-level assertion in the merge (see test plan) — the snapshot's
`text` must equal the API's `code_v2` at every index, and the merge must be
refused if not.

#### Join validation — ALL 604 PAGES, 2026-09-15

Every page fetched from `/verses/by_page/?mushaf=19` and joined against the
snapshot: **604/604 pages align exactly.** Word counts equal everywhere;
glyphs equal at every index under the comparison described below.

**One real finding, fixed:** a strict string comparison failed on **pages 156
and 526**, one word each. Cause is a whitespace convention difference, not a
data disagreement — **200 of the 83,665** snapshot words spell a two-glyph word
as `"X Y"` where the API returns `"XY"`:

```
page 156 idx 59   snapshot FC81+0020+FC82   api FC81+FC82
page 526 idx 145  snapshot FCD4+0020+FCD5   api FCD4+FCD5
```

`mergeLayoutIntoVerses` therefore compares glyphs ignoring whitespace
(`sameGlyph`). Only spaces are ignored — a different glyph is still a mismatch,
which is what actually guards the ordering. Without this, those two pages would
silently fall back to the API layout forever.

On `RESOURCE_INVALIDATE`, `onInvalidate` must clear the `pages` store and the
in-memory cache, or stale layout survives the update.

### 6. Storage

83,665 words ≈ 604 rows. **Measured snapshot size: 23.4 MB** of JSON over the
wire (2026-09-11) — roughly 2× the largest tafsir (~11.8 MB), and the largest
single payload the app would fetch and parse. Stored rows will be smaller than
the raw response (per-record `record_type`, `mushaf_id` and ids are dropped in
the mapped shape), but budget for the 23 MB parse spike, not the stored size.

The snapshot fetch is a single ~84k-record response. `fetchSnapshot` already
uses a 120 s timeout and `putRows` chunks at 500 via `idb.bulkPut` — both apply
unchanged. **Verify on a low-end Android WebView** before shipping; this is the
largest single snapshot the app would parse (see `docs/webview-compat-audit.md`).

### 7. Bootstrap trigger

Unlike tafsirs/recitations, this is not user-selected — every user needs it.
Bootstrap on first launch after upgrade, in the background, without blocking the
viewer: `getPage()` falls through to `fetchVersesByPage()` until the row exists,
so the app stays functional mid-bootstrap.

Existing 24 h `SYNC_INTERVAL_MS` covers the 7-day requirement unchanged.

### 8. Refresh obligation for the NON-synced data — new, easy to miss

QF's 2026-09-14 answer attaches a refresh duty to the two things Content Sync
does **not** carry:

> the font files and the `/verses/by_page/` word text should be periodically
> re-fetched — at least every 7 days, ideally on the existing 24 h schedule.

**The sync engine does not cover these.** `content-sync.service.ts` refreshes
registered resources only; the CDN fonts and the by-page word text sit entirely
outside it. Today both are cached indefinitely:

- `font.loader.ts` — IDB `fonts` store, evicted only by a `FONT_CACHE_VERSION`
  bump. **No age tracking at all.**
- `quran.service.getPage()` — IDB `pages` store, no TTL; `repairPagesCache()`
  exists but is manual.

So this migration must **add** staleness handling that does not currently exist:

- record a fetch timestamp per cached page and per cached font
- on the existing 24 h sync tick, re-fetch anything older than the threshold
  (7 days hard limit; refresh at 24 h to stay well inside it)
- offline must not force eviction — a stale page still renders. The obligation
  is to re-fetch when able, not to withhold content. §1 explicitly allows
  cached script to remain readable without connectivity.

Treat this as part of the migration, not a follow-up. Shipping the layout sync
without it leaves Rafeeq **less** compliant than before, having accepted a
refresh duty it does not perform.

### 9. Streaming the snapshot — avoiding the parse peak

`await res.json()` on this snapshot holds the decoded body AND the whole
object graph live at once. Measured on the real 2026-09-15 snapshot:

| Approach | Peak heap | Notes |
|---|---|---|
| `JSON.parse` of the whole body | **63.1 MB** | what the first implementation did |
| streamed, accumulating raw records | 30.5 MB | avoids the 22 MB string |
| **streamed, mapping each batch (shipped)** | **18.1 MB** | also drops the 10 unused fields per word |

End-to-end through the real bootstrap path: 604 rows, 83,665 words, correct
ordering, **29.6 MB peak, 307 ms**.

That matters because an OOM in a WebView is a *process kill*, not a catchable
exception — no fallback can run after it. The wire cost was never the problem:
the API serves brotli, so the body is only **1.1 MB** on the network and
expands to 22.1 MB only when decoded.

`stream-records.ts` walks the body as it arrives and yields records in
batches; `SyncAdapter.createAccumulator` lets a group opt in. tafsirs and
recitations keep the whole-body path — their snapshots are an order of
magnitude smaller and the extra machinery would buy nothing.

**The snapshot endpoint ignores pagination.** `per_page`, `limit`, `page`,
`cursor` and `record_type` were each probed against the live API: all return
the identical full 84,270-record body. Client-side streaming is the only lever.

`ReadableStream` and `TextDecoder` are far below the WebView 79 floor
(`docs/webview-compat-audit.md`).

## Test plan

Mirror `tafsirs.adapter.test.ts`:

- `toRows` groups 604 pages, orders by `position_in_page`, maps glyph → `codeV2`
- **regression fixture for the ordering trap:** a page-50 fixture where
  `(line_number, position_in_line)` and `position_in_page` disagree from line 4
  on. Sorting the wrong way must fail this test.
- page-1 fixture from the real snapshot (U+FC41…U+FC45, line 9)
- `verse_mapping` spanning a surah boundary
- `onInvalidate` clears `pages` + memory cache
- unexpected `ROW_*` for `mushafs` logs rather than corrupting a page

Merge path (§5) — the part most likely to break silently:

- word counts equal between snapshot row and API response for a page → merged
  words carry snapshot `codeV2` and API `text_uthmani` at every index
- **count mismatch → refuse the merge and fall back to the API response alone**,
  logging the page number. Never emit a partially joined page.
- **glyph mismatch at any index → refuse the merge the same way.** Count equality
  alone does not prove alignment: the ordering bug in §5 keeps counts equal while
  mis-joining most of the page.
- `getPage` still returns a usable page when the sync row is absent
  (mid-bootstrap)

## What this migration does and does not move

| Data | In `mushafs:19`? | After migration |
|---|---|---|
| Page layout / glyph positions | **Yes** | On Content Sync |
| Per-word Uthmani text | **No** | Cached from `/verses/by_page/`, §1 permission, §8 refresh |
| V4 per-page fonts | **No** (`font_asset`: 0) | Cached from CDN, §1 permission, §8 refresh |
| Bismillah `QCF_BSML.TTF` | **No** | Cached from jsDelivr, §1 permission |

All four positions are confirmed by QF (2026-09-14). The work is partial **by
QF's design**, not by omission.

## Order of work

1. ~~`SyncGroup` + tests green.~~ Done.
2. ~~Adapter + unit tests against real-snapshot fixtures, including the
   `position_in_page` ordering regression fixture.~~ Done.
3. ~~`getPage` merge path + `onInvalidate`.~~ Done.
4. ~~Bootstrap trigger.~~ Done.
5. ~~§8 staleness tracking for fonts and by-page word text.~~ Done.
6. ~~Verify the §5 join across all 604 pages.~~ Done — see "Join validation".
7. ~~Device verification on low-end Android — 23.4 MB parse.~~ Addressed by
   streaming the snapshot instead of parsing it whole; see §9. A device test
   is still worth doing opportunistically, but the OOM risk it was guarding
   against is now designed out rather than hoped against.

## Answered by QF (2026-09-14)

Full record in `licensing-decisions.md` §1a.

1. `font_asset` — a gap on QF's side; keep caching CDN fonts; QF will notify if
   records land.
2. Word-level `text_uthmani` — no Content Sync resource carries it; keep using
   `/verses/by_page/`.
3. Retention — both covered by the 2026-08-21 permission while used only inside
   Rafeeq's own offline experience; re-fetch at least every 7 days.
4. Bismillah TTF — keep loading via jsDelivr; not a Content Sync resource.
5. Provenance — all three notices were genuinely from QF; the rollback is
   superseded.
