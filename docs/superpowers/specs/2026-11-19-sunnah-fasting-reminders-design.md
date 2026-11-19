# Sunnah Fasting Reminders — Design

Date: 2026-11-19 · Size: small change (short design)

## Intent

Remind the user **the evening before** a Sunnah fasting day, so they can plan
suhoor and make the intention. Turned on and off by a new switch in
Settings → Notifications, next to Prayer and Azkar reminders.

## Goals

- One notification the evening before each Sunnah fasting day.
- Keeps arriving whether or not the app is opened (same reliability as the
  azkar and prayer reminders).
- Agrees with the Worship Tracker about which days are fasting days.

## Non-goals

- No per-occasion toggles (one switch, as asked).
- No Ramadan reminders (obligatory; nobody needs telling).
- No web/iOS reminders (none of the existing reminders exist there either).
- No local moon-sighting shift (the tracker doesn't apply one; v1 stays
  consistent with it).

## Anti-goals

- Spam: never more than one notification per evening; Shawwal is announced
  once, not every day of the month.
- A reminder for a day on which fasting is forbidden (Eid al-Fitr, Eid
  al-Adha, the days of Tashreeq).

## Which days (decided)

The tracker's `fastingOccasion()` list (src/app/features/tracker/trackerLogic.ts),
minus Ramadan:

| Occasion | Rule (Umm al-Qura Hijri) |
|---|---|
| Arafah | 9 Dhul-Hijjah |
| Ashura | 10 Muharram |
| Tasu'a | 9 Muharram |
| Six of Shawwal | announced once, on the evening of 1 Shawwal (Eid day) for 2 Shawwal |
| White Days | 13, 14, 15 of any month |
| Monday / Thursday | weekday |

Same precedence as the tracker, so a day matching twice gets one notification
naming the more specific reason (e.g. a Monday on the 13th → "White Days").
Eid and Tashreeq days return no occasion, as in the tracker. All other
Shawwal days (3–29) are not reminded as "Shawwal"; they still produce
Monday/Thursday/White Days reminders where they apply.

## When it fires (decided)

The evening before the fasting day: **Isha + 30 min** when a location is
stored, **21:00** local time otherwise (or when Isha is undefined at high
latitudes). Lateness guard: a reminder delivered more than ~3 h late, or
after midnight, is dropped (only the re-arm happens).

## Approaches

1. **Native Android scheduler (picked).** A Kotlin port of the fasting-day
   rules (`java.time.chrono.HijrahDate`, the same Umm al-Qura calendar as the
   JS `Intl` `islamic-umalqura` used by the tracker). One pending alarm; the
   receiver posts and re-arms. Survives the app never being reopened. Cost: the
   rules exist twice, so a parity test covers them.
2. JS computes the next ~60 days and hands native a list. One copy of the
   rules, but reminders silently stop when the app isn't opened. Rejected.
3. Add `@capacitor/local-notifications`. New dependency alongside the existing
   native reminder stack, same staleness failure as 2. Rejected.

## Design (mirrors azkar reminders)

Native (`android/.../prayer/`):
- `FastingOccasion` + pure `FastingCalendar.occasionFor(LocalDate)` — Kotlin
  port of the tracker rules, unit-tested; returns only reminder-worthy
  occasions (no Ramadan; Shawwal only on 2 Shawwal).
- `FastingReminderScheduler` — like `AzkarReminderScheduler`: finds the next
  fasting day within a bounded look-ahead (≈ 8 days always contains a
  Monday/Thursday), computes the evening-before slot, arms it via
  `PrayerAlarmScheduler.setAlarm` with its own request code (e.g. 4400).
  The occasion and fast date go in intent extras.
- `FastingReminderReceiver` — like `AzkarReminderReceiver`: own channel
  (`rafeeq_fasting`), app-locale strings, best-effort post, always re-arms.
  Registered in the manifest.
- `PrayerConfig` — `fastingRemindersEnabled` pref (default off).
- `RafeeqPrayerPlugin` — `getFastingReminders` / `setFastingReminders`; also
  re-arm fasting wherever azkar is re-armed (location fix, method/madhab change),
  since Isha moves.
- `PrayerBootReceiver` — re-arm after reboot / time change.
- Strings in `values/` and `values-ar/`: channel name, one title + text per
  occasion (e.g. "Tomorrow is Monday — a Sunnah fast" / "غداً الاثنين — يُسنّ صيامه").

Web:
- `prayer-times.service.ts` — `getFastingReminders`, `setFastingReminders`,
  `enableFastingReminders` (notification permission + exact-alarm request,
  no location required — same as azkar).
- `Settings.tsx` — `fastingReminders` field, a `ToggleRow` in the
  Notifications card after Azkar, permission-denied error row, included in
  `remindersOn` so the exact-alarm/battery warnings cover it.
- `strings.ts` — `fastingReminders` / `fastingRemindersDesc` (ar + en).

Tests:
- Kotlin: `FastingCalendarTest` (each occasion, precedence, Eid/Tashreeq,
  Ramadan excluded, Shawwal once), `FastingReminderSchedulerTest` (slot is
  previous evening, Isha vs 21:00 fallback, next-day search).
- Parity: a shared fixture of dates → expected occasion, checked by both a
  Jest test against `fastingOccasion()` and the Kotlin test.
- Jest: Settings toggle on/off/denied.

## Left to the builder

- Exact notification wording (keep the app's Arabic terms).
- Tap target: open the Worship Tracker if a `rafeeq://` route exists for it,
  otherwise just open the app.
- Whether to add a "What's new" entry (Android-only) and a RELEASE-NOTES line
  at the next versionCode bump.
