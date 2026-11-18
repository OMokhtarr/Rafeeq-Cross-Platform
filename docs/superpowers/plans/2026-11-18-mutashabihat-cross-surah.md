# Mutashabihat "Between surahs only" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Mutashabihat setup's Advanced tab, when the ranges cover ≥ 2 surahs, let the user restrict the quiz to similar verses that span different surahs, showing only other-surah siblings with each question.

**Architecture:** Pure logic in the existing services (`quiz-ranges.service.ts` gains a surah-coverage helper; `mutashabihat.service.ts` gains a cross-surah flag on the range filter and question builder). The setup page owns a `Segmented` toggle and writes `crossSurahOnly` into the stored config; the test page reads it.

**Tech Stack:** React 18 + Ionic 8, TypeScript, Jest via react-scripts.

**Spec:** `docs/superpowers/specs/2026-11-18-mutashabihat-cross-surah-design.md`

## Global Constraints

- Advanced tab only; Simple tab, `AdvancedRangePicker`, and saved presets unchanged.
- Default is "All" — `crossSurahOnly` missing/false must behave exactly as today.
- CLAUDE.md: no visible scrollbars, no eslint-disable comments, green only as fills (the `Segmented` control already complies).
- Tests: `CI=true npx react-scripts test --watchAll=false <path>` (plain `npm test` fails with "jest is not defined"). Working tree is CRLF.
- Don't run builds / cap sync; the user builds.

## Review Focus

1. A config stored before this change (no `crossSurahOnly`) → quiz behaves exactly as today. Covered by the existing `mutashabihat-ranges.test.ts` cases calling with two args.
2. A group with 2 Al-Baqarah + 1 Al-Imran verse, target is a Baqarah verse → siblings contain only the Imran verse. Test in Task 1.
3. A group whose only other-surah verse is *outside* the selected ranges → dropped in cross mode (cross check runs on in-range verses). Test in Task 1.
4. User picks 2 surahs, sets "Between surahs only", then removes one → toggle hides and Start sends `crossSurahOnly: false`. Enforced by the expression in Task 2 Step 3; check by review.
5. A single juz or page range crossing a surah boundary → counts as 2 surahs, so the toggle shows. Tests in Task 1.

---

### Task 1: Cross-surah logic (pure functions)

**Files:**
- Modify: `src/app/features/quiz/services/quiz-ranges.service.ts` (add after `totalPageCount`)
- Modify: `src/app/features/quiz/quizzes/mutashabihat/services/mutashabihat.service.ts:161-224`
- Test: `src/app/features/quiz/services/__tests__/quiz-ranges.service.test.ts`
- Test: `src/app/features/quiz/quizzes/mutashabihat/services/__tests__/mutashabihat-ranges.test.ts`

**Interfaces:**
- Produces: `rangeSurahs(ranges: QuizRange[]): Set<number>` — every surah any valid range touches.
- Produces: `filterGroupsByRanges(groups, ranges, crossSurahOnly = false)` — when true, keep a group only if its in-range verses span ≥ 2 distinct `sura`s.
- Produces: `buildMutashabihatQuestion(group, crossSurahOnly = false)` — when true, `siblingVerses` = group verses whose `sura !== target.sura`.

- [ ] **Step 1: Write failing tests for `rangeSurahs`** in `quiz-ranges.service.test.ts`, using the file's existing metadata mock (surah 1 = page 1, surah 2 = pages 2–49, every other surah = pages 100–110; juz 1 = 1:1 → 2:141):

```ts
describe("rangeSurahs", () => {
  it("returns the surah of a surah range", () => {
    expect([...rangeSurahs([{ kind: "surah", surah: 2 }])]).toEqual([2]);
  });
  it("spans every surah from a juz's first verse to its last", () => {
    expect([...rangeSurahs([{ kind: "juz", juz: 1 }])].sort()).toEqual([1, 2]);
  });
  it("includes every surah a page range overlaps", () => {
    expect([...rangeSurahs([{ kind: "pages", from: 1, to: 2 }])].sort()).toEqual([1, 2]);
    expect([...rangeSurahs([{ kind: "pages", from: 5, to: 10 }])]).toEqual([2]);
  });
  it("unions ranges and ignores invalid ones", () => {
    const out = rangeSurahs([
      { kind: "surah", surah: 1 },
      { kind: "surah", surah: 2 },
      { kind: "surah", surah: 999 },
    ]);
    expect([...out].sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Write failing tests** in `mutashabihat-ranges.test.ts` (reuse its `verse`/`group` helpers; import `buildMutashabihatQuestion`):

```ts
describe("filterGroupsByRanges — crossSurahOnly", () => {
  const both: QuizRange[] = [{ kind: "surah", surah: 2 }, { kind: "surah", surah: 3 }];
  it("drops a group whose in-range verses are all in one surah", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    expect(filterGroupsByRanges([g], both, true)).toEqual([]);
  });
  it("keeps a group spanning two selected surahs", () => {
    const g = group([verse(2, 1, 2, 1), verse(3, 1, 50, 3)]);
    expect(filterGroupsByRanges([g], both, true)).toHaveLength(1);
  });
  it("drops a group whose other-surah verse is outside the ranges", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1), verse(78, 1, 582, 30)]);
    expect(filterGroupsByRanges([g], both, true)).toEqual([]);
  });
});

describe("buildMutashabihatQuestion — crossSurahOnly", () => {
  it("shows only siblings from other surahs", () => {
    const g = { ...group([verse(2, 1, 2, 1), verse(2, 9, 3, 1), verse(3, 1, 50, 3)]), windowSize: 3, sharedPhraseRaw: "" };
    for (let i = 0; i < 20; i++) {
      const q = buildMutashabihatQuestion(g, true);
      expect(q.siblingVerses.length).toBeGreaterThan(0);
      expect(q.siblingVerses.every((s: any) => s.sura !== q.targetVerse.sura)).toBe(true);
    }
  });
  it("keeps same-surah siblings when the flag is off", () => {
    const g = { ...group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]), windowSize: 3, sharedPhraseRaw: "" };
    expect(buildMutashabihatQuestion(g).siblingVerses).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `CI=true npx react-scripts test --watchAll=false src/app/features/quiz/services/__tests__/quiz-ranges.service.test.ts src/app/features/quiz/quizzes/mutashabihat/services/__tests__/mutashabihat-ranges.test.ts`
Expected: FAIL — `rangeSurahs` is not a function / crossSurahOnly assertions fail.

- [ ] **Step 4: Implement**
  - `rangeSurahs` in `quiz-ranges.service.ts`, over `normalizeRanges(ranges)`: surah → that surah; juz → `getJuzStart(j).sura` … `getJuzEnd(j).sura` inclusive; pages → every surah `s` in 1..114 with `getSurahStartPage(s) <= to && getSurahEndPage(s) >= from`.
  - Add the optional `crossSurahOnly` parameter to `filterGroupsByRanges` and `buildMutashabihatQuestion` per the Interfaces block. Extend the `filterGroupsByRanges` doc comment by one line describing the flag.

- [ ] **Step 5: Run tests, verify they pass** (same command; expected: all pass, including the existing cases).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/quiz/services src/app/features/quiz/quizzes/mutashabihat/services
git commit -m "feat(mutashabihat): cross-surah filter and strict siblings"
```

### Task 2: Wire the toggle (config, setup UI, test page, strings)

**Files:**
- Modify: `src/app/shared/models/verse.model.ts:135-150` (`MutashabihatConfig`)
- Modify: `src/app/core/i18n/strings.ts` (type block ~L359, Arabic ~L1100, English ~L1866 — `quizSetup`)
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.tsx`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.css` (spacing for the new row only)
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx:133-157`

**Interfaces:**
- Consumes: `rangeSurahs`, `filterGroupsByRanges(groups, ranges, crossSurahOnly)`, `buildMutashabihatQuestion(group, crossSurahOnly)` from Task 1; `Segmented` from `src/app/shared/components/controls/Segmented.tsx`.
- Produces: `MutashabihatConfig.crossSurahOnly?: boolean` (doc comment: Advanced only; missing = false).

- [ ] **Step 1: Strings.** Add to `quizSetup` (type + both languages):
  - `matchModeLabel`: ar `"المتشابهات"` / en `"Similar verses"`
  - `matchAll`: ar `"كل المتشابهات"` / en `"All similar verses"`
  - `matchCrossSurah`: ar `"بين السور فقط"` / en `"Between surahs only"`

- [ ] **Step 2: Config type.** Add `crossSurahOnly?: boolean` to `MutashabihatConfig`.

- [ ] **Step 3: Setup page.**
  - State `matchMode: "all" | "cross"`, default `"all"`; `const multiSurah = useMemo(() => rangeSurahs(ranges).size >= 2, [ranges]);`
  - When `tab === "advanced" && multiSurah`, render below the `.ms-scroll-zone` that holds `AdvancedRangePicker`: a `.ms-match-mode` row with a `.ms-label` (`tq.matchModeLabel`) and `<Segmented label={tq.matchModeLabel} options={[{value:"all",label:tq.matchAll},{value:"cross",label:tq.matchCrossSurah}]} value={matchMode} onChange={setMatchMode} />`.
  - In `handleStart`: `crossSurahOnly: advanced && multiSurah && matchMode === "cross"` (the toggle's state is kept when it hides, but ignored — Review Focus 4).

- [ ] **Step 4: Test page.** `const crossSurah = !!config.ranges?.length && config.crossSurahOnly === true;` pass it to `filterGroupsByRanges(allGroups, config.ranges, crossSurah)` and to `buildMutashabihatQuestion(g, crossSurah)`.

- [ ] **Step 5: Verify**
  - Run: `npx tsc --noEmit -p .` — expected: no errors.
  - Run: `CI=true npx react-scripts test --watchAll=false src/app/features/quiz` — expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/models/verse.model.ts src/app/core/i18n/strings.ts src/app/features/quiz/quizzes/mutashabihat/pages
git commit -m "feat(mutashabihat): between-surahs-only toggle on Advanced tab"
```
