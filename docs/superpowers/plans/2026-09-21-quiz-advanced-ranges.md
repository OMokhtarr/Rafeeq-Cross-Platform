# Quiz Advanced Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user build a quiz scope from a mixed list of juz, surahs and page ranges, save that list as a reusable named set, apply it later, rename it, and delete it with undo.

**Architecture:** One shared `AdvancedRangePicker` component and two new services (`quiz-presets.service` for the global preset library, `quiz-ranges.service` for turning a range list into a verse pool) are built first with unit tests, then wired into all three quiz setup pages behind a `Simple | Advanced` tab. `QuizConfig` and `MutashabihatConfig` gain one optional additive `ranges` field, so existing stored configs keep working with no migration.

**Tech Stack:** React 18 + TypeScript, Ionic React, `@capacitor/preferences` for storage, Jest via `react-scripts test`, CSS modules-free plain CSS files per component.

**Spec:** `docs/superpowers/specs/2026-09-21-quiz-advanced-ranges-design.md`

## Global Constraints

- **No visible scrollbars.** Never add scroll styling that reveals scrollbars; the global rule in `src/index.css` already hides them. Do not repeat the hide rules in component CSS.
- **No ESLint disable comments** of any kind, including `react-hooks/exhaustive-deps`.
- **Page width cap:** every page/view container uses `max-width: var(--max-width-mobile, 600px)` with `margin: 0 auto`. Never hard-code a pixel width.
- **Fixed BottomNavBar:** every scrolling container inside `IonContent` carries `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`. Do not use a trailing spacer `<div>`.
- **i18n:** every user-facing string goes in all three blocks of `src/app/core/i18n/strings.ts` — the `AppStrings` interface (`quizSetup`, around line 160), the `ar` object (around line 629) and the `en` object (around line 1125). Arabic is the primary language; `isRTL` drives direction, and numbers render through `toHindiNumbers` when `isRTL`.
- **Do not run** `npm run build`, `npx cap sync`, or gradle. The user builds the app. Running `npm test` is expected and required.
- **Test command:** `set CI=true && npx react-scripts test --testPathPattern "<pattern>"` (non-interactive, from the repo root).

---

### Task 1: Range and preset types

**Files:**
- Modify: `src/app/shared/models/verse.model.ts:94-116`

**Interfaces:**
- Consumes: nothing.
- Produces: `QuizRange`, `QuizRangePreset`, and an optional `ranges?: QuizRange[] | null` field on both `QuizConfig` and `MutashabihatConfig`.

This task is types only — there is no behaviour to test, so it has no test cycle of its own. Its correctness is proven by Task 2 compiling against it.

- [ ] **Step 1: Add the two new types**

In `src/app/shared/models/verse.model.ts`, directly after the existing `export type QuizScopeType = "surah" | "page" | "juz";` line, add:

```ts
/**
 * One entry in an advanced multi-range quiz selection.
 *
 * A range is exactly ONE juz, ONE surah, or ONE page span — never a list.
 * Selecting five juz in the advanced picker appends five separate entries, so
 * that every row rendered in the list is one thing the user can remove alone.
 */
export type QuizRange =
  | { kind: "surah"; surah: number }
  | { kind: "juz"; juz: number }
  | { kind: "pages"; from: number; to: number };

/** A named, reusable set of ranges, shared across all three quiz types. */
export interface QuizRangePreset {
  id: string;
  name: string;
  ranges: QuizRange[];
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add the additive config field**

In the same file, add this line to `QuizConfig` (after `difficulty`) and to `MutashabihatConfig` (after `questionCount`):

```ts
  /**
   * Advanced multi-range scope. When present and non-empty this REPLACES the
   * legacy single-scope fields above, which are then ignored. Optional so that
   * configs already stored on device keep working with no migration.
   */
  ranges?: QuizRange[] | null;
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `verse.model.ts`. Pre-existing errors elsewhere in the project are acceptable; new ones in this file are not.

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/models/verse.model.ts
git commit -m "add quiz range and preset types"
```

---

### Task 2: Range labelling and name derivation

**Files:**
- Create: `src/app/features/quiz/services/quiz-range-format.ts`
- Create: `src/app/features/quiz/services/__tests__/quiz-range-format.test.ts`

**Interfaces:**
- Consumes: `QuizRange` from Task 1.
- Produces:
  - `rangeKey(range: QuizRange): string` — a stable identity string used for dedupe and React keys.
  - `rangeLabel(range: QuizRange, labels: RangeLabels): string` — one range's display text.
  - `deriveName(ranges: QuizRange[], labels: RangeLabels, existingNames: string[]): string` — the auto-name for a saved set.
  - `interface RangeLabels { juzWord: string; pageWord: string; others: string; juzPlural: string; surahPlural: string; pagePlural: string; surahName: (n: number) => string; toNum: (n: number) => string; }`

Labels are injected rather than imported so these functions stay pure and testable without the i18n context or the metadata cache.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/quiz/services/__tests__/quiz-range-format.test.ts`:

```ts
import { rangeKey, rangeLabel, deriveName } from "../quiz-range-format";
import type { QuizRange } from "../../../../shared/models/verse.model";

// English labels keep the assertions readable; production passes Arabic.
const labels = {
  juzWord: "Juz",
  pageWord: "p.",
  others: "others",
  juzPlural: "juz",
  surahPlural: "surahs",
  pagePlural: "page ranges",
  surahName: (n: number) => `S${n}`,
  toNum: (n: number) => String(n),
};

describe("rangeKey", () => {
  it("gives equal ranges the same key", () => {
    expect(rangeKey({ kind: "juz", juz: 30 })).toBe(
      rangeKey({ kind: "juz", juz: 30 }),
    );
  });

  it("separates kinds that share a number", () => {
    expect(rangeKey({ kind: "juz", juz: 2 })).not.toBe(
      rangeKey({ kind: "surah", surah: 2 }),
    );
  });

  it("distinguishes page spans by both ends", () => {
    expect(rangeKey({ kind: "pages", from: 1, to: 10 })).not.toBe(
      rangeKey({ kind: "pages", from: 1, to: 11 }),
    );
  });
});

describe("rangeLabel", () => {
  it("labels a juz", () => {
    expect(rangeLabel({ kind: "juz", juz: 30 }, labels)).toBe("Juz 30");
  });

  it("labels a surah by name", () => {
    expect(rangeLabel({ kind: "surah", surah: 2 }, labels)).toBe("S2");
  });

  it("labels a page span with an en dash", () => {
    expect(rangeLabel({ kind: "pages", from: 100, to: 120 }, labels)).toBe(
      "p. 100–120",
    );
  });

  it("labels a single-page span without a dash", () => {
    expect(rangeLabel({ kind: "pages", from: 77, to: 77 }, labels)).toBe(
      "p. 77",
    );
  });
});

describe("deriveName", () => {
  it("uses the range's own label when there is exactly one", () => {
    expect(deriveName([{ kind: "juz", juz: 30 }], labels, [])).toBe("Juz 30");
  });

  it("counts several ranges of a single kind", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
      { kind: "juz", juz: 3 },
    ];
    expect(deriveName(ranges, labels, [])).toBe("3 juz");
  });

  it("names the first range plus a remainder when kinds are mixed", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "surah", surah: 2 },
      { kind: "pages", from: 1, to: 5 },
    ];
    expect(deriveName(ranges, labels, [])).toBe("Juz 30 + 2 others");
  });

  it("appends a suffix when the derived name is already taken", () => {
    expect(deriveName([{ kind: "juz", juz: 30 }], labels, ["Juz 30"])).toBe(
      "Juz 30 (2)",
    );
  });

  it("keeps counting up past the first collision", () => {
    expect(
      deriveName([{ kind: "juz", juz: 30 }], labels, ["Juz 30", "Juz 30 (2)"]),
    ).toBe("Juz 30 (3)");
  });

  it("returns an empty string for an empty list rather than throwing", () => {
    expect(deriveName([], labels, [])).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-range-format"`
Expected: FAIL — cannot find module `../quiz-range-format`.

- [ ] **Step 3: Write the implementation**

Create `src/app/features/quiz/services/quiz-range-format.ts`:

```ts
/**
 * RANGE FORMATTING
 *
 * Pure display helpers for advanced quiz ranges. Labels are injected rather
 * than imported so these stay testable without the i18n context or the
 * chapter-metadata cache.
 */

import type { QuizRange } from "../../../shared/models/verse.model";

export interface RangeLabels {
  juzWord: string;
  pageWord: string;
  others: string;
  juzPlural: string;
  surahPlural: string;
  pagePlural: string;
  surahName: (n: number) => string;
  toNum: (n: number) => string;
}

/** Stable identity for a range — used for dedupe and as a React key. */
export function rangeKey(range: QuizRange): string {
  switch (range.kind) {
    case "juz":
      return `juz:${range.juz}`;
    case "surah":
      return `surah:${range.surah}`;
    case "pages":
      return `pages:${range.from}-${range.to}`;
  }
}

/** One range's display text, e.g. "الجزء ٣٠" or "ص ١٠٠–١٢٠". */
export function rangeLabel(range: QuizRange, labels: RangeLabels): string {
  switch (range.kind) {
    case "juz":
      return `${labels.juzWord} ${labels.toNum(range.juz)}`;
    case "surah":
      return labels.surahName(range.surah);
    case "pages":
      return range.from === range.to
        ? `${labels.pageWord} ${labels.toNum(range.from)}`
        : `${labels.pageWord} ${labels.toNum(range.from)}–${labels.toNum(range.to)}`;
  }
}

function pluralFor(kind: QuizRange["kind"], labels: RangeLabels): string {
  if (kind === "juz") return labels.juzPlural;
  if (kind === "surah") return labels.surahPlural;
  return labels.pagePlural;
}

/**
 * The auto-name for a saved set.
 *
 * One range keeps its own label; several of one kind collapse to a count;
 * a mixed list names its first range and counts the rest. A numeric suffix is
 * appended when the result collides, so two similar sets stay distinguishable.
 */
export function deriveName(
  ranges: QuizRange[],
  labels: RangeLabels,
  existingNames: string[],
): string {
  if (ranges.length === 0) return "";

  let base: string;
  if (ranges.length === 1) {
    base = rangeLabel(ranges[0], labels);
  } else {
    const kinds = new Set(ranges.map((r) => r.kind));
    base =
      kinds.size === 1
        ? `${labels.toNum(ranges.length)} ${pluralFor(ranges[0].kind, labels)}`
        : `${rangeLabel(ranges[0], labels)} + ${labels.toNum(ranges.length - 1)} ${labels.others}`;
  }

  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base} (${labels.toNum(n)})`)) n++;
  return `${base} (${labels.toNum(n)})`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-range-format"`
Expected: PASS, all 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/quiz/services/quiz-range-format.ts src/app/features/quiz/services/__tests__/quiz-range-format.test.ts
git commit -m "derive display names for quiz range sets"
```

---

### Task 3: Preset storage service

**Files:**
- Create: `src/app/features/quiz/services/quiz-presets.service.ts`
- Create: `src/app/features/quiz/services/__tests__/quiz-presets.service.test.ts`

**Interfaces:**
- Consumes: `QuizRange`, `QuizRangePreset` (Task 1).
- Produces:
  - `PRESETS_KEY = "quizRangePresets"`
  - `listPresets(): Promise<QuizRangePreset[]>` — newest `updatedAt` first.
  - `savePreset(ranges: QuizRange[], name: string): Promise<QuizRangePreset>`
  - `updatePreset(id: string, ranges: QuizRange[]): Promise<void>`
  - `renamePreset(id: string, name: string): Promise<void>`
  - `deletePreset(id: string): Promise<void>`
  - `restorePreset(preset: QuizRangePreset): Promise<void>`

`savePreset` takes an already-derived name: the caller owns naming because only it knows the current label set and the existing names. Undo keeps no trash bin in storage — the caller holds the removed object and hands it back to `restorePreset`.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/quiz/services/__tests__/quiz-presets.service.test.ts`:

```ts
import type { QuizRange } from "../../../../shared/models/verse.model";

// In-memory stand-in for @capacitor/preferences. Declared before the import
// of the service under test so the mock is in place when it loads.
const store: Record<string, string> = {};

jest.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({
      value: key in store ? store[key] : null,
    })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => {
      store[key] = value;
    }),
  },
}));

import {
  PRESETS_KEY,
  listPresets,
  savePreset,
  updatePreset,
  renamePreset,
  deletePreset,
  restorePreset,
} from "../quiz-presets.service";

const juz30: QuizRange[] = [{ kind: "juz", juz: 30 }];
const baqarah: QuizRange[] = [{ kind: "surah", surah: 2 }];

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("listPresets", () => {
  it("returns an empty list when nothing has been saved", async () => {
    expect(await listPresets()).toEqual([]);
  });

  // A corrupt entry must never white-screen a setup page: losing a saved set
  // is a far smaller failure than losing the screen.
  it("returns an empty list rather than throwing on malformed JSON", async () => {
    store[PRESETS_KEY] = "{not json";
    expect(await listPresets()).toEqual([]);
  });

  it("drops entries that are not shaped like a preset", async () => {
    store[PRESETS_KEY] = JSON.stringify([
      { id: "a", name: "ok", ranges: [], createdAt: 1, updatedAt: 1 },
      { nonsense: true },
      null,
    ]);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
  });

  it("orders the newest updated first", async () => {
    const a = await savePreset(juz30, "A");
    const b = await savePreset(baqarah, "B");
    await renamePreset(a.id, "A renamed");
    const list = await listPresets();
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});

describe("savePreset", () => {
  it("stores the ranges under the given name", async () => {
    const saved = await savePreset(juz30, "My Hifz");
    expect(saved.name).toBe("My Hifz");
    expect(saved.ranges).toEqual(juz30);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].ranges).toEqual(juz30);
  });

  it("gives every preset a distinct id", async () => {
    const a = await savePreset(juz30, "A");
    const b = await savePreset(juz30, "B");
    expect(a.id).not.toBe(b.id);
  });

  it("copies the ranges so later edits to the caller's array do not leak", async () => {
    const mutable: QuizRange[] = [{ kind: "juz", juz: 1 }];
    const saved = await savePreset(mutable, "A");
    mutable.push({ kind: "juz", juz: 2 });
    const list = await listPresets();
    expect(list[0].ranges).toHaveLength(1);
    expect(saved.ranges).toHaveLength(1);
  });
});

describe("updatePreset", () => {
  it("replaces the ranges and bumps updatedAt", async () => {
    const saved = await savePreset(juz30, "A");
    await updatePreset(saved.id, baqarah);
    const list = await listPresets();
    expect(list[0].ranges).toEqual(baqarah);
    expect(list[0].updatedAt).toBeGreaterThanOrEqual(saved.updatedAt);
    expect(list[0].name).toBe("A");
  });

  it("is a no-op for an unknown id", async () => {
    await savePreset(juz30, "A");
    await updatePreset("nope", baqarah);
    const list = await listPresets();
    expect(list[0].ranges).toEqual(juz30);
  });
});

describe("renamePreset", () => {
  it("changes only the name", async () => {
    const saved = await savePreset(juz30, "A");
    await renamePreset(saved.id, "B");
    const list = await listPresets();
    expect(list[0].name).toBe("B");
    expect(list[0].ranges).toEqual(juz30);
  });

  it("ignores a blank name rather than storing an unreadable entry", async () => {
    const saved = await savePreset(juz30, "A");
    await renamePreset(saved.id, "   ");
    const list = await listPresets();
    expect(list[0].name).toBe("A");
  });
});

describe("deletePreset and restorePreset", () => {
  it("removes the preset", async () => {
    const saved = await savePreset(juz30, "A");
    await deletePreset(saved.id);
    expect(await listPresets()).toEqual([]);
  });

  it("restores it with its original id and createdAt intact", async () => {
    const saved = await savePreset(juz30, "A");
    await deletePreset(saved.id);
    await restorePreset(saved);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
    expect(list[0].createdAt).toBe(saved.createdAt);
    expect(list[0].name).toBe("A");
  });

  it("does not duplicate when restoring something still present", async () => {
    const saved = await savePreset(juz30, "A");
    await restorePreset(saved);
    expect(await listPresets()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-presets"`
Expected: FAIL — cannot find module `../quiz-presets.service`.

- [ ] **Step 3: Write the implementation**

Create `src/app/features/quiz/services/quiz-presets.service.ts`:

```ts
/**
 * QUIZ RANGE PRESETS
 *
 * The only module that touches preset storage. One key holds the whole
 * library as a JSON array, shared by all three quiz types — a range is a range
 * regardless of what consumes it, and the point of saving one is to avoid
 * building it three times.
 */

import { Preferences } from "@capacitor/preferences";
import type {
  QuizRange,
  QuizRangePreset,
} from "../../../shared/models/verse.model";

export const PRESETS_KEY = "quizRangePresets";

function isPreset(value: unknown): value is QuizRangePreset {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<QuizRangePreset>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    Array.isArray(p.ranges) &&
    typeof p.createdAt === "number" &&
    typeof p.updatedAt === "number"
  );
}

/**
 * Every read funnels through here. Absent, malformed or partially corrupt
 * storage degrades to whatever is still readable rather than throwing.
 */
async function readAll(): Promise<QuizRangePreset[]> {
  try {
    const { value } = await Preferences.get({ key: PRESETS_KEY });
    if (!value) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPreset);
  } catch {
    return [];
  }
}

async function writeAll(presets: QuizRangePreset[]): Promise<void> {
  await Preferences.set({ key: PRESETS_KEY, value: JSON.stringify(presets) });
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

/** The library, newest-updated first. */
export async function listPresets(): Promise<QuizRangePreset[]> {
  const all = await readAll();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Store a new set under an already-derived name. */
export async function savePreset(
  ranges: QuizRange[],
  name: string,
): Promise<QuizRangePreset> {
  const now = Date.now();
  const preset: QuizRangePreset = {
    id: newId(),
    name,
    ranges: [...ranges],
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  await writeAll([preset, ...all]);
  return preset;
}

/** Replace an existing set's ranges, keeping its name and id. */
export async function updatePreset(
  id: string,
  ranges: QuizRange[],
): Promise<void> {
  const all = await readAll();
  const next = all.map((p) =>
    p.id === id ? { ...p, ranges: [...ranges], updatedAt: Date.now() } : p,
  );
  await writeAll(next);
}

export async function renamePreset(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const all = await readAll();
  const next = all.map((p) =>
    p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
  );
  await writeAll(next);
}

export async function deletePreset(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((p) => p.id !== id));
}

/**
 * Put a deleted preset back, identity intact.
 *
 * Undo keeps no trash bin in storage: the caller holds the removed object for
 * the lifetime of its toast. If the user navigates away first the delete
 * simply stands, which is correct and costs no code.
 */
export async function restorePreset(preset: QuizRangePreset): Promise<void> {
  const all = await readAll();
  if (all.some((p) => p.id === preset.id)) return;
  await writeAll([preset, ...all]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-presets"`
Expected: PASS, all 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/quiz/services/quiz-presets.service.ts src/app/features/quiz/services/__tests__/quiz-presets.service.test.ts
git commit -m "store reusable quiz range sets in one shared library"
```

---

### Task 4: Range normalisation and the verse pool

**Files:**
- Create: `src/app/features/quiz/services/quiz-ranges.service.ts`
- Create: `src/app/features/quiz/services/__tests__/quiz-ranges.service.test.ts`

**Interfaces:**
- Consumes: `QuizRange` (Task 1), `rangeKey` (Task 2), and from `src/app/core/services/data/quran.service`: `getSurahVersesList(suraIndex: number): Promise<Verse[]>`, `getJuzVerses(juzNumbers: number[]): Promise<Verse[]>`, `getPageRangeVerses(pageFrom: number, pageTo: number): Promise<Verse[]>`.
- Produces:
  - `isValidRange(range: QuizRange): boolean`
  - `normalizeRanges(ranges: QuizRange[]): QuizRange[]` — drops invalid and duplicate entries, preserving first-seen order.
  - `buildRangeVerses(ranges: QuizRange[]): Promise<Verse[]>` — the union, deduped by `sura:aya` and sorted into mushaf order.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/quiz/services/__tests__/quiz-ranges.service.test.ts`:

```ts
import type { QuizRange, Verse } from "../../../../shared/models/verse.model";

const getSurahVersesList = jest.fn();
const getJuzVerses = jest.fn();
const getPageRangeVerses = jest.fn();

jest.mock("../../../../core/services/data/quran.service", () => ({
  getSurahVersesList: (...a: unknown[]) => getSurahVersesList(...a),
  getJuzVerses: (...a: unknown[]) => getJuzVerses(...a),
  getPageRangeVerses: (...a: unknown[]) => getPageRangeVerses(...a),
}));

import {
  isValidRange,
  normalizeRanges,
  buildRangeVerses,
} from "../quiz-ranges.service";

const verse = (sura: number, aya: number, page = 1): Verse => ({
  sura,
  aya,
  text: `${sura}:${aya}`,
  page,
  suraNameAr: "س",
});

beforeEach(() => {
  getSurahVersesList.mockReset().mockResolvedValue([]);
  getJuzVerses.mockReset().mockResolvedValue([]);
  getPageRangeVerses.mockReset().mockResolvedValue([]);
});

describe("isValidRange", () => {
  it("accepts in-bounds ranges", () => {
    expect(isValidRange({ kind: "juz", juz: 30 })).toBe(true);
    expect(isValidRange({ kind: "surah", surah: 114 })).toBe(true);
    expect(isValidRange({ kind: "pages", from: 1, to: 604 })).toBe(true);
  });

  it("rejects out-of-bounds juz and surah numbers", () => {
    expect(isValidRange({ kind: "juz", juz: 0 })).toBe(false);
    expect(isValidRange({ kind: "juz", juz: 31 })).toBe(false);
    expect(isValidRange({ kind: "surah", surah: 115 })).toBe(false);
  });

  it("rejects page spans outside the mushaf or running backwards", () => {
    expect(isValidRange({ kind: "pages", from: 0, to: 10 })).toBe(false);
    expect(isValidRange({ kind: "pages", from: 600, to: 605 })).toBe(false);
    expect(isValidRange({ kind: "pages", from: 50, to: 40 })).toBe(false);
  });
});

describe("normalizeRanges", () => {
  it("removes exact duplicates, keeping the first", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
    ];
    expect(normalizeRanges(ranges)).toEqual([
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
    ]);
  });

  // Overlap is deliberately allowed: the pool dedupes at verse level, and
  // rejecting it would surprise a user who thinks in units, not verses.
  it("keeps overlapping-but-distinct ranges", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 590, to: 600 },
    ];
    expect(normalizeRanges(ranges)).toHaveLength(2);
  });

  it("drops invalid entries instead of throwing", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 99 },
      { kind: "surah", surah: 2 },
    ];
    expect(normalizeRanges(ranges)).toEqual([{ kind: "surah", surah: 2 }]);
  });
});

describe("buildRangeVerses", () => {
  it("returns nothing for an empty list without calling the fetchers", async () => {
    expect(await buildRangeVerses([])).toEqual([]);
    expect(getJuzVerses).not.toHaveBeenCalled();
  });

  it("dispatches each kind to its own fetcher", async () => {
    await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 1, to: 5 },
    ]);
    expect(getSurahVersesList).toHaveBeenCalledWith(2);
    expect(getJuzVerses).toHaveBeenCalledWith([30]);
    expect(getPageRangeVerses).toHaveBeenCalledWith(1, 5);
  });

  it("unions the results across kinds", async () => {
    getSurahVersesList.mockResolvedValue([verse(2, 1)]);
    getJuzVerses.mockResolvedValue([verse(78, 1, 582)]);
    const out = await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("dedupes verses shared by overlapping ranges", async () => {
    getJuzVerses.mockResolvedValue([verse(78, 1, 582), verse(78, 2, 582)]);
    getPageRangeVerses.mockResolvedValue([verse(78, 2, 582), verse(78, 3, 582)]);
    const out = await buildRangeVerses([
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 582, to: 582 },
    ]);
    expect(out.map((v) => `${v.sura}:${v.aya}`)).toEqual([
      "78:1",
      "78:2",
      "78:3",
    ]);
  });

  it("sorts into mushaf order regardless of the order ranges were added", async () => {
    getSurahVersesList.mockResolvedValue([verse(2, 5)]);
    getJuzVerses.mockResolvedValue([verse(1, 3)]);
    const out = await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 1 },
    ]);
    expect(out.map((v) => `${v.sura}:${v.aya}`)).toEqual(["1:3", "2:5"]);
  });

  it("skips invalid entries but still fetches the good ones", async () => {
    getSurahVersesList.mockResolvedValue([verse(2, 1)]);
    const out = await buildRangeVerses([
      { kind: "pages", from: 700, to: 800 },
      { kind: "surah", surah: 2 },
    ]);
    expect(getPageRangeVerses).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-ranges"`
Expected: FAIL — cannot find module `../quiz-ranges.service`.

- [ ] **Step 3: Write the implementation**

Create `src/app/features/quiz/services/quiz-ranges.service.ts`:

```ts
/**
 * ADVANCED RANGE → VERSE POOL
 *
 * Turns a mixed list of ranges into the verse pool a quiz draws from. The
 * per-kind dispatch mirrors what each test page did inline for a single scope;
 * here it runs across every range and unions the results.
 */

import type { QuizRange, Verse } from "../../../shared/models/verse.model";
import {
  getSurahVersesList,
  getJuzVerses,
  getPageRangeVerses,
} from "../../../core/services/data/quran.service";
import { rangeKey } from "./quiz-range-format";

const MAX_PAGE = 604;

/** Bounds check. One bad entry must not destroy an otherwise usable set. */
export function isValidRange(range: QuizRange): boolean {
  switch (range.kind) {
    case "juz":
      return Number.isInteger(range.juz) && range.juz >= 1 && range.juz <= 30;
    case "surah":
      return (
        Number.isInteger(range.surah) && range.surah >= 1 && range.surah <= 114
      );
    case "pages":
      return (
        Number.isInteger(range.from) &&
        Number.isInteger(range.to) &&
        range.from >= 1 &&
        range.to <= MAX_PAGE &&
        range.from <= range.to
      );
    default:
      return false;
  }
}

/**
 * Drop invalid and duplicate entries, preserving first-seen order.
 *
 * Exact duplicates go; overlapping-but-distinct ranges stay, because the pool
 * dedupes at verse level and blocking overlap would surprise a user who thinks
 * in units rather than in verses.
 */
export function normalizeRanges(ranges: QuizRange[]): QuizRange[] {
  const seen = new Set<string>();
  const out: QuizRange[] = [];
  for (const range of ranges) {
    if (!isValidRange(range)) continue;
    const key = rangeKey(range);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(range);
  }
  return out;
}

async function versesFor(range: QuizRange): Promise<Verse[]> {
  switch (range.kind) {
    case "surah":
      return getSurahVersesList(range.surah);
    case "juz":
      return getJuzVerses([range.juz]);
    case "pages":
      return getPageRangeVerses(range.from, range.to);
  }
}

/** The union of every range, deduped by sura:aya and in mushaf order. */
export async function buildRangeVerses(ranges: QuizRange[]): Promise<Verse[]> {
  const valid = normalizeRanges(ranges);
  if (valid.length === 0) return [];

  const byKey = new Map<string, Verse>();
  for (const range of valid) {
    for (const v of await versesFor(range)) {
      const key = `${v.sura}:${v.aya}`;
      if (!byKey.has(key)) byKey.set(key, v);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.sura === b.sura ? a.aya - b.aya : a.sura - b.sura,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz-ranges"`
Expected: PASS, all 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/quiz/services/quiz-ranges.service.ts src/app/features/quiz/services/__tests__/quiz-ranges.service.test.ts
git commit -m "build a quiz verse pool from a mixed range list"
```

---

### Task 5: Mutashabihat group filtering by range list

**Files:**
- Modify: `src/app/features/quiz/quizzes/mutashabihat/services/mutashabihat.service.ts:104-149`
- Create: `src/app/features/quiz/quizzes/mutashabihat/services/__tests__/mutashabihat-ranges.test.ts`

**Interfaces:**
- Consumes: `QuizRange` (Task 1), `isValidRange` (Task 4), the existing `MutashabihatGroup` type and `MIN_GROUP_SIZE` constant in this file.
- Produces: `filterGroupsByRanges(groups: MutashabihatGroup[], ranges: QuizRange[]): MutashabihatGroup[]`.

**Why this is a separate function, not a loop over the existing three.** Each existing filter keeps a group only when **two or more** of its verses match *that one* scope. Running them per range and unioning the results would wrongly drop a group whose two matching verses fall in two different ranges — each filter would see only one match and reject it. The correct semantic is to test every verse against the **whole** range set once, then apply the `MIN_GROUP_SIZE` rule to what survives.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/quiz/quizzes/mutashabihat/services/__tests__/mutashabihat-ranges.test.ts`:

```ts
import { filterGroupsByRanges } from "../mutashabihat.service";
import type { QuizRange, Verse } from "../../../../../../shared/models/verse.model";

const verse = (sura: number, aya: number, page: number, juz: number): Verse => ({
  sura,
  aya,
  text: `${sura}:${aya}`,
  page,
  juz,
  suraNameAr: "س",
});

const group = (verses: Verse[]) => ({ key: verses[0].text, verses } as any);

describe("filterGroupsByRanges", () => {
  it("keeps a group whose verses all sit in one range", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });

  // The whole reason this function exists rather than a loop over the three
  // single-scope filters: neither range alone reaches MIN_GROUP_SIZE.
  it("keeps a group whose matching verses are split across two ranges", () => {
    const g = group([verse(2, 1, 2, 1), verse(78, 1, 582, 30)]);
    const ranges: QuizRange[] = [
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
    ];
    const out = filterGroupsByRanges([g], ranges);
    expect(out).toHaveLength(1);
    expect(out[0].verses).toHaveLength(2);
  });

  it("drops a group with only one verse in the whole range set", () => {
    const g = group([verse(2, 1, 2, 1), verse(78, 1, 582, 30)]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    expect(filterGroupsByRanges([g], ranges)).toEqual([]);
  });

  it("narrows a kept group to just the matching verses", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1), verse(78, 1, 582, 30)]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    const out = filterGroupsByRanges([g], ranges);
    expect(out[0].verses.map((v: Verse) => v.sura)).toEqual([2, 2]);
  });

  it("matches a page range by page number", () => {
    const g = group([verse(2, 1, 10, 1), verse(2, 9, 11, 1)]);
    const ranges: QuizRange[] = [{ kind: "pages", from: 10, to: 11 }];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });

  it("counts a verse once when ranges overlap", () => {
    const g = group([verse(78, 1, 582, 30), verse(78, 2, 582, 30)]);
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 582, to: 582 },
    ];
    const out = filterGroupsByRanges([g], ranges);
    expect(out[0].verses).toHaveLength(2);
  });

  it("returns nothing when the range list is empty", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    expect(filterGroupsByRanges([g], [])).toEqual([]);
  });

  it("ignores invalid ranges", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 99 },
      { kind: "surah", surah: 2 },
    ];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `set CI=true && npx react-scripts test --testPathPattern "mutashabihat-ranges"`
Expected: FAIL — `filterGroupsByRanges` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/app/features/quiz/quizzes/mutashabihat/services/mutashabihat.service.ts`, add these imports at the top of the file, alongside the existing imports:

```ts
import type { QuizRange } from "../../../../../shared/models/verse.model";
import { isValidRange } from "../../../services/quiz-ranges.service";
```

Then add this function immediately after the existing `filterGroupsByJuzs` (which ends at line 149):

```ts
/**
 * Filter groups by an advanced multi-range selection.
 *
 * Deliberately NOT a loop over the three single-scope filters above. Each of
 * those requires MIN_GROUP_SIZE matches within one scope, so a group whose two
 * matching verses fall in two different ranges would be rejected by both. Here
 * every verse is tested against the whole range set first, and the group-size
 * rule is applied to what survives.
 */
export function filterGroupsByRanges(
  groups: MutashabihatGroup[],
  ranges: QuizRange[],
): MutashabihatGroup[] {
  const valid = ranges.filter(isValidRange);
  if (valid.length === 0) return [];

  const surahs = new Set<number>();
  const juzs = new Set<number>();
  const pageSpans: Array<{ from: number; to: number }> = [];
  for (const r of valid) {
    if (r.kind === "surah") surahs.add(r.surah);
    else if (r.kind === "juz") juzs.add(r.juz);
    else pageSpans.push({ from: r.from, to: r.to });
  }

  const inRanges = (v: Verse): boolean =>
    surahs.has(v.sura) ||
    (v.juz != null && juzs.has(v.juz)) ||
    pageSpans.some((s) => v.page >= s.from && v.page <= s.to);

  const filtered: MutashabihatGroup[] = [];
  for (const g of groups) {
    const matching = g.verses.filter(inRanges);
    if (matching.length >= MIN_GROUP_SIZE) {
      filtered.push({ ...g, verses: matching });
    }
  }
  return filtered;
}
```

If `Verse` is not already imported in this file, add it to the existing type import from the verse model.

- [ ] **Step 4: Run the test to verify it passes**

Run: `set CI=true && npx react-scripts test --testPathPattern "mutashabihat-ranges"`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/quiz/quizzes/mutashabihat/services/
git commit -m "filter mutashabihat groups against a whole range set"
```

---

### Task 6: Strings for the advanced picker

**Files:**
- Modify: `src/app/core/i18n/strings.ts` — the `quizSetup` interface block (around line 160), the `ar` block (around line 629), the `en` block (around line 1125).

**Interfaces:**
- Consumes: nothing.
- Produces: the `t.quizSetup` keys used by Tasks 7–9: `tabSimple`, `tabAdvanced`, `yourRanges`, `noRangesHint`, `addRange`, `addPageRange`, `savedSets`, `saveThisSet`, `updateSet`, `saveAsNew`, `removeRange`, `deleteSet`, `deletedToast`, `undo`, `renameSet`, `alreadyAdded`, `rangeTotals`, `pageWord`, `othersWord`, `juzPlural`, `surahPlural`, `pagePlural`.

- [ ] **Step 1: Add the keys to the `AppStrings` interface**

In the `quizSetup` block of the interface (starts around line 160), after the existing `backToList: string;`, add:

```ts
    tabSimple: string;
    tabAdvanced: string;
    yourRanges: string;
    noRangesHint: string;
    addRange: string;
    addPageRange: string;
    savedSets: string;
    saveThisSet: string;
    updateSet: string;
    saveAsNew: string;
    removeRange: string;
    deleteSet: string;
    deletedToast: string;
    undo: string;
    renameSet: string;
    alreadyAdded: string;
    rangeTotals: string;
    pageWord: string;
    othersWord: string;
    juzPlural: string;
    surahPlural: string;
    pagePlural: string;
```

- [ ] **Step 2: Add the Arabic values**

In the `ar` object's `quizSetup` block (starts around line 629), after its `backToList` entry, add:

```ts
    tabSimple: "بسيط",
    tabAdvanced: "متقدم",
    yourRanges: "نطاقاتك",
    noRangesHint: "أضف جزءًا أو سورة أو نطاق صفحات لبدء بناء اختبارك",
    addRange: "أضف نطاقًا",
    addPageRange: "أضف النطاق",
    savedSets: "المجموعات المحفوظة",
    saveThisSet: "احفظ هذه المجموعة",
    updateSet: "تحديث",
    saveAsNew: "حفظ كجديدة",
    removeRange: "إزالة النطاق",
    deleteSet: "حذف",
    deletedToast: "تم الحذف",
    undo: "تراجع",
    renameSet: "إعادة التسمية",
    alreadyAdded: "مُضاف بالفعل",
    rangeTotals: "الإجمالي",
    pageWord: "ص",
    othersWord: "أخرى",
    juzPlural: "أجزاء",
    surahPlural: "سور",
    pagePlural: "نطاقات صفحات",
```

- [ ] **Step 3: Add the English values**

In the `en` object's `quizSetup` block (starts around line 1125), after its `backToList` entry, add:

```ts
    tabSimple: "Simple",
    tabAdvanced: "Advanced",
    yourRanges: "Your ranges",
    noRangesHint: "Add a juz, surah or page range to start building your quiz",
    addRange: "Add a range",
    addPageRange: "Add range",
    savedSets: "Saved sets",
    saveThisSet: "Save this set",
    updateSet: "Update",
    saveAsNew: "Save as new",
    removeRange: "Remove range",
    deleteSet: "Delete",
    deletedToast: "Deleted",
    undo: "Undo",
    renameSet: "Rename",
    alreadyAdded: "Already added",
    rangeTotals: "Total",
    pageWord: "p.",
    othersWord: "others",
    juzPlural: "juz",
    surahPlural: "surahs",
    pagePlural: "page ranges",
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `strings.ts`. A missing key in either language block is a type error, so a clean run proves both blocks are complete.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/i18n/strings.ts
git commit -m "add strings for the advanced range picker"
```

---

### Task 7: The AdvancedRangePicker component

**Files:**
- Create: `src/app/features/quiz/components/advanced-range/AdvancedRangePicker.tsx`
- Create: `src/app/features/quiz/components/advanced-range/AdvancedRangePicker.css`

**Interfaces:**
- Consumes: `QuizRange`, `QuizRangePreset` (Task 1); `rangeKey`, `rangeLabel`, `deriveName`, `RangeLabels` (Task 2); all of `quiz-presets.service` (Task 3); `normalizeRanges` (Task 4); the `quizSetup` strings (Task 6); existing `InlineSelect` at `src/app/shared/components/inline-select/InlineSelect.tsx` (props: `value`, `options`, `onChange`, `fullWidth`); existing metadata helpers `getChapters`, `getSurahNameArabic`, `getSurahNameEnglish` from `src/app/core/services/data/metadata.service`; `toHindiNumbers` from `src/app/core/utils/arabic.util`; `useLang` from `src/app/core/context/LanguageContext`.
- Produces: a default-exported `AdvancedRangePicker` with this contract, plus the exported `SaveIntent` type that Tasks 8–9 use:

```ts
export type SaveIntent =
  | { mode: "none" }
  | { mode: "new"; name: string }
  | { mode: "update"; id: string; name: string };

interface Props {
  ranges: QuizRange[];
  onRangesChange: (ranges: QuizRange[]) => void;
  saveIntent: SaveIntent;
  onSaveIntentChange: (intent: SaveIntent) => void;
}
```

The component owns the picker UI and the preset library. It does **not** own the range list or the save decision — those live in the setup page, because the setup page is what runs `handleStart`. This keeps the component reusable across all three setups with no per-quiz branching inside it.

**Before writing the CSS**, invoke the `frontend-design` skill, per the user's standing preference for UI work.

- [ ] **Step 1: Write the component**

Create `src/app/features/quiz/components/advanced-range/AdvancedRangePicker.tsx`:

```tsx
/**
 * ADVANCED RANGE PICKER
 *
 * Builds a quiz scope from a mixed list of juz, surahs and page spans, and
 * manages the shared library of saved sets.
 *
 * The range list and the save decision are owned by the parent setup page,
 * which is what actually starts the quiz; this component only edits them. That
 * split is what lets all three setups share it without branching.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useIonToast } from "@ionic/react";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../../../core/services/data/metadata.service";
import { toHindiNumbers as toHindi } from "../../../../core/utils/arabic.util";
import { useLang } from "../../../../core/context/LanguageContext";
import InlineSelect from "../../../../shared/components/inline-select/InlineSelect";
import type {
  QuizRange,
  QuizRangePreset,
} from "../../../../shared/models/verse.model";
import {
  rangeKey,
  rangeLabel,
  deriveName,
  type RangeLabels,
} from "../../services/quiz-range-format";
import { normalizeRanges } from "../../services/quiz-ranges.service";
import {
  listPresets,
  deletePreset,
  restorePreset,
  renamePreset,
} from "../../services/quiz-presets.service";
import "./AdvancedRangePicker.css";

export type SaveIntent =
  | { mode: "none" }
  | { mode: "new"; name: string }
  | { mode: "update"; id: string; name: string };

interface Props {
  ranges: QuizRange[];
  onRangesChange: (ranges: QuizRange[]) => void;
  saveIntent: SaveIntent;
  onSaveIntentChange: (intent: SaveIntent) => void;
}

type AddKind = "juz" | "surah" | "pages";

const JUZS = Array.from({ length: 30 }, (_, i) => i + 1);

const AdvancedRangePicker: React.FC<Props> = ({
  ranges,
  onRangesChange,
  saveIntent,
  onSaveIntentChange,
}) => {
  const { t, isRTL } = useLang();
  const tq = t.quizSetup;
  const [presentToast, dismissToast] = useIonToast();

  const [addKind, setAddKind] = useState<AddKind>("juz");
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(10);
  const [presets, setPresets] = useState<QuizRangePreset[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");

  const toNum = useCallback(
    (n: number) => (isRTL ? toHindi(n) : String(n)),
    [isRTL],
  );

  const labels: RangeLabels = useMemo(
    () => ({
      juzWord: tq.juzWord,
      pageWord: tq.pageWord,
      others: tq.othersWord,
      juzPlural: tq.juzPlural,
      surahPlural: tq.surahPlural,
      pagePlural: tq.pagePlural,
      surahName: (n: number) =>
        isRTL ? getSurahNameArabic(n) : getSurahNameEnglish(n),
      toNum,
    }),
    [tq, isRTL, toNum],
  );

  const refreshPresets = useCallback(async () => {
    setPresets(await listPresets());
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const surahNames = useMemo(() => {
    const chapters = getChapters();
    return chapters.map((ch, i) => ({
      num: i + 1,
      arabic: ch.name_arabic,
      english: getSurahNameEnglish(i + 1),
    }));
  }, []);

  const pageOptions = useMemo(
    () =>
      Array.from({ length: 604 }, (_, i) => ({
        value: String(i + 1),
        label: toNum(i + 1),
      })),
    [toNum],
  );

  /** Append a range, or shake the existing row when it is already there. */
  const addRange = (range: QuizRange) => {
    const key = rangeKey(range);
    if (ranges.some((r) => rangeKey(r) === key)) {
      setShakeKey(key);
      window.setTimeout(() => setShakeKey(null), 400);
      return;
    }
    onRangesChange(normalizeRanges([...ranges, range]));
  };

  const removeRange = (key: string) =>
    onRangesChange(ranges.filter((r) => rangeKey(r) !== key));

  const loadPreset = (preset: QuizRangePreset) => {
    onRangesChange(normalizeRanges(preset.ranges));
    setLoadedId(preset.id);
    onSaveIntentChange({ mode: "none" });
  };

  const handleDelete = async (preset: QuizRangePreset) => {
    await deletePreset(preset.id);
    if (loadedId === preset.id) setLoadedId(null);
    await refreshPresets();
    presentToast({
      message: tq.deletedToast,
      duration: 5000,
      buttons: [
        {
          text: tq.undo,
          handler: () => {
            restorePreset(preset).then(refreshPresets);
          },
        },
      ],
    });
  };

  const commitRename = async (id: string) => {
    setRenaming(false);
    const next = renameText.trim();
    if (!next) return;
    await renamePreset(id, next);
    await refreshPresets();
  };

  const loadedPreset = presets.find((p) => p.id === loadedId) ?? null;

  // A loaded set that has not been touched has nothing to save.
  const isUnchangedFromLoaded =
    loadedPreset !== null &&
    loadedPreset.ranges.length === ranges.length &&
    loadedPreset.ranges.every((r, i) => rangeKey(r) === rangeKey(ranges[i]));

  const canSave = ranges.length > 0 && !isUnchangedFromLoaded;

  const suggestedName = useMemo(
    () =>
      deriveName(
        ranges,
        labels,
        presets.map((p) => p.name),
      ),
    [ranges, labels, presets],
  );

  const toggleSave = (checked: boolean) => {
    if (!checked) {
      onSaveIntentChange({ mode: "none" });
      return;
    }
    onSaveIntentChange(
      loadedPreset
        ? { mode: "update", id: loadedPreset.id, name: loadedPreset.name }
        : { mode: "new", name: suggestedName },
    );
  };

  const pageCount = ranges.reduce(
    (sum, r) => (r.kind === "pages" ? sum + (r.to - r.from + 1) : sum),
    0,
  );

  return (
    <div className="arp-root" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Zone 1: the list being built ── */}
      <div className="arp-section">
        <div className="arp-label">{tq.yourRanges}</div>
        {ranges.length === 0 ? (
          <p className="arp-hint">{tq.noRangesHint}</p>
        ) : (
          <ul className="arp-range-list">
            {ranges.map((r) => {
              const key = rangeKey(r);
              return (
                <li
                  key={key}
                  className={`arp-range-row${shakeKey === key ? " shake" : ""}`}
                >
                  <span className={`arp-range-kind arp-kind-${r.kind}`} />
                  <span className="arp-range-text">
                    {rangeLabel(r, labels)}
                  </span>
                  <button
                    className="arp-range-remove"
                    onClick={() => removeRange(key)}
                    aria-label={tq.removeRange}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {ranges.length > 0 && (
          <p className="arp-totals">
            {tq.rangeTotals}: {toNum(ranges.length)}
            {pageCount > 0 && ` · ${toNum(pageCount)} ${tq.pagePlural}`}
          </p>
        )}

        {/* Save is a checkbox, applied on Start — not a button. */}
        {canSave && (
          <div className="arp-save-row">
            <label className="arp-save-check">
              <input
                type="checkbox"
                checked={saveIntent.mode !== "none"}
                onChange={(e) => toggleSave(e.target.checked)}
              />
              <span>{tq.saveThisSet}</span>
            </label>

            {saveIntent.mode !== "none" && (
              <>
                {loadedPreset && (
                  <div className="arp-save-mode">
                    <button
                      className={`arp-save-mode-btn${saveIntent.mode === "update" ? " active" : ""}`}
                      onClick={() =>
                        onSaveIntentChange({
                          mode: "update",
                          id: loadedPreset.id,
                          name: loadedPreset.name,
                        })
                      }
                    >
                      {tq.updateSet}
                    </button>
                    <button
                      className={`arp-save-mode-btn${saveIntent.mode === "new" ? " active" : ""}`}
                      onClick={() =>
                        onSaveIntentChange({
                          mode: "new",
                          name: suggestedName,
                        })
                      }
                    >
                      {tq.saveAsNew}
                    </button>
                  </div>
                )}
                {saveIntent.mode === "new" && (
                  <input
                    className="arp-save-name"
                    value={saveIntent.name}
                    onChange={(e) =>
                      onSaveIntentChange({ mode: "new", name: e.target.value })
                    }
                    aria-label={tq.saveThisSet}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Zone 2: add a range ── */}
      <div className="arp-section">
        <div className="arp-label">{tq.addRange}</div>
        <div className="arp-kind-row">
          {[
            { key: "juz" as const, label: tq.scopeJuz },
            { key: "surah" as const, label: tq.scopeSurah },
            { key: "pages" as const, label: tq.scopePages },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`arp-kind-btn${addKind === opt.key ? " active" : ""}`}
              onClick={() => setAddKind(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {addKind === "juz" && (
          <div className="arp-juz-grid">
            {JUZS.map((j) => (
              <button
                key={j}
                className="arp-juz-chip"
                onClick={() => addRange({ kind: "juz", juz: j })}
              >
                <span className="arp-juz-label">{tq.juzWord}</span>
                <span className="arp-juz-num">{toNum(j)}</span>
              </button>
            ))}
          </div>
        )}

        {addKind === "surah" && (
          <div className="arp-surah-grid">
            {surahNames.map((s) => (
              <button
                key={s.num}
                className="arp-surah-chip"
                onClick={() => addRange({ kind: "surah", surah: s.num })}
              >
                <span className="arp-chip-text">
                  {isRTL ? (
                    <>
                      <span className="arp-chip-name" lang="ar" dir="rtl">
                        {s.arabic}
                      </span>
                      <span className="arp-chip-en">{s.english}</span>
                    </>
                  ) : (
                    <>
                      <span className="arp-chip-en">{s.english}</span>
                      <span className="arp-chip-name" lang="ar" dir="rtl">
                        {s.arabic}
                      </span>
                    </>
                  )}
                </span>
                <span className="arp-chip-num">{toNum(s.num)}</span>
              </button>
            ))}
          </div>
        )}

        {addKind === "pages" && (
          <div className="arp-page-bar">
            <div className="arp-page-row">
              <div className="arp-page-input">
                <span>{tq.from}</span>
                <InlineSelect
                  value={String(pageFrom)}
                  options={pageOptions}
                  onChange={(v) => {
                    const n = Number(v);
                    setPageFrom(n);
                    if (n > pageTo) setPageTo(n);
                  }}
                  fullWidth
                />
              </div>
              <div className="arp-page-input">
                <span>{tq.to}</span>
                <InlineSelect
                  value={String(pageTo)}
                  options={pageOptions.filter((o) => Number(o.value) >= pageFrom)}
                  onChange={(v) => setPageTo(Number(v))}
                  fullWidth
                />
              </div>
            </div>
            <button
              className="arp-page-add"
              onClick={() =>
                addRange({ kind: "pages", from: pageFrom, to: pageTo })
              }
            >
              {tq.addPageRange}
            </button>
          </div>
        )}
      </div>

      {/* ── Zone 3: saved sets ── */}
      {presets.length > 0 && (
        <div className="arp-section">
          <div className="arp-label">{tq.savedSets}</div>
          <div className="arp-preset-row">
            {presets.map((p) => {
              const isLoaded = p.id === loadedId;
              return (
                <div
                  key={p.id}
                  className={`arp-preset-chip${isLoaded ? " loaded" : ""}`}
                >
                  {isLoaded && renaming ? (
                    <input
                      className="arp-preset-rename"
                      value={renameText}
                      autoFocus
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => commitRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(p.id);
                      }}
                      aria-label={tq.renameSet}
                    />
                  ) : (
                    <button
                      className="arp-preset-name"
                      onClick={() => {
                        // First tap loads; only the loaded chip opens rename,
                        // so a plain tap never means two things at once.
                        if (isLoaded) {
                          setRenameText(p.name);
                          setRenaming(true);
                        } else {
                          loadPreset(p);
                        }
                      }}
                    >
                      {p.name}
                    </button>
                  )}
                  <button
                    className="arp-preset-delete"
                    onClick={() => handleDelete(p)}
                    aria-label={tq.deleteSet}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedRangePicker;
```

Note on delete: the spec calls for swipe-to-delete. `IonItemSliding` requires an `IonList`/`IonItem` structure that fights the chip layout, so the chip carries an explicit `×` instead, keeping the undo toast that makes deletion safe. Flag this to the user at review — it is the one place the implementation departs from the spec's wording.

- [ ] **Step 2: Invoke the frontend-design skill, then write the CSS**

Invoke `frontend-design` before writing `AdvancedRangePicker.css`. The file must:
- style `.arp-root`, the three `.arp-section` zones, the range rows, the kind toggle, the juz/surah grids, the page bar, the save row and the preset chips;
- reuse the existing token variables from `src/styles/tokens.css` (spacing `--space-*`, colours, radii) rather than hard-coded values;
- define a `shake` keyframe animation used by `.arp-range-row.shake`;
- add **no** scrollbar styling and **no** `max-width` (the parent page owns the width cap).

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `AdvancedRangePicker.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/quiz/components/advanced-range/
git commit -m "add the advanced range picker with its saved-set library"
```

---

### Task 8: Wire the tab into Akmel Al-Ayah

**Files:**
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup.tsx`
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup.css`
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx:155-170`

**Interfaces:**
- Consumes: `AdvancedRangePicker` and `SaveIntent` (Task 7); `savePreset`, `updatePreset` (Task 3); `buildRangeVerses` (Task 4); strings (Task 6).
- Produces: the wiring pattern Task 9 repeats for the other two quizzes.

- [ ] **Step 1: Add the tab state and imports to the setup page**

In `AkmelAlAyahSetup.tsx`, add to the imports:

```tsx
import AdvancedRangePicker, {
  type SaveIntent,
} from "../../../../components/advanced-range/AdvancedRangePicker";
import { savePreset, updatePreset } from "../../../../services/quiz-presets.service";
import type { QuizRange } from "../../../../../../shared/models/verse.model";
```

Add beside the existing `useState` declarations:

```tsx
  const [tab, setTab] = useState<"simple" | "advanced">("simple");
  const [ranges, setRanges] = useState<QuizRange[]>([]);
  const [saveIntent, setSaveIntent] = useState<SaveIntent>({ mode: "none" });
```

- [ ] **Step 2: Render the tab toggle and the advanced body**

Replace the opening of the `aa-body` block — the `{/* Scope selector */}` div and the `aa-scroll-zone` div — so the tab toggle sits above them and the advanced tab swaps the body out. The structure becomes:

```tsx
          <div className="aa-body" dir={isRTL ? "rtl" : "ltr"}>
            {/* Simple | Advanced — the visible tab is the source of truth */}
            <div className="aa-tab-row">
              {[
                { key: "simple" as const, label: tq.tabSimple },
                { key: "advanced" as const, label: tq.tabAdvanced },
              ].map((opt) => (
                <button
                  key={opt.key}
                  className={`aa-tab-btn${tab === opt.key ? " active" : ""}`}
                  onClick={() => setTab(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {tab === "advanced" ? (
              <div className="aa-scroll-zone">
                <AdvancedRangePicker
                  ranges={ranges}
                  onRangesChange={setRanges}
                  saveIntent={saveIntent}
                  onSaveIntentChange={setSaveIntent}
                />
              </div>
            ) : (
              <>
                {/* the existing scope selector and aa-scroll-zone, unchanged */}
              </>
            )}
          </div>
```

Move the existing `{/* Scope selector */}` div and the entire existing `<div className="aa-scroll-zone">…</div>` inside that `<>…</>` fragment, byte for byte. The footer stays outside, untouched, so the Start button does not move between tabs.

- [ ] **Step 3: Branch `handleStart` and `isReady` on the tab**

Replace `handleStart` and `isReady` with:

```tsx
  const handleStart = async () => {
    const advanced = tab === "advanced";

    // The save checkbox is applied here, on Start — a set is only ever saved
    // alongside a quiz that actually begins.
    if (advanced && saveIntent.mode !== "none" && ranges.length > 0) {
      if (saveIntent.mode === "update") {
        await updatePreset(saveIntent.id, ranges);
      } else {
        await savePreset(ranges, saveIntent.name.trim() || tq.savedSets);
      }
    }

    const quizConfig: QuizConfig = {
      type: scopeType,
      surah: !advanced && scopeType === "surah" ? selectedSurah : null,
      pageFrom: !advanced && scopeType === "page" ? pageFrom : null,
      pageTo: !advanced && scopeType === "page" ? pageTo : null,
      juzs: !advanced && scopeType === "juz" ? selectedJuzs : [],
      questionCount,
      difficulty: "medium",
      ranges: advanced ? ranges : null,
    };

    await Preferences.set({
      key: "quizConfig",
      value: JSON.stringify(quizConfig),
    });

    history.replace("/akmel-alayah");
  };

  const isReady = () => {
    if (tab === "advanced") return ranges.length > 0;
    if (scopeType === "surah") return selectedSurah !== null;
    if (scopeType === "page") return pageTo >= pageFrom;
    if (scopeType === "juz") return selectedJuzs.length > 0;
    return false;
  };
```

- [ ] **Step 4: Add the tab CSS**

Append to `AkmelAlAyahSetup.css` a `.aa-tab-row` / `.aa-tab-btn` rule pair styled like the existing `.aa-type-row` / `.aa-type-btn` segmented control, with the active state matching `.aa-type-btn.active`. Reuse the existing token variables. Add no scrollbar styling.

- [ ] **Step 5: Add the advanced branch to the test page**

In `AkmelAlAyah.tsx`, add the import:

```tsx
import { buildRangeVerses } from "../../../../services/quiz-ranges.service";
```

and replace the pool-building if/else (around line 158) with:

```tsx
        if (config.ranges?.length) {
          allVerses = await buildRangeVerses(config.ranges);
        } else if (config.type === "surah" && config.surah) {
          allVerses = await getSurahVersesList(config.surah);
        } else if (config.type === "juz") {
          allVerses = await getJuzVerses(config.juzs);
        } else if (
          config.type === "page" &&
          config.pageFrom != null &&
          config.pageTo != null
        ) {
          allVerses = await getPageRangeVerses(config.pageFrom, config.pageTo);
        }
```

The existing `allVerses.length === 0` guard immediately below already covers the empty-pool case; leave it as it is.

- [ ] **Step 6: Verify the whole suite still passes**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

Run: `set CI=true && npx react-scripts test --testPathPattern "quiz"`
Expected: PASS — all tests from Tasks 2, 3, 4 and 5 still green.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/quiz/quizzes/akmel-alayah/
git commit -m "offer the advanced range tab in akmel al-ayah"
```

---

### Task 9: Wire the tab into Akmel Al-Nehayat and Mutashabihat

**Files:**
- Modify: `src/app/features/quiz/quizzes/akmel-alnehayat/pages/setup/AkmelAlNehayatSetup.tsx`
- Modify: `src/app/features/quiz/quizzes/akmel-alnehayat/pages/setup/AkmelAlNehayatSetup.css`
- Modify: `src/app/features/quiz/quizzes/akmel-alnehayat/pages/test/AkmelAlNehayat.tsx:255-265`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.tsx`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.css`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx:130-137`

**Interfaces:**
- Consumes: everything Task 8 consumed, plus `filterGroupsByRanges` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Wire Akmel Al-Nehayat's setup page**

Apply Task 8 steps 1–4 to `AkmelAlNehayatSetup.tsx`, with three differences: the CSS class prefix in this file (check the file's existing prefix and match it exactly), the `Preferences` key is `akmelAlNehayatConfig`, and the route in `history.replace` is the one already in that file. Everything else — the tab state, the fragment move, the `handleStart` and `isReady` branches — is identical.

- [ ] **Step 2: Add the advanced branch to the Nehayat test page**

In `AkmelAlNehayat.tsx`, add the `buildRangeVerses` import and change the pool-selecting arrow function (around line 257) so its first branch is:

```tsx
          if (config.ranges?.length) return buildRangeVerses(config.ranges);
```

placed above the existing `if (config.type === "surah" …)` line. The remaining branches stay exactly as they are.

- [ ] **Step 3: Wire Mutashabihat's setup page**

Apply the same wiring to `MutashabihatSetup.tsx`. Its config is `MutashabihatConfig`, its `Preferences` key is `mutashabihatConfig`, and it has no `difficulty` field. Its `handleStart` becomes:

```tsx
  const handleStart = async () => {
    const advanced = tab === "advanced";

    if (advanced && saveIntent.mode !== "none" && ranges.length > 0) {
      if (saveIntent.mode === "update") {
        await updatePreset(saveIntent.id, ranges);
      } else {
        await savePreset(ranges, saveIntent.name.trim() || tq.savedSets);
      }
    }

    const config: MutashabihatConfig = {
      mode: "mutashabihat",
      scopeType,
      selectedSurahs: !advanced && scopeType === "surah" ? selectedSurahs : [],
      pageFrom: !advanced && scopeType === "page" ? pageFrom : null,
      pageTo: !advanced && scopeType === "page" ? pageTo : null,
      selectedJuzs: !advanced && scopeType === "juz" ? selectedJuzs : [],
      questionCount,
      ranges: advanced ? ranges : null,
    };

    await Preferences.set({
      key: "mutashabihatConfig",
      value: JSON.stringify(config),
    });

    history.replace("/mutashabihat-test");
  };
```

and its `isReady` gains `if (tab === "advanced") return ranges.length > 0;` as its first line.

- [ ] **Step 4: Add the advanced branch to the Mutashabihat test page**

This one filters **groups**, not verses, so it uses `filterGroupsByRanges` rather than `buildRangeVerses`. In `MutashabihatTest.tsx`, add:

```tsx
import { filterGroupsByRanges } from "../../services/mutashabihat.service";
```

to the existing import from that service, then replace the `let filtered = …` expression (around line 131) with:

```tsx
        let filtered = config.ranges?.length
          ? filterGroupsByRanges(allGroups, config.ranges)
          : config.scopeType === "surah"
          ? filterGroupsBySurahs(allGroups, config.selectedSurahs)
          : config.scopeType === "page"
          ? filterGroupsByPages(allGroups, config.pageFrom!, config.pageTo!)
          : filterGroupsByJuzs(allGroups, config.selectedJuzs);
```

The existing `filtered.length === 0` guard below already handles an empty result.

- [ ] **Step 5: Add the tab CSS to both setup stylesheets**

Append the same `.tab-row` / `.tab-btn` rules added in Task 8 step 4 to `AkmelAlNehayatSetup.css` and `MutashabihatSetup.css`, using each file's own existing class prefix.

- [ ] **Step 6: Verify everything**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

Run: `set CI=true && npx react-scripts test`
Expected: PASS — the full suite, including the pre-existing prayer tests.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/quiz/quizzes/akmel-alnehayat/ src/app/features/quiz/quizzes/mutashabihat/
git commit -m "offer the advanced range tab in the remaining two quizzes"
```

---

### Task 10: Manual verification in the running app

**Files:** none — this task changes no code. If it uncovers a defect, fix it in the file that owns the behaviour and commit that fix as its own commit.

**Interfaces:**
- Consumes: everything.
- Produces: a verified feature.

The user builds the app themselves, per their standing preference. Ask them to run it, then walk the checklist below and report what happens. Do not run `npm run build`, `npx cap sync` or gradle.

- [ ] **Step 1: Ask the user to build and run the app**

- [ ] **Step 2: Walk the checklist on any one quiz**

  - The Simple tab behaves exactly as it did before this change.
  - Switching to Advanced shows an empty list plus the hint.
  - Tapping juz chips, surah chips and adding a page range appends each as its own removable row.
  - Tapping an already-added chip shakes the existing row rather than adding a duplicate.
  - `×` removes a row.
  - Start is disabled with an empty list and enabled once one range is added.
  - Ticking *Save this set* reveals an editable derived name.
  - Start runs a quiz whose questions come from the union of the ranges.

- [ ] **Step 3: Verify the preset lifecycle**

  - After starting a quiz with the box ticked, returning to setup shows the set under *Saved sets*.
  - The set also appears in the other two quizzes' Advanced tabs.
  - Tapping it loads its ranges; the save checkbox is hidden until the list is edited.
  - Editing a loaded set offers *Update* and *Save as new*.
  - Tapping the loaded chip's name opens rename; the new name persists.
  - `×` deletes with a *Deleted · Undo* toast, and Undo restores it.

- [ ] **Step 4: Verify layout against the project CSS rules**

  - No scrollbar is visible anywhere in the Advanced tab.
  - Content scrolls clear of the fixed `BottomNavBar` — the last row is reachable, not hidden under the nav.
  - The page stays capped at the mobile width and centred.
  - The layout is correct in both Arabic (RTL) and English (LTR), with Hindi numerals in Arabic.

- [ ] **Step 5: Report the results to the user**

State plainly what passed and what did not, quoting any error output. Do not claim the feature works without having walked the list.
