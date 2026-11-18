# Mutashabihat — "Between surahs only" option (Advanced tab)

Date: 2026-11-18 · Size: small change

## Intent

When the Advanced selection spans more than one surah, the user wants to drill
the similar verses that sit in *different* surahs — telling surahs apart —
without the within-one-surah pairs diluting the quiz.

## Today

`MutashabihatTest` builds every 3-word-opening group from the whole Quran, then
`filterGroupsByRanges` keeps verses inside any selected range and keeps a group
if ≥ 2 verses survive. Same-surah and cross-surah pairs are both included.

## Goals

- Advanced tab only: a two-option toggle **All similar verses** / **Between surahs only**.
- Shown only when the selected ranges cover ≥ 2 surahs (a single juz or page
  range that crosses a surah boundary counts).
- Default **All** — no behaviour change unless the user opts in.

## Non-goals

- Simple tab (user asked for Advanced only).
- The shared `AdvancedRangePicker` (also used by the other two quizzes) and saved
  range presets — presets store ranges only, not this toggle.

## Approaches

1. **Setting on the Mutashabihat setup page, read by the service filter** — chosen.
2. Toggle inside `AdvancedRangePicker` — rejected: the picker is shared by
   AkmelAlAyah / AkmelAlNehayat, where the option is meaningless.

## Decided behaviour

- **Config:** optional `crossSurahOnly?: boolean` on `MutashabihatConfig`; only
  set when starting from the Advanced tab. Missing = false (stored configs keep working).
- **Filter:** in Between mode a group is kept only if its in-range verses come
  from ≥ 2 distinct surahs.
- **Question — strict (user picked option B):** the sibling verses shown with a
  question are only those from surahs *other than* the target's. Every verse in a
  kept group has at least one such sibling, so no question is left without one.
- **Empty result:** existing "no mutashabihat" error.
- **UI:** existing unified `Segmented` control; Arabic + English strings in the
  app's own terms. Follow CLAUDE.md CSS rules.
- **Tests:** unit tests for the cross-surah filter and the strict sibling list.

## Left to the builder

- How to compute "ranges cover ≥ 2 surahs" (existing page/juz metadata, e.g.
  `PAGE_STARTS`), and whether to reset the toggle to All when the selection drops
  to one surah.
- Exact label wording.
