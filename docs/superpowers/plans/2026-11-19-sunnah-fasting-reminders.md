# Sunnah Fasting Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A notification the evening before each Sunnah fasting day, switched on/off in Settings → Notifications.

**Architecture:** A native Android reminder chain that mirrors the azkar reminders (one pending AlarmManager alarm; the receiver posts and re-arms). The fasting-day rules are a Kotlin port of the tracker's `fastingOccasion()`, held in step by a shared date fixture that both Jest and JUnit check.

**Tech Stack:** Kotlin (java.time `HijrahDate`, Umm al-Qura), Capacitor plugin `RafeeqPrayer`, React/Ionic, Jest (react-scripts), JUnit.

**Spec:** `docs/superpowers/specs/2026-11-19-sunnah-fasting-reminders-design.md`

## Global Constraints

- Android only; web/iOS report the reminder as off (same as azkar).
- Default **off**.
- Fire at **Isha + 30 min** on the evening before; **21:00** when no location is stored, Isha is undefined, or Isha + 30 is not before the fasting day's midnight.
- Never post: Ramadan, Eid al-Fitr, Eid al-Adha, the days of Tashreeq. Shawwal is announced only for **2 Shawwal**; days 3–29 of Shawwal still get Monday/Thursday/White Days reminders.
- One notification per evening; precedence = the tracker's (Arafah > Ashura > Tasu'a > Shawwal > White Days > Monday > Thursday).
- Late-delivery guard: drop (only re-arm) if more than **3 h** late or at/after the fasting day's local midnight.
- No ESLint-disable comments; no visible scrollbars; follow the project's CSS tokens.
- Request code **4400**, notification id **4401**, channel id `rafeeq_fasting`, tap opens `rafeeq://tracker` → `/tracker`.

## Review Focus

1. **Ramadan gap**: no reminders for ~30 days, so the next-day search must reach past Ramadan (look-ahead 40 days) — test: `findNext` from mid-Ramadan returns the 2 Shawwal reminder.
2. **Shawwal shadowing**: the tracker labels all of Shawwal "shawwal", which would hide Mondays — test: a Monday on 5 Shawwal gives MONDAY.
3. **Eid evening**: the 2 Shawwal reminder fires on Eid evening (1 Shawwal) — covered by the scheduler test above.
4. **High latitude**: Isha + 30 after midnight → 21:00 fallback — test in `FastingReminderSchedulerTest`.
5. **Off-range Hijri** (`HijrahDate.from` throws outside its range) → no occasion, no crash — test with a year-2200 date.

---

### Task 1: Kotlin fasting calendar + parity fixture

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/FastingCalendar.kt`
- Create: `android/app/src/test/resources/fasting-occasions.json` (generated from the JS tracker)
- Create: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/FastingCalendarTest.kt`
- Create: `src/app/features/tracker/__tests__/fastingParity.test.ts`

**Interfaces — Produces:**
- `enum class FastingOccasion { RAMADAN, ARAFAH, ASHURA, TASUA, SHAWWAL, WHITE_DAYS, MONDAY, THURSDAY }` with `val jsKey: String` ("ramadan", "arafah", "ashura", "tasua", "shawwal", "whiteDays", "monday", "thursday").
- `object FastingCalendar { fun occasionOn(date: LocalDate): FastingOccasion?; fun reminderFor(date: LocalDate): FastingOccasion? }`
  - `occasionOn` = exact port of `fastingOccasion()` (Ramadan included).
  - `reminderFor` = `occasionOn` with RAMADAN → null, SHAWWAL → SHAWWAL only on Hijri day 2, otherwise the White Days / Monday / Thursday rule.
  - Both return null when `HijrahDate.from` throws.

- [ ] Generate the fixture: every day 2026-01-01..2027-12-31 → `fastingOccasion(date)` (JSON object `{"YYYY-MM-DD": key | null}`).
- [ ] Jest `fastingParity.test.ts`: reads the fixture, asserts `fastingOccasion(new Date(y, m-1, d, 12))` equals each entry.
- [ ] JUnit `FastingCalendarTest`: `occasionOn` matches every fixture entry (via `jsKey`); `reminderFor` rules: Ramadan → null; 1 Shawwal → null; 2 Shawwal → SHAWWAL; a Monday on Shawwal day ≥ 3 → MONDAY; 13 Shawwal → WHITE_DAYS; 10–13 Dhul-Hijjah → null; 9 Dhul-Hijjah → ARAFAH; year 2200 → null.
- [ ] Implement, run both suites green, commit.

### Task 2: Scheduler, receiver, prefs, plugin, boot, strings

**Files:**
- Create: `.../prayer/FastingReminderScheduler.kt`, `.../prayer/FastingReminderReceiver.kt`
- Create: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/FastingReminderSchedulerTest.kt`
- Modify: `PrayerConfig.kt` (`fastingRemindersEnabled` / `setFastingRemindersEnabled`, key `fasting_reminders_enabled`), `RafeeqPrayerPlugin.kt` (`getFastingReminders` / `setFastingReminders({enabled})`; re-arm next to every `AzkarReminderScheduler.scheduleNext`), `PrayerBootReceiver.kt`, `AndroidManifest.xml` (receiver), `res/values{,-ar}/strings.xml`.

**Interfaces — Produces:**
- `data class FastingReminder(val occasion: FastingOccasion, val fastDate: LocalDate, val at: Date)`
- `internal fun FastingReminderScheduler.slotFor(fastDate: LocalDate, tz: TimeZone, eveBefore: DayTimes?): Date`
- `internal fun FastingReminderScheduler.findNext(now: Date, tz: TimeZone, prayersOn: (LocalDate) -> DayTimes?): FastingReminder?` — walks fast dates today..today+40, calendar check first, prayer times only for matching days.
- `internal fun FastingReminderScheduler.isTooLate(now: Long, at: Long, fastDate: LocalDate, tz: TimeZone): Boolean`
- `fun scheduleNext(ctx)`, `fun cancel(ctx)`; extras `fasting_occasion`, `fasting_at`, `fasting_date`.

- [ ] Tests: Isha + 30 on the eve; 21:00 without prayers; 21:00 when Isha + 30 ≥ midnight; findNext skips past slots; findNext from mid-Ramadan → 2 Shawwal at Eid evening; isTooLate (on time, 3 h+, after midnight).
- [ ] Implement; strings: channel + title per occasion + one shared text; run `gradlew testDebugUnitTest --tests "*Fasting*"`; commit.

### Task 3: Web service, Settings toggle, deep link

**Files:**
- Modify: `src/app/core/services/prayer/prayer-times.service.ts` (`getFastingReminders(): Promise<boolean>`, `setFastingReminders(enabled: boolean)`, `enableFastingReminders(): Promise<boolean>`, plugin interface entries)
- Modify: `src/app/features/settings/Settings.tsx` (`fastingReminders` field + default false, native read on mount, toggle handler + denied error row, `remindersOn` includes it, ToggleRow after Azkar)
- Modify: `src/app/core/i18n/strings.ts` (`fastingReminders`, `fastingRemindersDesc` ar + en)
- Modify: `src/App.tsx` (`rafeeq://tracker` → `/tracker`)
- Modify: `src/app/features/settings/__tests__/Settings.sync.test.tsx` mock (add the three new functions)
- Test: `src/app/features/settings/__tests__/Settings.fasting.test.tsx` — on → `enableFastingReminders` called, switch checked; denied → error row shown; off → `setFastingReminders(false)`.

- [ ] Write test, implement, run Jest for settings + tracker + full suite, `tsc --noEmit`, commit.

### Task 4: Ship

- [ ] Push branch, open PR, merge to main.
