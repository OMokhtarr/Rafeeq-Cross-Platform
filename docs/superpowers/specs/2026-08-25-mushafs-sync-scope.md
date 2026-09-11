# Scope — migrating QCF V4 page data onto Content Sync (`mushafs:19`)

Date: 2026-08-25
Status: **Scope only. Not implemented, not approved.** Written against live API
responses verified on 2026-08-25 (see "Verified facts").

## Why

`docs/licensing-decisions.md` §1 records QF's express permission to cache Quran
script and page-layout data beyond one week, framed as lasting *until* that
content is available through Content Sync. It is now available: `mushafs:19`
returns a live snapshot. Migrating discharges the obligation recorded there and
moves the layout cache onto the Developer Terms §3.1(3)(b) footing the rest of
the app already uses.

## Verified facts (live API, 2026-08-25)

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

### The blocker

**`font_asset` records: 0.** Neither `mushafs:19` nor `mushafs:1` returns any,
despite the snapshot API documenting the type. The per-page COLRv1 woff2 files
in `font.loader.ts` therefore stay on the `verses.quran.foundation` CDN, outside
Content Sync — as does the jsDelivr bismillah `QCF_BSML.TTF`.

**Consequence:** this migration moves layout/word data only. It does not put the
font blobs under the Content Sync exception. QF has been asked whether fonts are
pending or out of scope (see the reply draft). **Do not describe this work as
"fully migrated to Content Sync" until that is answered.**

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

### 4. The `text_uthmani` gap — the second blocker

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

#### Consequence

The option of "join the snapshot layout to text we already have" **does not
exist at word level**. What remains:

1. **Keep `/verses/by_page/` for word-level Uthmani text; take layout from the
   snapshot.** Two sources per page. The QF word text stays cached on the old
   footing — i.e. still relying on the §1 permission.
2. **Sync a second resource for word-level Uthmani text**, if QF exposes one.
   **Unverified — no such resource has been checked.** Would need the same
   bootstrap/delta treatment as `mushafs`.
3. **Drop word-level Uthmani entirely** and rebuild matching on glyph codepoints.
   Rejected: it rewrites tuned recite logic to work around a data gap.

**Current position: (1) is forced** unless QF answers that (2) is available.

#### What this does to the rationale

Combined with the zero `font_asset` records, migrating to `mushafs:19` moves
**page layout and glyph positions only**. Both the QF per-word Uthmani text and
the QF font files would still be cached outside Content Sync. The §1 permission
therefore continues to do real work after this migration — it is not discharged
by it.

This is the central question for QF, ahead of the implementation: is
`text_uthmani` expected on `mushaf_word` records, or is per-word Uthmani text
meant to arrive via another synced resource? If neither, `mushafs:19` cannot
replace `/verses/by_page/` for this app.

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

#### Join key — VERIFIED 2026-08-25

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

Remaining verification before shipping: run the same check on all 604 pages, not
a 51-page sample.

On `RESOURCE_INVALIDATE`, `onInvalidate` must clear the `pages` store and the
in-memory cache, or stale layout survives the update.

### 6. Storage

83,665 words ≈ 604 rows. **Measured snapshot size: 23.4 MB** of JSON over the
wire (2026-08-25) — roughly 2× the largest tafsir (~11.8 MB), and the largest
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

## Recommendation on sequencing

**Do not start implementation before QF answers.** Two of the three things this
migration was meant to move are missing from the snapshot:

| Data | In `mushafs:19`? | Still cached outside Content Sync? |
|---|---|---|
| Page layout / glyph positions | **Yes** | No — this is what migrates |
| Per-word Uthmani text | **No** | Yes, via `/verses/by_page/` |
| V4 per-page fonts | **No** (`font_asset`: 0) | Yes, via CDN |

As it stands the work is real but partial, and its cost is concentrated in the
riskiest part — the two-source join in §5, which touches the renderer and recite
matching. If QF confirms a word-text resource, §4 and §5 both change shape and
some of that work would be thrown away.

## Order of work (once unblocked)

1. QF answer on `text_uthmani` and `font_asset`. **Blocks everything else.**
2. Verify the §5 join across all 604 pages — word count and ordering agreement
   between the snapshot and `/verses/by_page/?mushaf=19`. If this fails, stop and
   re-scope.
3. `SyncGroup` + tests green.
4. Adapter + unit tests against real-snapshot fixtures.
5. `getPage` merge path + `onInvalidate`.
6. Bootstrap trigger.
7. Device verification on low-end Android.

## Open questions for QF

Tracked in the reply draft:

1. Are `font_asset` records expected in `mushafs:19` and not yet populated, or
   are fonts out of scope for Content Sync?
2. Is `text_uthmani` expected on `mushaf_word`, or is per-word Uthmani text meant
   to come from another synced resource?
3. If both stay outside Content Sync, what covers their local retention — does
   the §1 permission continue for them?
4. Should the bismillah `QCF_BSML.TTF` move onto Content Sync, and under which
   resource?
