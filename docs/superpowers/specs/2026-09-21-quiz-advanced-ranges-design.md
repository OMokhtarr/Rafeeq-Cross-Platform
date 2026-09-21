# Quiz Advanced Ranges: Multi-Range Selection and Saved Sets — Design

## What changes

Every quiz setup page gains a **Simple | Advanced** tab toggle. Simple is the
picker that exists today, unchanged. Advanced lets the user build a **list of
ranges** — any mix of juz, surahs and page spans — and take the quiz over the
union of all of them.

A built list can be **saved** as a named set. Saved sets are shared by all three
quizzes, are loaded back into the editor with one tap, can be renamed in place,
and are deleted by swiping with an undo window.

Today a setup picks exactly one scope: one surah (Mutashabihat allows several),
*or* one page span, *or* a set of juz. That shape cannot express the range a
user actually memorises, which is rarely one clean unit — "Juz 30, plus
Al-Mulk, plus the pages I did last week" has no representation at all. And
whatever is picked is thrown away on every visit, so a user with a standing
revision range rebuilds it from scratch each time.

The two additions answer those two problems, and they are independent: the
range list is useful without presets, and presets are only worth having because
the list is tedious to rebuild.

## Why the config field is additive

`QuizConfig` and `MutashabihatConfig` each gain one optional field, `ranges`,
rather than being restructured around the new model.

There are live configs sitting in `Preferences` on every installed device, and
the three test pages read them on launch. Replacing `type`/`surah`/`pageFrom`/
`juzs` with a range list would mean a migration, executed on a device we cannot
test against, for a quiz the user may be mid-way through. An optional field
costs nothing and needs no migration: old configs simply have no `ranges`, and
the existing code paths still handle them.

`ranges` present and non-empty means advanced mode, and the legacy scope fields
are ignored. That rule lives in one place — the branch at the top of each test
page's pool builder — so the two models never have to be reconciled anywhere
else.

## Data model

In `src/app/shared/models/verse.model.ts`, beside `QuizConfig`:

```ts
/** One entry in an advanced multi-range selection. */
export type QuizRange =
  | { kind: "surah"; surah: number }
  | { kind: "juz"; juz: number }
  | { kind: "pages"; from: number; to: number };

/** A named, reusable set of ranges, shared across all quiz types. */
export interface QuizRangePreset {
  id: string;
  name: string;
  ranges: QuizRange[];
  createdAt: number;
  updatedAt: number;
}
```

Both config interfaces gain:

```ts
ranges?: QuizRange[] | null;
```

A range is **one** juz, **one** surah, or **one** page span. Selecting five juz
in the Advanced tab appends five separate `{kind:"juz"}` entries, not one entry
holding an array. This is deliberate: every row in the list is then one thing
the user can see and remove on its own, and the list renders without having to
flatten anything.

Question count is **not** part of a preset. It is a per-session choice, cheap to
set, and baking it in would mean applying a saved set silently overrides a
number the user just picked.

## Preset storage

A new module, `src/app/features/quiz/services/quiz-presets.service.ts`, is the
only thing that touches preset storage. It is backed by `Preferences` under the
single key `quizRangePresets`, holding a JSON array.

```ts
listPresets(): Promise<QuizRangePreset[]>            // newest-updated first
savePreset(ranges, name?): Promise<QuizRangePreset>
renamePreset(id, name): Promise<void>
deletePreset(id): Promise<void>
restorePreset(preset): Promise<void>
```

One key, not one per quiz: the library is global, so a range built in Akmel
Al-Ayah is available in Mutashabihat. A range is a range regardless of what
consumes it, and the entire point of saving one is to avoid building it three
times.

Every read goes through a private `readAll()` that returns `[]` on absent or
malformed JSON, and filters out entries that are not shaped like a preset. A
corrupt entry must never white-screen a setup page; losing a saved set is a far
smaller failure than losing the screen.

### Deriving a name

`deriveName(ranges)` lives in this module so that every save produces a
consistent name no matter which page called it. It reads the list in order:

- one range → that range's own label (`الجزء ٣٠`, `البقرة`, `ص ١٠٠–١٢٠`)
- several of one kind → a count (`٣ أجزاء`)
- mixed kinds → the first range plus a remainder (`الجزء ٣٠ + ٢ أخرى`)

It is localised through the existing `t.quizSetup` strings and
`toHindiNumbers`, like the rest of the setup UI. If the derived name collides
with an existing preset, a numeric suffix is appended, so two similar sets
remain distinguishable in the library.

### Undo without a trash bin

`deletePreset` removes the preset outright. The **caller** keeps the removed
object in component state for the lifetime of its undo toast, and `restorePreset`
re-inserts it preserving the original `id` and `createdAt`.

The alternative — a soft-delete flag or a hidden trash list in storage — leaves
state that can leak, go stale, or need its own cleanup pass. Holding the object
in component state means that if the user navigates away before tapping Undo,
the delete simply stands, which is the correct outcome and requires no code.

## UI

### The tab toggle

A segmented `Simple | Advanced` control sits at the top of the scope area, where
the current scope label is. Simple renders exactly today's UI. Advanced replaces
the body with the range builder.

Each tab holds its own state, and **the visible tab is the source of truth** —
`isReady()` and `handleStart()` branch on it. There is no hidden precedence rule
to explain, because what the user can see is what Start will use.

The footer — question count and the Start button — is outside the tabs and does
not move between them. The primary action staying put is what makes the toggle
feel like a view switch rather than a mode change.

### The Advanced tab

Three stacked zones inside the existing scroll area:

**1. Your ranges.** The list being built. Each row is a card: an icon and label
for the kind, the range's name, and an `×` to remove it. Empty state is a hint
line styled like today's `aa-hint-text`. Below the list, a live total of pages
and verses, so a too-small selection is visible before Start rather than after.

**2. Add a range.** A compact Juz / Surah / Pages toggle revealing the matching
picker. Juz and Surah reuse the existing `aa-juz-grid` and `aa-surah-grid` chip
grids; tapping a chip appends it to the list immediately, with no separate "Add"
step. Pages reuses the `InlineSelect` from/to bar and does need an Add button,
since a span is only meaningful once both ends are chosen.

**3. Saved sets.** The library, rendered as a row of chips when non-empty and
hidden entirely when empty. Tapping a chip **loads** its ranges into zone 1,
where they can be edited freely — a saved set is a starting point, not a cage,
and nothing on disk changes until an explicit save. Swiping a chip reveals
Delete, which removes it and shows a `Deleted · Undo` toast.

Renaming is reached from the **loaded** chip only. Tap loads; once a chip is
the loaded one it is marked as such, and its name becomes an editable field in
place. A plain tap therefore never means two things at once: the first tap on
any chip loads it, and only the already-loaded chip exposes its name for
editing. Committing a rename writes through `renamePreset` immediately — it is
an edit to the stored set, not to the working list, so it does not wait for
Start.

### Saving

Saving is a **checkbox at the end of zone 1**, not a button: *Save this set*,
unchecked by default. Ticking it reveals the derived name as editable text, so
it can be corrected before it is committed.

Nothing is written when the box is ticked. The save happens inside
`handleStart()`, immediately before navigating to the quiz. This folds saving
into the flow the user is already completing instead of making it a separate
act — the set is saved by taking the quiz.

The consequence, accepted deliberately: **building a set and leaving without
pressing Start discards it.** The set is only ever saved alongside a quiz that
actually begins, which is the case the feature exists for.

When the list was loaded from a preset and then edited, the checkbox row shows a
two-way toggle — *Update "…"* or *Save as new* — because silently forking and
silently overwriting are both wrong. When a loaded preset is unedited, the
checkbox is hidden: there is nothing to save.

### Duplicates and overlap

Adding a range already in the list is a no-op with a brief shake on the existing
row. Ranges that *overlap* without being identical — Juz 30 and page 590 — are
allowed: the pool builder dedupes at the verse level, so overlap is harmless,
and rejecting it would be surprising to a user who thinks in units rather than
in verses.

### CSS constraints

Per the project rules: the wrapper caps at `var(--max-width-mobile, 600px)` and
centres with `margin: 0 auto`; the scrolling container carries
`padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))` so content
clears the fixed `BottomNavBar`; no scrollbar styling is added anywhere; no
ESLint disable comments.

## Building the verse pool

`buildRangeVerses(ranges)` in a new
`src/app/features/quiz/services/quiz-ranges.service.ts`.

Each test page currently branches over `config.type` and calls one of
`getSurahVersesList`, `getJuzVerses` or `getPageRangeVerses`. The helper runs
that same dispatch across every range in the list, concatenates the results,
dedupes by verse key, and sorts into mushaf order — so the pool is identical
regardless of the order the user added the ranges in.

Each test page gains one branch ahead of its existing logic:

```ts
if (config.ranges?.length) {
  allVerses = await buildRangeVerses(config.ranges);
} else if (config.type === "surah" && config.surah) {
  // ...existing paths, untouched
}
```

Three pages, the same five-line edit. No existing path changes.

## Error handling

**Empty pool.** A valid range list can still yield fewer verses than the chosen
question count. The existing `Math.min(questionCount, allVerses.length)` clamp
handles the small case; a genuinely empty pool gets an explicit guard that shows
the existing quiz-error state rather than starting a zero-question quiz.

**Invalid range entries.** A range referencing out-of-bounds data — a page
number beyond 604, a juz outside 1–30 — is filtered out inside
`buildRangeVerses` rather than throwing. One bad entry must not destroy an
otherwise usable set.

**Corrupt preset JSON.** Absorbed by `readAll()`, as above.

## Testing

Unit tests alongside the existing service tests, run with the project's Jest
setup:

- `deriveName` — one range of each kind, several of one kind, mixed kinds, and
  collision suffixing.
- `buildRangeVerses` — union across kinds, dedupe of overlapping ranges, mushaf
  ordering independent of input order, and filtering of invalid entries.
- `quiz-presets.service` — save, list ordering, rename, delete, and restore
  preserving `id` and `createdAt`, against a mocked `Preferences`.

The UI is verified by running the app, matching what this repo does today.
