# Prayer Alarms (منبّهات الصلاة) — Design

Date: 2026-10-03 · Status: approved in chat; user waived spec review and asked
for implementation to start straight away. Branch: `prayer-alarms`.

## Goal
Let the user set real, ringing alarms relative to prayer times — e.g. a suhoor
alarm 90 minutes before Fajr on fasting days and a "wake for Fajr" alarm 15
minutes after it — that keep following the prayer times every day without the
app being opened. Android only.

## Why not the system Clock app
`AlarmClock.ACTION_SET_ALARM` can create a Clock-app alarm but can never edit
or delete it, repeating Clock alarms are fixed-time (prayer times drift ~1
min/day and jump an hour at DST), and Android 10+ blocks starting another
app's activity from the background, so a daily sync is impossible. Rafeeq
rings its own alarms instead.

## Scope
- Android only. The Alarms entry is hidden on iOS and web.
- Separate from, and coexisting with, the existing prayer-time **reminder**
  notifications and azkar reminders. Nothing about those changes.

## Data model
Stored natively in SharedPreferences (new `PrayerAlarmConfig.kt`), because the
scheduler must re-arm after reboot with no WebView. The web UI reads/writes it
only through the `RafeeqPrayer` plugin.

```
PrayerAlarm {
  id: String            // UUID
  prayer: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"
  offsetMinutes: Int    // -180..180; negative = before the prayer
  label: String         // optional, "" when unset; trimmed, max 40 chars
  enabled: Boolean
  days: Set<Int>        // ISO weekday 1=Mon..7=Sun; all 7 by default; never empty
  ramadanOnly: Boolean
}

AlarmSettings {          // shared by all alarms
  soundUri: String?     // null = device default alarm sound
  soundName: String?    // display name captured at pick time
  snoozeMinutes: 5 | 10 | 15   // default 10
  vibrate: Boolean      // default true
  ramadanShiftDays: -1 | 0 | 1 // default 0; applies to alarms only
}
```

Several alarms per prayer, no hard cap.

## Which day an alarm belongs to
The date of its **prayer**, not the instant it rings. "Fajr −90 on Monday"
rings ~03:00 Monday and is a Monday alarm; "Isha +180" may ring after midnight
but belongs to the Isha's day. Weekday and Ramadan checks both use this date.

## Ramadan only
An alarm counts as in Ramadan when its prayer's civil date, shifted by
`ramadanShiftDays`, falls in Hijri month 9 of the Umm al-Qura calendar
(`android.icu.util.IslamicCalendar`, `ISLAMIC_UMALQURA`, same calendar the app
displays). This is the "fasting day" rule: suhoor, Fajr and iftar alarms are
right on every day. Known, accepted gap: an Isha Ramadan-only alarm misses the
eve of the first fast (first taraweeh) and fires on the eve of Eid.

`ramadanShiftDays` (+1 = "Ramadan starts a day later") adjusts for local moon
sighting. Shown in the Alarms sheet as "Ramadan starts: Earlier / As
calculated / Later".

## Scheduling
New `PrayerAlarmClockScheduler` (own request codes, so it never replaces the
reminder or widget-roll alarms).

- Exactly one pending ring alarm: the soonest next occurrence across all
  enabled alarms. Ringing (or stop / snooze / auto-stop) re-arms the next one —
  the same self-re-arming chain the reminders use.
- Next occurrence of an alarm: walk days from today forward up to 400 days;
  for each day, check weekday and Ramadan first (cheap), only then compute the
  prayer time for that day, add the offset, and take it if it is after now.
  400 days guarantees a Ramadan-only alarm always finds the next Ramadan.
- Several alarms due the same minute ring once, together (all their ids go in
  the intent).
- `AlarmManager.setAlarmClock()` when exact alarms are permitted (status-bar
  ⏰, Doze-exempt). Otherwise `setAndAllowWhileIdle()` and the sheet warns.
- The show-intent of `setAlarmClock` opens the app.
- Re-armed on: boot, time/timezone change, exact-alarm permission grant,
  package replaced (all via `PrayerBootReceiver`), any alarm/settings edit,
  location / method / madhab change (plugin `setLocation` / `setConfig`), and
  each ring, stop, snooze and auto-stop.
- Pure calculation (`nextOccurrence`, `nextRing`) is Context-free and unit
  tested.

## Ringing
`setAlarmClock` fires → `PrayerAlarmRingReceiver` → starts `AlarmRingService`
(foreground, type `systemExempted`) → posts the alarm notification with a
full-screen intent → `AlarmRingActivity` over the lock screen.

- **Stale guard**: an alarm delivered more than 30 minutes late (Xiaomi
  battery managers) is not rung; the chain is re-armed.
- **Sound**: `android.media.Ringtone` on the alarm stream (`USAGE_ALARM`),
  looping, volume ramping from quiet to full over ~20 s. Fallback order if the
  chosen URI cannot play: device default alarm → default ringtone → default
  notification. Never silent.
- **Vibration**: repeating pattern with alarm attributes, unless off.
- **In a call**: no sound, vibration + notification only.
- **Stop**: ends ringing, re-arms the chain.
- **Snooze**: schedules a one-off snooze alarm (own request code) at now +
  `snoozeMinutes`; repeatable; does not touch the main chain.
- **Auto-stop after 2 minutes**: silences, removes the ringing UI, posts
  "Missed alarm: Fajr − 1:30 (Suhoor)". Applies to snoozed rings too.
- A second alarm arriving while one rings updates the screen to list both;
  sound continues, it is not restarted.
- **Without exact-alarm permission** the inexact alarm may not be allowed to
  start the foreground service; the receiver then posts an insistent
  notification (`FLAG_INSISTENT`) on an alarm-audio channel with Stop/Snooze,
  `setTimeoutAfter(2 min)`.

### Ringing screen (native, not the WebView)
Rafeeq logo inside a slowly pulsing **green** ring (`colorPrimary` #0F7A5A),
the current time large, the prayer name + offset ("Fajr − 1:30") and labels in
**gold** (`colorAccent`), app night/day background, app language (RTL for
Arabic). Solid green **Stop**, outlined **Snooze**. `showWhenLocked` +
`turnScreenOn`.

### Notification
Channel `rafeeq_prayer_alarm` (IMPORTANCE_HIGH, no channel sound — the service
plays it). Small icon `ic_notification`, large icon the app icon, colorized
green background (allowed for foreground-service notifications), category
ALARM, full-screen intent, Stop and Snooze actions — works on heads-up, lock
screen and watches.

### Permissions (new)
`USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_SYSTEM_EXEMPTED`, `WAKE_LOCK`, `VIBRATE`. Play Console
needs declarations for full-screen intent and the systemExempted FGS type.

Without full-screen permission (Android 14+, not auto-granted to this app) the
alarm still rings at full volume as a heads-up notification; the sheet offers
"Allow full-screen alarms".

## UI (prayer page)
- `PrayerMenuSheet` gains an **Alarms** row (Android only) → `AlarmsSheet`.
- Timetable rows show a small alarm icon when the prayer has ≥1 enabled
  alarm; tapping it opens `AlarmsSheet` scrolled to that prayer.
- **AlarmsSheet**: health warnings on top (notifications, exact alarms,
  full-screen, battery optimisation); the five prayers with today's time, each
  listing its alarms (offset, label, repeat summary, next ring time, switch)
  and "+ Add alarm"; then Alarm settings: Sound, Snooze 5/10/15, Vibrate,
  Ramadan starts Earlier/Calculated/Later.
- **Alarm editor** (inside the sheet, back returns to the list): Before/After,
  minutes 0–180 with ±1/±5 steppers and direct entry, live "Next: …" preview
  from the native side, label, day chips Sat→Fri, "Only during Ramadan",
  Delete.
- Saving the first alarm asks, in order, for notifications (required), exact
  alarms and full-screen (both optional; a warning stays if refused).
- Sound picker: "Phone sounds" (system ringtone picker, alarm type) or
  "Audio file…" (`ACTION_OPEN_DOCUMENT` audio/*, persistable read permission).
- All copy Arabic + English in `strings.ts`; RTL layout. A What's new release
  entry announces the feature.

## Plugin API (`RafeeqPrayer`, wrapped by `prayer-alarms.service.ts`)
- `getAlarms()` → `{ alarms: (PrayerAlarm & { nextAt: string | null })[], settings }`
- `saveAlarm(alarm)` → `{ alarm }` (insert or update by id)
- `deleteAlarm({ id })`
- `setAlarmSettings(patch)`
- `previewAlarm(alarm)` → `{ nextAt: string | null }`
- `pickAlarmSound({ source: "system" | "file" })` → `{ uri, name } | { cancelled: true }`
- `getAlarmHealth()` → `{ notifications, exactAlarms, fullScreen, batteryOptimised }`
- `requestFullScreenAlarms()` → `{ granted }`

## Testing
- Kotlin unit tests: next-occurrence calculation (offsets crossing midnight,
  weekday by prayer date, Ramadan-only with shift, DST, same-minute grouping,
  distant Ramadan), config JSON round-trip and sanitising.
- Jest tests for the service wrapper and AlarmsSheet/editor with the plugin
  mocked.
- Manual device checklist: locked screen, silent, DND, forced Doze
  (`adb shell dumpsys deviceidle force-idle`), reboot, exact-alarm and
  full-screen revoked, deleted sound file, ring during a call, Xiaomi.
