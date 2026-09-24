# Worship Tracker (متابعة العبادات) — Design

Date: 2026-09-24 · Status: approved in chat, pending spec review

## Goal
A private daily worship tracker reachable from the More page, to help the user
stay consistent with obligatory and sunnah acts. Not for showing off — the Info
sheet says so explicitly. All data is local-only (see local-only user data policy).

## Entry point
- New card on `More.tsx` (`id: "tracker"`), route `/tracker`, pushed with `history.push`
  like the other More entries (hardware back returns to More).

## Sections & items
| Section (id) | Items | Unlocks at | Long-press |
|---|---|---|---|
| prayers (always on, 50%) | fajr, dhuhr, asr, maghrib, isha | their own prayer time | — |
| azkar | morning / evening / sleep | Fajr / Asr / Isha | open Azkar page (that category) |
| quran | daily reading | always | open Quran; Surah Al-Kahf on Friday |
| daily | duha | sunrise + 15 min | — |
| rawatib | fajr-sunnah, dhuhr-before, dhuhr-after, maghrib-sunnah, isha-sunnah, qiyam, witr | Fajr, Dhuhr, Dhuhr, Maghrib, Isha, Isha, Isha | — |
| fasting | fast-today | always | — |

The "Other" (أخرى) section in the reference screenshots is **dropped** — no custom items.

### Fasting visibility
The fasting section renders (and counts) only on recommended days, with a chip
naming the occasion (first match wins, in this priority):
Ramadan → Arafah (9 Dhul-Hijjah) → Ashura (10 Muharram) → Tasu'a (9 Muharram) →
Six of Shawwal (Shawwal 2–30) → White Days (Hijri 13–15) → Monday / Thursday.
Hijri date via `Intl.DateTimeFormat` with the `islamic-umalqura` calendar.
Days when fasting is prohibited (Eid al-Fitr, Eid al-Adha, 11–13 Dhul-Hijjah)
never show it, even if they fall on a Monday/Thursday/White Day.

## Tracking day
- A tracking day starts at **Fajr**, not midnight. Between local midnight and
  today's Fajr the tracker shows and edits the previous calendar day.
- Day key: `YYYY-MM-DD` of the Gregorian date the tracking day started on.
- Only the current tracking day is editable. The 7-day strip is display-only.

## Unlocking
- An item is locked (lock icon, tap does nothing) until its unlock time on the
  current tracking day. Times come from the existing on-device prayer-times service.
- Night items (sleep azkar, isha sunnah, qiyam, witr) remain unlocked from Isha
  until the next Fajr (the end of the tracking day).
- No location / no prayer times available → nothing is time-locked, and a small
  hint links to set a location.

## Scoring
- Prayers = 50% (ticked/5 × 50).
- The remaining 50% is split equally among sections that are enabled in settings
  **and** visible today (fasting only on recommended days). Each section contributes
  `(ticked/total) × share`.
- If no other section is active, prayers = 100%.
- Score rounded to an integer for display.

## Storage (local only)
- `localStorage` key `rafeeq.tracker.days`: `Record<dayKey, string[]>` of ticked item ids.
  Pruned to the last 7 day keys on every write.
- `localStorage` key `rafeeq.tracker.settings`: `Record<sectionId, boolean>`; defaults to all on.
- Reads wrapped in try/catch; corrupt data → empty.

## UI (matches reference screenshots)
- Header bar: back button, title, ⋯ menu (Settings, Info).
- Header card: weekday, Hijri — Gregorian date, progress ring with today's %,
  a 7-day strip (weekday, date, dot filled in proportion to that day's score; today highlighted).
- Sections: title + `ticked/total` count; prayers as a 5-tile row; other items as
  cards with an icon, a title, an optional subtitle, and a lock or ticked state.
- Settings sheet (IonModal): per-section toggles with live % chips; prayers row
  fixed with the "obligatory" label; footnote explaining the 50/50 rule.
- Info sheet (IonModal): three cards — the purpose, how to use it, time-locked acts.
- Follows CLAUDE.md: `var(--max-width-mobile)` cap, bottom-nav padding,
  no visible scrollbars, no eslint-disable. All strings in `strings.ts` (ar + en).

## Module layout
- `src/app/features/tracker/trackerCatalog.ts` — sections/items/unlock rules (data).
- `src/app/features/tracker/trackerLogic.ts` — pure: dayKey(now, fajr), isUnlocked,
  fastingOccasion(date), score(ticked, settings, visibleSections).
- `src/app/features/tracker/trackerStore.ts` — localStorage read/write/prune.
- `src/app/features/tracker/WorshipTracker.tsx` + `.css` — page.
- `TrackerSettingsSheet.tsx`, `TrackerInfoSheet.tsx` — modals.
- Route registered in `App.tsx`; card + label in `More.tsx` / `strings.ts`.

## Testing
- Vitest is currently broken repo-wide; `tsc --noEmit --noUnusedLocals` is the gate.
- Pure logic kept dependency-free so unit tests can be added once Vitest works.

## Out of scope
Custom items, editing past days, streaks and statistics, notifications.
