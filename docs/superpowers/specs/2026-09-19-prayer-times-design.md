# Prayer Times — Design

Date: 2026-09-19
Status: Approved, not yet implemented
Branch: `prayer-times`, off `more-tab`

## Problem

The More page (added on `more-tab`) carries a disabled **مواقيت الصلاة** card,
and Settings has carried a disabled **تنبيهات مواقيت الصلاة** toggle since
before that — labelled "قريباً — سيتطلب إذن الموقع". Neither does anything yet.

This design builds the feature in three parts:

1. **The page** — today's six times, which prayer is next, how long until it.
2. **Reminders** — a notification at each prayer time.
3. **A home-screen widget** — today's times without opening the app.

The three are specified together because the third constrains the first, in a
way that is not obvious.

## Why the widget decides the architecture

An Android home-screen widget is `RemoteViews` inflated by the launcher process.
It has no WebView, no JavaScript, and no access to the app's JS runtime. The app
need never have been launched.

So if the widget must show prayer times, the *calculation* cannot live only in
JavaScript. Three options were considered:

- **Compute in JS, cache for the widget.** The app writes today's times to
  `SharedPreferences`; the widget renders that cache. Least native code, but the
  widget is blank on a fresh install, stale after midnight if the app has not
  been opened, and blank again after a reboot. Refreshing it without the app
  means a background job that computes times — which is the native calculation
  this option was trying to avoid.
- **Compute in Kotlin; JS asks the plugin.** Single source of truth, but the web
  layer gains a native round-trip for something it could do locally, and the page
  cannot render at all if the bridge fails.
- **Compute in Kotlin, shared by all three consumers.** Chosen.

The reminders push the same way: an exact alarm at a prayer time is an
`AlarmManager` concern, and a JS timer cannot fire when the app is not running.
Both the widget and the reminders want native calculation, so that is where it
goes.

### Chosen architecture

`com.batoulapps.adhan:adhan:1.2.1` (Maven Central) is the Java port of the same
library, by the same authors, as the `adhan` npm package — identical algorithms,
so the page, the widget and the notifications cannot disagree about when Maghrib
is. One Kotlin object owns calculation; three consumers read from it:

```
              ┌──────────────────────────────┐
              │  PrayerTimesEngine (Kotlin)  │
              │  adhan-java + stored coords  │
              └──────────────┬───────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   RafeeqPrayerPlugin   PrayerAlarm…        PrayerWidget…
   (Capacitor bridge)   (AlarmManager)      (AppWidgetProvider)
        │
   Prayer Times page (React)
```

The app already has this pattern: `RafeeqAutoPlugin` is a Capacitor plugin
bridging JS to a native `RafeeqMediaService`, registered in `MainActivity`. The
prayer plugin follows it, including its registration line.

**No `adhan` npm package is installed.** Calculation exists once, in Kotlin.

## Terminology

- **Prayer** — one of the five obligatory times: Fajr, Dhuhr, Asr, Maghrib,
  Isha. **Sunrise** (الشروق) is displayed alongside them but is not a prayer;
  it never gets a reminder and is never "next prayer" for the countdown.
- **Method** — a calculation convention (Egyptian, Umm al-Qura, MWL…) defining
  the sun-angle parameters for Fajr and Isha.
- **Madhab** — affects Asr only: Shafi (shadow ×1) or Hanafi (shadow ×2).

## Platform scope

**Android only.** There is no `ios/` directory in this repository. The widget
and the exact-alarm scheduling are Android APIs with no iOS equivalent as
designed. If iOS is added later, the page needs a JS calculation fallback and
the widget needs a WidgetKit rewrite; neither is in scope here.

## Location

Prayer times need coordinates. `@capacitor/geolocation` (8.2.2, matching
Capacitor 8) requests them from the web layer.

**Coarse location only.** `ACCESS_COARSE_LOCATION`, not fine. Prayer times shift
by roughly four seconds per kilometre of longitude, so city-level accuracy is
already below the display resolution of one minute. Coarse also yields a gentler
permission prompt.

The last known fix is persisted with `@capacitor/preferences` (already a
dependency) **and** mirrored into `SharedPreferences` for the native side, which
cannot read Preferences' storage. On launch the page renders from the stored
coordinates immediately and refreshes them in the background; a first run with
no stored fix shows a permission prompt, not a spinner.

**Permission denied is a designed state, not an error.** The page explains that
prayer times need a location and offers a button to grant it. It is not a dead
end and not a toast.

### Timezone caveat

Times are computed as instants and formatted with the device timezone. This is
correct while the stored coordinates and the device clock agree — the normal
case. It breaks for a user reading times for a city they are not in, which is
why manual city entry is deferred: doing it properly requires shipping an
offline city-to-timezone table. Not in scope.

## Defaults

- **Method: Egyptian General Authority of Survey.** The user is in Egypt.
- **Madhab: Shafi.**

Both are user-changeable on the Prayer Times page itself — an `InlineSelect`,
the component Settings already uses — not buried in the 937-line `Settings.tsx`.
The choice persists to `SharedPreferences` so the widget and alarms honour it
too.

## Stage 1 — Calculation and the page

### Native

`android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngine.kt`
wraps adhan-java: given coordinates, a date, a method and a madhab, it returns
the six times, plus which prayer is next and the interval until it. Pure
functions over stored state — no Android UI dependencies, so it is unit
testable.

`RafeeqPrayerPlugin.kt` exposes it to JS:

- `getTimes({ date? })` → the six times as ISO instants, plus `next`
- `setLocation({ lat, lng })` → store coordinates, trigger a widget refresh
- `getConfig()` / `setConfig({ method, madhab })`

Registered in `MainActivity.onCreate` beside `RafeeqAutoPlugin`.

### Web

`src/app/core/services/prayer/prayer-times.service.ts` is the only module that
talks to the plugin. It owns location acquisition, permission state, and the
JS-side cache; the page never calls the plugin directly.

`src/app/features/prayer-times/PrayerTimes.tsx` + `.css`:

- The six times as a list, Sunrise visually distinguished from the five prayers
- The next prayer highlighted, with a live countdown
- Method and madhab pickers
- Hijri date, from `Intl.DateTimeFormat` with the `islamic-umalqura` calendar —
  free, no dependency
- `<BottomNavBar active="more" fixed />`, width capped at
  `var(--max-width-mobile, 600px)`, and
  `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`

The countdown ticks once a second and recomputes the day's times when the date
rolls over; `useIonViewWillEnter` refreshes on re-entry, as `Account.tsx` does.

Routing: `/prayer-times` in `App.tsx`, **not** in `ROOT_TAB_PATHS` — it is a
sub-page of More, so back returns to More. `More.tsx` drops `comingSoon` from
the prayerTimes entry.

Strings: a `prayerTimes` block in both locales — prayer names, method labels,
permission copy, countdown phrasing.

## Stage 2 — Reminders

`PrayerAlarmScheduler.kt` schedules an exact alarm per enabled prayer using
`AlarmManager.setExactAndAllowWhileIdle`, so a reminder is not swallowed by
Doze.

**Permission: `USE_EXACT_ALARM`, not `SCHEDULE_EXACT_ALARM`.** Android's own
documentation names prayer-time and alarm-clock apps as the acceptable use case
for it. It is granted at install, cannot be revoked, and needs no
`canScheduleExactAlarms()` check or settings round-trip. `POST_NOTIFICATIONS` is
requested at runtime on Android 13+.

**Prayer times move every day, so nothing recurs.** Each alarm fires once; the
receiver's first job is to schedule the next one. Two other events also trigger
a reschedule: `BOOT_COMPLETED`, because alarms do not survive a reboot, and
`TIMEZONE_CHANGED`.

The notification carries the prayer name and its time, and opens the Prayer
Times page when tapped.

**Sound is out of scope.** These are notifications, using the user's chosen
notification sound. A full adhan playback — audio file, ducking, respecting
silent mode, a stop control — is a separate feature. The reminder tells you it
is time; it does not call the adhan.

Settings: the `prayerReminders` toggle loses its disabled state and gains
per-prayer control. Turning it on when location was never granted prompts for
location first, because there is nothing to schedule without it.

## Stage 3 — Widget

`PrayerWidgetProvider` (`AppWidgetProvider`) with a `RemoteViews` layout showing
today's times and the next prayer highlighted. It reads `PrayerTimesEngine`
directly, so it renders correctly on a launcher restart, after a reboot, and if
the app has never been opened that day.

Updated on three occasions: `onUpdate` from the system, after each prayer alarm
fires (the next prayer changed), and whenever the app changes location or
method. A daily midnight alarm rolls the widget to the new day.

Layouts for light and dark via `res/layout` and `res/layout-night`, matching the
day/night split the app's `values`/`values-night` already use. Resizable, with a
`previewImage` for the picker.

**If no location has ever been granted**, the widget shows the app name and a
prompt to open the app, and tapping it does — it never shows wrong times.

## Testing

**Native, per stage.** `PrayerTimesEngine` is the TDD unit: pure functions,
fixed inputs, published expected outputs. The reference case is Cairo
(30.0444°N, 31.2357°E) on a fixed date under the Egyptian method, checked
against the Egyptian General Authority's published table, expecting ±1 minute.
A second case at high latitude confirms the library's twilight fallback does not
throw. These run under the existing Gradle unit-test setup, not Jest, because
the code is Kotlin.

**Web.** `prayer-times.service.ts` is tested against a mocked plugin —
permission-denied, no-stored-location and happy paths — in a `__tests__` folder,
matching the convention commit `5d61d31` established. The page itself is
presentational and is verified by running the app; the existing 26 suites must
stay green.

**Manual, because no test covers them:** the widget on a real launcher, a
reminder firing with the app swiped away, and both surviving a reboot.

## Out of scope

- iOS anything
- Adhan audio playback
- Manual city entry, and any offline city/timezone table
- Qibla — the other placeholder card on the More page, separate feature
- Monthly or yearly prayer calendars
- Custom per-prayer time offsets

## Build note

`@capacitor/geolocation` is a native plugin: after installing it the user must
run `npx cap sync android`, or `Geolocation.getCurrentPosition` throws at
runtime. The user builds the app themselves; this spec does not.

Installing on this machine requires `$env:ComSpec` to be set first, or npm fails
with a misleading `ERR_INVALID_ARG_TYPE`.
