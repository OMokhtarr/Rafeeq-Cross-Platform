# Prayer Alarms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ringing alarms relative to prayer times (several per prayer, ± up to 180 min, weekday + Ramadan-only filters) that re-arm themselves daily on Android.

**Architecture:** Native Kotlin owns the alarm list, the next-ring calculation and the ringing (AlarmManager.setAlarmClock → receiver → foreground service + full-screen activity). The React prayer page edits the list through new `RafeeqPrayer` plugin methods. Pure calculation lives in a Context-free object so it is JVM-unit-tested.

**Tech Stack:** Kotlin, AlarmManager, NotificationCompat, foreground service (systemExempted), java.time HijrahDate, org.json; React + Ionic, Capacitor plugin bridge, Jest (react-scripts).

**Spec:** `docs/superpowers/specs/2026-10-03-prayer-alarms-design.md`

## Global Constraints

- Android only; the Alarms UI is hidden when `Capacitor.getPlatform() !== "android"`.
- Offsets −180..180 minutes; snooze 5/10/15 (default 10); vibrate default true; ramadanShiftDays −1/0/1 (default 0).
- Auto-stop ringing after 2 minutes; stale guard 30 minutes.
- Ringing screen: green `colorPrimary` #0F7A5A for actions + pulsing ring, gold `colorAccent` for prayer/labels, app night/day background, app language.
- Notification: `ic_notification` small icon, colorized green, category ALARM, Stop + Snooze actions.
- No visible scrollbars; page width via `var(--max-width-mobile, 600px)`; no eslint-disable comments.
- All UI copy in Arabic and English.
- Do not run app builds / cap sync. Android unit tests and jest/tsc are allowed as verification.
- Android unit tests: from `android/`, `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew.bat :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.*" --rerun-tasks`.
- Web tests: `CI=true npx react-scripts test --watchAll=false --testPathPattern <pattern>`; types: `npx tsc --noEmit -p tsconfig.json`.

## Review Focus

1. An offset that pushes the ring time across midnight (Fajr −180, Isha +180) — weekday/Ramadan judged by the prayer's date, and the ring still lands on the right instant. Pinned in Task 2 tests.
2. A day with no prayer time (high latitude) — that day is skipped, no crash, no fabricated time. Pinned in Task 2 tests.
3. All alarms disabled / list empty / alarm whose only matching day is never (empty days set is sanitised to all 7) — nothing scheduled, pending alarm cancelled. Pinned in Task 1 + Task 2 tests.
4. Corrupt or partially-written stored JSON — decoder drops bad entries rather than throwing in a boot receiver. Pinned in Task 1 tests.
5. Two alarms at the same minute — one ring carrying both ids. Pinned in Task 2 tests.

---

### Task 1: Alarm model and storage (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmConfig.kt`
- Modify: `android/app/build.gradle` (add `testImplementation "org.json:json:20240303"` — Android's org.json is a stub under `returnDefaultValues = true`)
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerAlarmConfigTest.kt`

**Interfaces — Produces:**
```kotlin
data class PrayerAlarm(
    val id: String, val prayer: PrayerName, val offsetMinutes: Int, val label: String,
    val enabled: Boolean, val days: Set<DayOfWeek>, val ramadanOnly: Boolean,
)
data class AlarmSettings(
    val soundUri: String?, val soundName: String?, val snoozeMinutes: Int,
    val vibrate: Boolean, val ramadanShiftDays: Int,
)
object PrayerAlarmConfig {
    val ALARM_PRAYERS: List<PrayerName>          // FAJR, DHUHR, ASR, MAGHRIB, ISHA
    const val MAX_OFFSET = 180
    val SNOOZE_CHOICES = listOf(5, 10, 15)
    fun sanitise(a: PrayerAlarm): PrayerAlarm
    fun encodeAlarms(list: List<PrayerAlarm>): String
    fun decodeAlarms(json: String?): List<PrayerAlarm>   // never throws; drops bad entries
    fun alarmFromJson(o: JSONObject): PrayerAlarm?
    fun alarmToJson(a: PrayerAlarm): JSONObject
    fun encodeSettings(s: AlarmSettings): String
    fun decodeSettings(json: String?): AlarmSettings
    fun settingsToJson(s: AlarmSettings): JSONObject
    fun alarms(ctx: Context): List<PrayerAlarm>
    fun setAlarms(ctx: Context, list: List<PrayerAlarm>)
    fun upsert(ctx: Context, alarm: PrayerAlarm): PrayerAlarm
    fun delete(ctx: Context, id: String)
    fun settings(ctx: Context): AlarmSettings
    fun setSettings(ctx: Context, s: AlarmSettings)
}
```
JSON keys: `id, prayer ("fajr"…), offsetMinutes, label, enabled, days ([1..7] ISO), ramadanOnly`; settings `soundUri, soundName, snoozeMinutes, vibrate, ramadanShiftDays`.

Sanitising: offset clamped to ±180; label trimmed, max 40 chars; empty `days` → all seven; prayer must be in ALARM_PRAYERS (else entry dropped); snooze not in choices → 10; shift clamped to −1..1.

- [ ] Step 1: Write tests — round-trip of a full alarm; decode of `null`, `""`, `"not json"`, an array with one valid + one invalid entry (unknown prayer, missing id) keeps only the valid one; sanitise clamps 500→180 / −500→−180, empty days → all 7, 60-char label → 40; settings default when null; snooze 7 → 10; shift 3 → 1.
- [ ] Step 2: Add org.json test dependency; run tests → FAIL (unresolved PrayerAlarmConfig).
- [ ] Step 3: Implement `PrayerAlarmConfig.kt` (SharedPreferences `PrayerConfig.PREFS_NAME`, keys `alarms_json`, `alarm_settings_json`).
- [ ] Step 4: Run tests → PASS.
- [ ] Step 5: Commit.

### Task 2: Next-ring calculation (pure Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmMath.kt`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerAlarmMathTest.kt`

**Interfaces — Consumes:** `PrayerAlarm`, `PrayerName`, `DayTimes`. **Produces:**
```kotlin
data class AlarmRing(val at: Long, val alarmIds: List<String>, val prayerAt: Map<String, Long>)
object PrayerAlarmMath {
    const val HORIZON_DAYS = 400
    fun isRamadan(date: LocalDate, shiftDays: Int): Boolean   // HijrahDate(date.minusDays(shift)).month == 9
    fun applies(alarm: PrayerAlarm, date: LocalDate, shiftDays: Int): Boolean
    fun nextOccurrence(alarm: PrayerAlarm, now: Long, zone: ZoneId, shiftDays: Int,
                       timesOn: (LocalDate) -> DayTimes?): Pair<Long, Long>?  // (ringAt, prayerAt)
    fun nextRing(alarms: List<PrayerAlarm>, now: Long, zone: ZoneId, shiftDays: Int,
                 timesOn: (LocalDate) -> DayTimes?): AlarmRing?
}
```
Rules: start from `LocalDate` of `now` minus 1 day (a Fajr −180 for tomorrow could be today; an Isha +180 from yesterday could ring after midnight today), walk up to HORIZON_DAYS; skip disabled alarms; `applies` checks `date.dayOfWeek in days` and (`!ramadanOnly || isRamadan`); then prayer time from `timesOn(date)`, skip when null; `ringAt = prayerAt + offset*60000`; accept the first `ringAt > now`. Ramadan shift: +1 means "Ramadan starts a day later", so the Hijri date used is of `date.minusDays(shift)`. `nextRing` takes the minimum `ringAt` and groups every alarm whose next occurrence is in the same minute (floor to minute).

- [ ] Step 1: Tests with a fake `timesOn` returning fixed times (Fajr 04:30, Isha 19:00, Cairo zone): Fajr −90 rings 03:00 same day; Fajr −90 when now is 03:30 → next day 03:00; Isha +180 rings 22:00; Isha +300 crossing midnight is clamped by sanitise? (no: math accepts any offset) — test Isha +180 where Isha is 22:00 → rings 01:00 next calendar day and belongs to the earlier date's weekday (alarm with days={MONDAY}, Monday Isha 22:00 → ring Tuesday 01:00); now just after midnight Tuesday 00:30 → still finds Monday's +180 ring at 01:00 (start-minus-one-day rule); weekday filter skips to next allowed day; `timesOn` returning null for a day skips it; disabled alarms ignored; empty list → null; two alarms same minute grouped; Ramadan: `isRamadan(LocalDate.of(2027,2,10),0)` false-or-true checked against `HijrahDate` directly (assert 1 Ramadan 1448 = HijrahDate.of(1448,9,1) maps to a LocalDate D; isRamadan(D,0) true, isRamadan(D.minusDays(1),0) false, isRamadan(D,1) false, isRamadan(D.plusDays(29 or 30 end), …)); Ramadan-only alarm with now in Shawwal finds next Ramadan within horizon.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit.

### Task 3: Scheduler, receiver wiring and re-arm triggers

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmClockScheduler.kt`
- Modify: `PrayerBootReceiver.kt` (call `PrayerAlarmClockScheduler.scheduleNext`), `RafeeqPrayerPlugin.kt` (`load`, `setLocation`, `setConfig` method/madhab → reschedule).

**Produces:**
```kotlin
object PrayerAlarmClockScheduler {
    const val EXTRA_ALARM_IDS = "alarm_ids"          // String[]
    const val EXTRA_PRAYER_AT = "alarm_prayer_at"    // long[] parallel to ids
    const val EXTRA_RING_AT = "alarm_ring_at"
    fun nextRing(ctx: Context, now: Long = System.currentTimeMillis()): AlarmRing?
    fun previewNext(ctx: Context, alarm: PrayerAlarm): Long?
    fun scheduleNext(ctx: Context)                   // cancels when nothing to ring
    fun scheduleSnooze(ctx: Context, ids: Array<String>, prayerAts: LongArray)
    fun cancelSnooze(ctx: Context)
    fun cancel(ctx: Context)
}
```
`timesOn` = `PrayerTimesEngine.timesFor(lat, lng, Date at local noon of date, method, madhab, TimeZone.getDefault())`. Request codes 4220 (main) and 4221 (snooze), targeting `PrayerAlarmRingReceiver` with action `ACTION_RING`. `setAlarmClock(AlarmClockInfo(at, showIntent→MainActivity), op)` when `PrayerAlarmScheduler.canScheduleExact`, else `setAndAllowWhileIdle`. Re-armed from boot receiver (already receives BOOT, TIME_SET, TIMEZONE_CHANGED, exact-alarm grant, package replaced).

- [ ] Step 1: Implement scheduler + wiring (Context-bound; logic is covered by Task 2).
- [ ] Step 2: Compile via the unit-test task → PASS.
- [ ] Step 3: Commit (together with Task 4 if the receiver class is needed to compile).

### Task 4: Ringing — receiver, service, activity, notification

**Files:**
- Create: `prayer/PrayerAlarmRingReceiver.kt` (actions `ACTION_RING`, `ACTION_STOP`, `ACTION_SNOOZE`, `ACTION_TIMEOUT`)
- Create: `prayer/AlarmRingService.kt` (foreground, `systemExempted`; plays `Ringtone` USAGE_ALARM looping with 20 s volume ramp on API 28+; vibration; wake lock; 2-min timeout via Handler; in-call → vibrate only; posts colorized green notification with full-screen intent + Stop/Snooze; missed-alarm notification on timeout; merges a second ring's ids into the current one)
- Create: `prayer/AlarmRingActivity.kt` + `res/layout/activity_alarm_ring.xml` + `res/drawable/alarm_ring_pulse.xml`, `alarm_btn_stop.xml`, `alarm_btn_snooze.xml`
- Create: `prayer/AlarmText.kt` — `offsetLabel(prayerName, offsetMinutes, res)` e.g. "Fajr − 1:30" / "الفجر − ١:٣٠", and `ringTitle(...)` shared by notification, activity and missed notification.
- Modify: `res/values/strings.xml`, `res/values-ar/strings.xml` (alarm strings), `AndroidManifest.xml` (receiver, service, activity with `showWhenLocked`/`turnScreenOn`, permissions `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_SYSTEM_EXEMPTED`, `WAKE_LOCK`, `VIBRATE`), `res/values/styles.xml` (AlarmRingTheme).
- Test: `PrayerAlarmMathTest` gains `AlarmText.formatOffset` tests (pure: minutes → "1:30", sign).

Receiver on `ACTION_RING`: stale guard (ring instant > 30 min ago → skip), then if exact alarms allowed start the FGS (`ContextCompat.startForegroundService`), catching `ForegroundServiceStartNotAllowedException` → fallback insistent notification on channel `rafeeq_prayer_alarm_fallback` (sound = chosen URI, USAGE_ALARM, `setTimeoutAfter(120000)`). Always `scheduleNext` afterwards. `ACTION_STOP/SNOOZE` → forwarded to the service (or handled directly for fallback notification: cancel it, snooze schedules).

- [ ] Step 1: Write `AlarmText` pure tests → FAIL.
- [ ] Step 2: Implement AlarmText → PASS.
- [ ] Step 3: Implement receiver, service, activity, resources, manifest.
- [ ] Step 4: Run all prayer unit tests (compiles everything) → PASS.
- [ ] Step 5: Commit.

### Task 5: Plugin methods

**Files:** Modify `RafeeqPrayerPlugin.kt` (+ header doc list).

Methods (JS shapes in Task 6): `getAlarms`, `saveAlarm`, `deleteAlarm`, `setAlarmSettings`, `previewAlarm`, `pickAlarmSound({source})` (two launchers registered in `load()`: `RingtoneManager.ACTION_RINGTONE_PICKER` with TYPE_ALARM, and `ActivityResultContracts.OpenDocument` for `audio/*` with `takePersistableUriPermission`; display name from `RingtoneManager.getRingtone(...).getTitle` or `OpenableColumns.DISPLAY_NAME`), `getAlarmHealth` (`notifications`, `exactAlarms`, `fullScreen` = `NotificationManager.canUseFullScreenIntent()` on 34+, `batteryUnrestricted`, `aggressiveBattery`), `requestFullScreenAlarms` (opens `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` on 34+). Every mutating call ends with `PrayerAlarmClockScheduler.scheduleNext`.

- [ ] Step 1: Implement; Step 2: compile via unit tests → PASS; Step 3: Commit.

### Task 6: Web types + service

**Files:**
- Create: `src/app/core/services/prayer/prayer-alarms.types.ts`
- Create: `src/app/core/services/prayer/prayer-alarms.service.ts`
- Modify: `prayer-times.service.ts` — `RafeeqPrayerPlugin extends PrayerAlarmPlugin`; export `RafeeqPrayer` for reuse (single `registerPlugin`).
- Test: `src/app/core/services/prayer/__tests__/prayer-alarms.service.test.ts`

```ts
export type AlarmPrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export const ALARM_PRAYERS: AlarmPrayer[];
export interface PrayerAlarm { id: string; prayer: AlarmPrayer; offsetMinutes: number; label: string;
  enabled: boolean; days: number[] /* ISO 1..7 */; ramadanOnly: boolean; }
export interface PrayerAlarmWithNext extends PrayerAlarm { nextAt: Date | null; }
export interface AlarmSettings { soundUri: string | null; soundName: string | null;
  snoozeMinutes: 5 | 10 | 15; vibrate: boolean; ramadanShiftDays: -1 | 0 | 1; }
export interface AlarmHealth { notifications: boolean; exactAlarms: boolean; fullScreen: boolean;
  batteryUnrestricted: boolean; aggressiveBattery: boolean; }
export const MAX_OFFSET = 180;
export const ALL_DAYS = [1,2,3,4,5,6,7];
```
Service: `alarmsSupported()` (android only), `loadAlarms()`, `saveAlarm(alarm)`, `deleteAlarm(id)`, `setAlarmSettings(patch)`, `previewAlarm(alarm): Promise<Date|null>`, `pickAlarmSound(source)`, `getAlarmHealth()`, `requestFullScreenAlarms()`, `prepareAlarmPermissions(): Promise<boolean>` (notifications required → then exact alarm + full-screen best-effort), `newAlarm(prayer): PrayerAlarm` (uuid via `crypto.randomUUID` fallback to Math.random), `formatOffset(minutes, lang)`, `repeatSummary(alarm, t)`.

- [ ] Steps: failing tests (ISO strings → Dates; non-android returns empty/false without calling plugin; newAlarm defaults; formatOffset "−1:30"/"+0:15"/"0"), implement, pass, commit.

### Task 7: Strings

Add `prayerAlarms` section to `AppStrings`, `ar`, `en` in `src/app/core/i18n/strings.ts` (menu row, sheet title/desc, add, before/after/atTime, minutes, label placeholder, days short names Mon..Sun, everyDay, weekdays summary, ramadanOnly, ramadanStarts + earlier/calculated/later, sound/phoneSounds/audioFile/defaultSound, snooze, vibrate, next, noNext, delete, save, warnings ×4 with action labels, notificationsDenied, settingsTitle). Verify with `tsc`. Commit with Task 8.

### Task 8: Alarms sheet + editor + page wiring

Invoke the frontend-design skill first.

**Files:**
- Create: `src/app/features/prayer-times/AlarmsSheet.tsx`, `AlarmsSheet.css`, `AlarmEditor.tsx`
- Modify: `PrayerMenuSheet.tsx` (`PrayerMenuTarget` gains `"alarms"`, row with bell icon + status "N on"/"Off", shown when `alarmsStatus !== null`), `PrayerTimes.tsx` (load alarms, pass status, render AlarmsSheet with `focusPrayer`, ⏰ button on rows that have enabled alarms), `PrayerTimes.css` (row icon).
- Test: `src/app/features/prayer-times/__tests__/AlarmsSheet.test.tsx`

Behaviour: list per prayer with today's time; row = offset + label + summary + next time + switch (optimistic, reverts on failure); "+ Add alarm" opens editor with `newAlarm(prayer)`; editor live preview via `previewAlarm` (debounced 250 ms); Save → `prepareAlarmPermissions()` on first enabled alarm, then `saveAlarm`; Delete for existing. Settings block: sound row → small choice (Phone sounds / Audio file), snooze segmented, vibrate switch, Ramadan starts segmented. Health banner rows with action buttons (`requestExactAlarm`, `requestFullScreenAlarms`, `openAppSettings`, notifications request).

- [ ] Steps: failing tests (renders alarms grouped under prayers; toggling calls saveAlarm with enabled flipped; add → editor → save calls saveAlarm with offset sign from Before/After; delete calls deleteAlarm), implement, pass, tsc, commit.

### Task 9: What's new

Add a `prayerTimes.alarms` tour (one step on the menu button) + `RELEASES` entry + ar/en copy, following the checklist in `tourCatalog.ts`. Run `tourTargets` tests. Commit.

### Task 10: Verification

- Android prayer unit tests, full jest suite, tsc.
- Append the manual device checklist to the spec's Testing section (already there) — report to the user.
