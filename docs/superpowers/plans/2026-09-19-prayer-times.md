# Prayer Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Rafeeq a prayer-times page, a reminder at each prayer, and a home-screen widget, all driven by one calculation that runs natively.

**Architecture:** Prayer times are computed once, in Kotlin, by `PrayerTimesEngine` wrapping `adhan-java`. Three consumers read it: a Capacitor plugin (for the React page), an `AlarmManager` scheduler (for reminders), and an `AppWidgetProvider` (for the widget). No JavaScript calculation exists, because a home-screen widget runs in the launcher process with no WebView and could not call it.

**Tech Stack:** Kotlin, `com.batoulapps.adhan:adhan:1.2.1`, Capacitor 8, `@capacitor/geolocation` 8.2.2, React 18 + Ionic, JUnit 4 (native), Jest via react-scripts (web).

**Spec:** `docs/superpowers/specs/2026-09-19-prayer-times-design.md`

## Global Constraints

- **Branch:** `prayer-times`, already created off `more-tab`.
- **Android only.** There is no `ios/` directory. Never add iOS files or `Info.plist` entries.
- **No `adhan` npm package.** Calculation exists once, in Kotlin. If a task seems to need prayer maths in JS, it is wrong — call the plugin.
- **Never add `// eslint-disable` comments**, of any kind, including `react-hooks/exhaustive-deps`.
- **Never add visible scrollbars.** `src/index.css` hides them globally; do not re-add scroll styling that reveals them.
- **Page width:** every page container uses `max-width: var(--max-width-mobile, 600px)` and `margin: 0 auto`. Never hard-code a pixel width.
- **Fixed nav clearance:** every scroll container on a page with `<BottomNavBar fixed />` needs `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`. Do **not** use a trailing spacer `<div>`.
- **Permissions:** `ACCESS_COARSE_LOCATION` (not fine), `USE_EXACT_ALARM` (not `SCHEDULE_EXACT_ALARM`), `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`.
- **Defaults:** method = Egyptian General Authority of Survey; madhab = Shafi.
- **Do not run** `npm run build`, `npx cap sync`, or any gradle assemble task. The user builds. Gradle *unit tests* (`gradlew test`) are fine to run.
- **npm install on this machine** must be preceded by setting `$env:ComSpec`, or it fails with a misleading `ERR_INVALID_ARG_TYPE`.
- **Every commit message** ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

**Stage 1 — calculation and the page**

| File | Responsibility |
|---|---|
| `android/variables.gradle` | Declares `adhanVersion`, beside the other pinned versions |
| `android/app/build.gradle` | Adds the adhan-java dependency |
| `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt` | Method/madhab/coordinate storage in `SharedPreferences`; the one place natives read config |
| `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngine.kt` | Pure calculation over adhan-java. No Android UI types. The TDD unit |
| `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngineTest.kt` | JUnit tests against published Cairo times |
| `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt` | Capacitor bridge: `getTimes`, `setLocation`, `getConfig`, `setConfig` |
| `android/app/src/main/java/com/rafeeq/quranquiz/MainActivity.kt` | Registers the plugin |
| `android/app/src/main/AndroidManifest.xml` | `ACCESS_COARSE_LOCATION` |
| `src/app/core/services/prayer/prayer-times.types.ts` | Shared types for the plugin boundary |
| `src/app/core/services/prayer/prayer-times.service.ts` | The only module that talks to the plugin: location, permission, caching |
| `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts` | Service tests against a mocked plugin |
| `src/app/features/prayer-times/PrayerTimes.tsx` / `.css` | The page |
| `src/App.tsx` | `/prayer-times` route |
| `src/app/features/more/More.tsx` | Drops `comingSoon` from the prayerTimes card |
| `src/app/core/i18n/strings.ts` | `prayerTimes` block, both locales |

**Stage 2 — reminders**

| File | Responsibility |
|---|---|
| `.../prayer/PrayerAlarmScheduler.kt` | Computes and sets the next alarm; cancels on disable |
| `.../prayer/PrayerAlarmReceiver.kt` | Fires the notification, then schedules the next alarm |
| `.../prayer/PrayerBootReceiver.kt` | Reschedules after reboot and timezone change |
| `.../prayer/RafeeqPrayerPlugin.kt` (modify) | `setReminders`, `getReminders` |
| `AndroidManifest.xml` (modify) | Alarm/notification permissions, receiver registrations |
| `src/app/features/settings/Settings.tsx` (modify) | Enables the `prayerReminders` toggle |

**Stage 3 — widget**

| File | Responsibility |
|---|---|
| `.../prayer/PrayerWidgetProvider.kt` | `AppWidgetProvider`; renders from the engine |
| `android/app/src/main/res/layout/widget_prayer_times.xml` | Widget layout (light) |
| `android/app/src/main/res/layout-night/widget_prayer_times.xml` | Widget layout (dark) |
| `android/app/src/main/res/xml/widget_prayer_times_info.xml` | Widget metadata |
| `AndroidManifest.xml` (modify) | Registers the provider |

---

## Stage 1 — Calculation and the page

### Task 1: Prayer calculation engine

**Files:**
- Modify: `android/variables.gradle`
- Modify: `android/app/build.gradle` (dependencies block, ~line 158)
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngine.kt`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngineTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum class PrayerName { FAJR, SUNRISE, DHUHR, ASR, MAGHRIB, ISHA }`
  - `data class DayTimes(val times: Map<PrayerName, Date>)`
  - `data class NextPrayer(val name: PrayerName, val at: Date)`
  - `object PrayerTimesEngine`
    - `fun timesFor(lat: Double, lng: Double, date: Date, method: String, madhab: String, tz: TimeZone): DayTimes`
    - `fun nextAfter(now: Date, lat: Double, lng: Double, method: String, madhab: String, tz: TimeZone): NextPrayer`
  - `method` is one of `"egyptian"`, `"umm_al_qura"`, `"muslim_world_league"`, `"karachi"`, `"north_america"`, `"dubai"`, `"qatar"`, `"kuwait"`, `"singapore"`, `"turkey"`, `"tehran"`.
  - `madhab` is `"shafi"` or `"hanafi"`.

- [ ] **Step 1: Add the dependency version**

In `android/variables.gradle`, add inside `ext { ... }`, after `media3Version`:

```gradle
    // adhan-java — the Java port of the same prayer-time library, by the same
    // authors, as the `adhan` npm package. Declared here so the calculation
    // can be stepped back independently of app/build.gradle.
    adhanVersion = '1.2.1'
```

- [ ] **Step 2: Add the dependency**

In `android/app/build.gradle`, in the `dependencies { ... }` block, after the media3 lines and before `testImplementation "junit:junit:..."`:

```gradle
    // Prayer-time calculation. Lives natively rather than in JS because the
    // home-screen widget renders in the launcher process, with no WebView.
    implementation "com.batoulapps.adhan:adhan:$rootProject.ext.adhanVersion"
```

- [ ] **Step 3: Write the failing test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngineTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * Reference values are the published Cairo table for 2026-09-19 under the
 * Egyptian General Authority of Survey method (Fajr 19.5°, Isha 17.5°).
 * A one-minute tolerance is allowed: published tables round, and Cairo's own
 * area spans about a minute of true solar time.
 */
class PrayerTimesEngineTest {

    private val cairoLat = 30.0444
    private val cairoLng = 31.2357
    private val cairoTz: TimeZone = TimeZone.getTimeZone("Africa/Cairo")

    private fun dateOf(y: Int, m: Int, d: Int, tz: TimeZone): Date {
        val cal = Calendar.getInstance(tz)
        cal.clear()
        cal.set(y, m - 1, d, 12, 0, 0)
        return cal.time
    }

    private fun hhmm(date: Date, tz: TimeZone): String {
        val fmt = SimpleDateFormat("HH:mm", Locale.US)
        fmt.timeZone = tz
        return fmt.format(date)
    }

    private fun minutesOf(hhmm: String): Int {
        val (h, m) = hhmm.split(":").map { it.toInt() }
        return h * 60 + m
    }

    private fun assertWithinAMinute(expected: String, actual: String, label: String) {
        val diff = abs(minutesOf(expected) - minutesOf(actual))
        assertTrue(
            "$label: expected about $expected but was $actual",
            diff <= 1,
        )
    }

    @Test
    fun `matches the published Cairo table for the Egyptian method`() {
        val times = PrayerTimesEngine.timesFor(
            lat = cairoLat,
            lng = cairoLng,
            date = dateOf(2026, 9, 19, cairoTz),
            method = "egyptian",
            madhab = "shafi",
            tz = cairoTz,
        )

        assertWithinAMinute("05:15", hhmm(times.times[PrayerName.FAJR]!!, cairoTz), "Fajr")
        assertWithinAMinute("06:41", hhmm(times.times[PrayerName.SUNRISE]!!, cairoTz), "Sunrise")
        assertWithinAMinute("12:50", hhmm(times.times[PrayerName.DHUHR]!!, cairoTz), "Dhuhr")
        assertWithinAMinute("16:18", hhmm(times.times[PrayerName.ASR]!!, cairoTz), "Asr")
        assertWithinAMinute("18:57", hhmm(times.times[PrayerName.MAGHRIB]!!, cairoTz), "Maghrib")
        assertWithinAMinute("20:14", hhmm(times.times[PrayerName.ISHA]!!, cairoTz), "Isha")
    }

    @Test
    fun `hanafi asr falls later than shafi asr`() {
        val date = dateOf(2026, 9, 19, cairoTz)
        val shafi = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, date, "egyptian", "shafi", cairoTz,
        ).times[PrayerName.ASR]!!
        val hanafi = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, date, "egyptian", "hanafi", cairoTz,
        ).times[PrayerName.ASR]!!

        assertTrue("Hanafi Asr must be later than Shafi Asr", hanafi.after(shafi))
    }

    @Test
    fun `next prayer after a time before fajr is fajr that morning`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 3, 0, 0) // 03:00, before Fajr
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertEquals(PrayerName.FAJR, next.name)
        assertWithinAMinute("05:15", hhmm(next.at, cairoTz), "next Fajr")
    }

    @Test
    fun `next prayer after isha rolls to the following fajr`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 22, 0, 0) // 22:00, after Isha
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertEquals(PrayerName.FAJR, next.name)
        assertTrue("Next Fajr must be in the future", next.at.after(cal.time))
    }

    @Test
    fun `sunrise is never reported as the next prayer`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 6, 0, 0) // between Fajr and sunrise
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertEquals(PrayerName.DHUHR, next.name)
    }

    @Test
    fun `a high latitude location still produces all six times`() {
        val tromsoTz = TimeZone.getTimeZone("Europe/Oslo")
        val times = PrayerTimesEngine.timesFor(
            lat = 69.6496,
            lng = 18.9560,
            date = dateOf(2026, 6, 21, tromsoTz),
            method = "muslim_world_league",
            madhab = "shafi",
            tz = tromsoTz,
        )

        PrayerName.values().forEach { name ->
            assertTrue("$name must be present at high latitude", times.times[name] != null)
        }
    }
}
```

- [ ] **Step 4: Run the test and watch it fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerTimesEngineTest"
```

Expected: compilation failure — `Unresolved reference: PrayerTimesEngine`.

- [ ] **Step 5: Write the engine**

Create `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngine.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import com.batoulapps.adhan.CalculationMethod
import com.batoulapps.adhan.CalculationParameters
import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.Madhab
import com.batoulapps.adhan.Prayer
import com.batoulapps.adhan.PrayerTimes
import com.batoulapps.adhan.data.DateComponents
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

enum class PrayerName { FAJR, SUNRISE, DHUHR, ASR, MAGHRIB, ISHA }

data class DayTimes(val times: Map<PrayerName, Date>)

data class NextPrayer(val name: PrayerName, val at: Date)

/**
 * Prayer-time calculation, shared by every consumer: the Capacitor plugin that
 * feeds the React page, the alarm scheduler, and the home-screen widget.
 *
 * It lives in Kotlin rather than in the web layer because the widget renders in
 * the launcher process, where there is no WebView to run JavaScript — and the
 * exact alarms must fire when the app is not running at all. Computing in both
 * places would let the page and the widget disagree about when Maghrib is.
 *
 * Pure functions over their arguments: no Android UI types, no stored state, so
 * the whole thing is unit-testable on the JVM.
 */
object PrayerTimesEngine {

    /** Sunrise is displayed with the prayers but is not one; it never gets a
     *  reminder and is never the "next prayer" in the countdown. */
    private val PRAYERS_ONLY = listOf(
        PrayerName.FAJR,
        PrayerName.DHUHR,
        PrayerName.ASR,
        PrayerName.MAGHRIB,
        PrayerName.ISHA,
    )

    fun parametersFor(method: String, madhab: String): CalculationParameters {
        val params = when (method) {
            "umm_al_qura" -> CalculationMethod.UMM_AL_QURA.parameters
            "muslim_world_league" -> CalculationMethod.MUSLIM_WORLD_LEAGUE.parameters
            "karachi" -> CalculationMethod.KARACHI.parameters
            "north_america" -> CalculationMethod.NORTH_AMERICA.parameters
            "dubai" -> CalculationMethod.DUBAI.parameters
            "qatar" -> CalculationMethod.QATAR.parameters
            "kuwait" -> CalculationMethod.KUWAIT.parameters
            "singapore" -> CalculationMethod.SINGAPORE.parameters
            "turkey" -> CalculationMethod.TURKEY.parameters
            "tehran" -> CalculationMethod.TEHRAN.parameters
            else -> CalculationMethod.EGYPTIAN.parameters
        }
        params.madhab = if (madhab == "hanafi") Madhab.HANAFI else Madhab.SHAFI
        return params
    }

    private fun computeFor(
        lat: Double,
        lng: Double,
        date: Date,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): PrayerTimes {
        val cal = Calendar.getInstance(tz)
        cal.time = date
        val components = DateComponents(
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH),
        )
        return PrayerTimes(
            Coordinates(lat, lng),
            components,
            parametersFor(method, madhab),
        )
    }

    fun timesFor(
        lat: Double,
        lng: Double,
        date: Date,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): DayTimes {
        val p = computeFor(lat, lng, date, method, madhab, tz)
        return DayTimes(
            mapOf(
                PrayerName.FAJR to p.fajr,
                PrayerName.SUNRISE to p.sunrise,
                PrayerName.DHUHR to p.dhuhr,
                PrayerName.ASR to p.asr,
                PrayerName.MAGHRIB to p.maghrib,
                PrayerName.ISHA to p.isha,
            ),
        )
    }

    /**
     * The next of the five prayers strictly after [now].
     *
     * Rolls to tomorrow's Fajr once today's Isha has passed, so the caller never
     * has to special-case the end of the day.
     */
    fun nextAfter(
        now: Date,
        lat: Double,
        lng: Double,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): NextPrayer {
        val today = timesFor(lat, lng, now, method, madhab, tz)
        PRAYERS_ONLY.forEach { name ->
            val at = today.times[name]
            if (at != null && at.after(now)) return NextPrayer(name, at)
        }

        val cal = Calendar.getInstance(tz)
        cal.time = now
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val tomorrow = timesFor(lat, lng, cal.time, method, madhab, tz)
        return NextPrayer(PrayerName.FAJR, tomorrow.times[PrayerName.FAJR]!!)
    }
}
```

Note on the unused import: remove `Prayer` from the imports if the compiler warns; it is listed only because some adhan versions require it for `PrayerTimes`. Verify against the actual compile.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerTimesEngineTest"
```

Expected: all 6 tests PASS. If the Cairo assertions fail by more than a minute, do **not** widen the tolerance — check that `CalculationMethod.EGYPTIAN` was selected and that the timezone is `Africa/Cairo`.

- [ ] **Step 7: Commit**

```bash
git add android/variables.gradle android/app/build.gradle android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngine.kt android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerTimesEngineTest.kt
git commit -m "$(cat <<'EOF'
add the native prayer-time calculation engine

Calculation lives in Kotlin rather than the web layer because the
home-screen widget renders in the launcher process, with no WebView,
and the reminders must fire when the app is not running. adhan-java is
the same library, by the same authors, as the npm package, so the page
and the widget cannot disagree about when Maghrib is.

Tested against the published Cairo table for the Egyptian method, with
a one-minute tolerance because published tables round.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Config storage and the Capacitor plugin

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt`
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/MainActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigTest.kt`

**Interfaces:**
- Consumes: `PrayerTimesEngine.timesFor`, `PrayerTimesEngine.nextAfter`, `PrayerName`, `DayTimes`, `NextPrayer` from Task 1.
- Produces:
  - `object PrayerConfig` with `fun coords(ctx: Context): Pair<Double, Double>?`, `fun setCoords(ctx, lat, lng)`, `fun method(ctx): String`, `fun madhab(ctx): String`, `fun setMethod(ctx, String)`, `fun setMadhab(ctx, String)`, and `const val PREFS_NAME = "rafeeq_prayer"`.
  - Capacitor plugin named `RafeeqPrayer`, methods `getTimes`, `setLocation`, `getConfig`, `setConfig`.
  - `getTimes` resolves `{ times: { fajr, sunrise, dhuhr, asr, maghrib, isha }, next: { name, at }, hasLocation: boolean }` where each time is an ISO-8601 string and `name` is lowercase (`"fajr"`, `"dhuhr"`, …).

- [ ] **Step 1: Write the failing config test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PrayerConfig's storage needs a Context, which a JVM unit test does not have,
 * so what is tested here is the part that has no Android dependency: the
 * defaults that every consumer falls back to.
 */
class PrayerConfigTest {

    @Test
    fun `defaults are the egyptian method and the shafi madhab`() {
        assertEquals("egyptian", PrayerConfig.DEFAULT_METHOD)
        assertEquals("shafi", PrayerConfig.DEFAULT_MADHAB)
    }

    @Test
    fun `an unknown method still yields usable parameters`() {
        // Falls back rather than throwing: a corrupt stored value must never
        // stop the widget or an alarm from computing a time.
        val params = PrayerTimesEngine.parametersFor("not-a-method", "shafi")
        assertEquals(
            PrayerTimesEngine.parametersFor(PrayerConfig.DEFAULT_METHOD, "shafi").fajrAngle,
            params.fajrAngle,
            0.001,
        )
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerConfigTest"
```

Expected: `Unresolved reference: PrayerConfig`.

- [ ] **Step 3: Write PrayerConfig**

Create `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import android.content.Context

/**
 * The prayer feature's stored state, in SharedPreferences.
 *
 * SharedPreferences rather than Capacitor Preferences because the widget and
 * the alarm receiver have no bridge to read the latter — they run with the app
 * closed. The web layer reaches this through RafeeqPrayerPlugin.
 */
object PrayerConfig {
    const val PREFS_NAME = "rafeeq_prayer"

    const val DEFAULT_METHOD = "egyptian"
    const val DEFAULT_MADHAB = "shafi"

    private const val KEY_LAT = "lat"
    private const val KEY_LNG = "lng"
    private const val KEY_METHOD = "method"
    private const val KEY_MADHAB = "madhab"

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Null until a location has been granted and stored at least once. */
    fun coords(ctx: Context): Pair<Double, Double>? {
        val p = prefs(ctx)
        if (!p.contains(KEY_LAT) || !p.contains(KEY_LNG)) return null
        // Stored as bits because SharedPreferences has no Double accessor.
        val lat = Double.fromBits(p.getLong(KEY_LAT, 0L))
        val lng = Double.fromBits(p.getLong(KEY_LNG, 0L))
        return lat to lng
    }

    fun setCoords(ctx: Context, lat: Double, lng: Double) {
        prefs(ctx).edit()
            .putLong(KEY_LAT, lat.toRawBits())
            .putLong(KEY_LNG, lng.toRawBits())
            .apply()
    }

    fun method(ctx: Context): String =
        prefs(ctx).getString(KEY_METHOD, DEFAULT_METHOD) ?: DEFAULT_METHOD

    fun madhab(ctx: Context): String =
        prefs(ctx).getString(KEY_MADHAB, DEFAULT_MADHAB) ?: DEFAULT_MADHAB

    fun setMethod(ctx: Context, method: String) {
        prefs(ctx).edit().putString(KEY_METHOD, method).apply()
    }

    fun setMadhab(ctx: Context, madhab: String) {
        prefs(ctx).edit().putString(KEY_MADHAB, madhab).apply()
    }
}
```

- [ ] **Step 4: Run the config test and watch it pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerConfigTest"
```

Expected: both tests PASS.

- [ ] **Step 5: Write the plugin**

Create `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * RafeeqPrayerPlugin — Capacitor bridge between JS and PrayerTimesEngine.
 *
 * JS → Native:
 *   getTimes({ date? })            — today's six times plus the next prayer
 *   setLocation({ lat, lng })      — store coordinates for every consumer
 *   getConfig() / setConfig({...}) — calculation method and madhab
 *
 * The web layer never computes prayer times itself; this is the only path.
 * Mirrors RafeeqAutoPlugin's shape, which bridges JS to the media service.
 */
@CapacitorPlugin(name = "RafeeqPrayer")
class RafeeqPrayerPlugin : Plugin() {

    private fun iso(date: Date): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(date)
    }

    @PluginMethod
    fun getTimes(call: PluginCall) {
        val ctx = context
        val coords = PrayerConfig.coords(ctx)
        val result = JSObject()

        if (coords == null) {
            // Not an error: a first run before location is granted is a normal
            // state the page renders as a prompt.
            result.put("hasLocation", false)
            call.resolve(result)
            return
        }

        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getDefault()
        val date = call.getString("date")?.let { raw ->
            runCatching {
                SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = tz }.parse(raw)
            }.getOrNull()
        } ?: Date()

        val day = PrayerTimesEngine.timesFor(lat, lng, date, method, madhab, tz)
        val times = JSObject()
        day.times.forEach { (name, at) ->
            times.put(name.name.lowercase(), iso(at))
        }

        val next = PrayerTimesEngine.nextAfter(Date(), lat, lng, method, madhab, tz)
        val nextObj = JSObject()
        nextObj.put("name", next.name.name.lowercase())
        nextObj.put("at", iso(next.at))

        result.put("hasLocation", true)
        result.put("times", times)
        result.put("next", nextObj)
        call.resolve(result)
    }

    @PluginMethod
    fun setLocation(call: PluginCall) {
        val lat = call.getDouble("lat")
        val lng = call.getDouble("lng")
        if (lat == null || lng == null) {
            call.reject("lat and lng are required")
            return
        }
        PrayerConfig.setCoords(context, lat, lng)
        call.resolve()
    }

    @PluginMethod
    fun getConfig(call: PluginCall) {
        val result = JSObject()
        result.put("method", PrayerConfig.method(context))
        result.put("madhab", PrayerConfig.madhab(context))
        val coords = PrayerConfig.coords(context)
        result.put("hasLocation", coords != null)
        call.resolve(result)
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        call.getString("method")?.let { PrayerConfig.setMethod(context, it) }
        call.getString("madhab")?.let { PrayerConfig.setMadhab(context, it) }
        call.resolve()
    }
}
```

- [ ] **Step 6: Register the plugin**

In `android/app/src/main/java/com/rafeeq/quranquiz/MainActivity.kt`, add the import beside the existing one:

```kotlin
import com.rafeeq.quranquiz.prayer.RafeeqPrayerPlugin
```

and register it in `onCreate`, on the line after `registerPlugin(RafeeqAutoPlugin::class.java)`:

```kotlin
        registerPlugin(RafeeqPrayerPlugin::class.java)
```

- [ ] **Step 7: Add the location permission**

In `android/app/src/main/AndroidManifest.xml`, after the existing `<uses-permission>` lines:

```xml
    <!-- Coarse, not fine: prayer times shift about four seconds per kilometre
         of longitude, so city-level accuracy is already finer than the one
         minute the app displays — and the prompt is gentler. -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

- [ ] **Step 8: Verify the whole native module compiles**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: BUILD SUCCESSFUL. This compiles only; it does not assemble an APK.

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/ android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigTest.kt android/app/src/main/java/com/rafeeq/quranquiz/MainActivity.kt android/app/src/main/AndroidManifest.xml
git commit -m "$(cat <<'EOF'
bridge the prayer engine to the web layer

Config lives in SharedPreferences rather than Capacitor Preferences
because the widget and the alarm receiver run with the app closed and
have no bridge to read the latter.

A missing location resolves as hasLocation:false rather than rejecting:
a first run before the permission is granted is a state the page
renders as a prompt, not an error.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The web service

**Files:**
- Create: `src/app/core/services/prayer/prayer-times.types.ts`
- Create: `src/app/core/services/prayer/prayer-times.service.ts`
- Test: `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Consumes: the `RafeeqPrayer` plugin from Task 2.
- Produces:
  - `type PrayerKey = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha"`
  - `interface PrayerDay { hasLocation: boolean; times: Record<PrayerKey, Date> | null; next: { name: PrayerKey; at: Date } | null }`
  - `type PrayerMethod` (the 11 method ids from Task 1) and `type PrayerMadhab = "shafi" | "hanafi"`
  - `async function loadPrayerDay(): Promise<PrayerDay>`
  - `async function requestLocation(): Promise<boolean>` — true if coordinates were obtained and stored
  - `async function getPrayerConfig(): Promise<{ method: PrayerMethod; madhab: PrayerMadhab; hasLocation: boolean }>`
  - `async function setPrayerConfig(patch: { method?: PrayerMethod; madhab?: PrayerMadhab }): Promise<void>`
  - `const PRAYER_KEYS: PrayerKey[]` and `const PRAYER_METHODS: PrayerMethod[]`

- [ ] **Step 1: Install the geolocation plugin**

```powershell
$env:ComSpec = "C:\Windows\System32\cmd.exe"; npm install @capacitor/geolocation@^8.2.2
```

The `ComSpec` assignment is required on this machine; without it npm fails with `ERR_INVALID_ARG_TYPE`, which looks like a broken dependency but is not.

Do **not** run `npx cap sync` — the user builds.

- [ ] **Step 2: Write the types**

Create `src/app/core/services/prayer/prayer-times.types.ts`:

```ts
/**
 * Types for the prayer-times plugin boundary.
 *
 * Calculation itself is native (see PrayerTimesEngine.kt) because the home
 * screen widget has no WebView; the web layer only ever reads results.
 */

export type PrayerKey =
  | "fajr"
  | "sunrise"
  | "dhuhr"
  | "asr"
  | "maghrib"
  | "isha";

/** Display order. Sunrise sits between Fajr and Dhuhr but is not a prayer. */
export const PRAYER_KEYS: PrayerKey[] = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

/** Sunrise never gets a reminder and is never the "next prayer". */
export const PRAYERS_ONLY: PrayerKey[] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export type PrayerMethod =
  | "egyptian"
  | "umm_al_qura"
  | "muslim_world_league"
  | "karachi"
  | "north_america"
  | "dubai"
  | "qatar"
  | "kuwait"
  | "singapore"
  | "turkey"
  | "tehran";

export const PRAYER_METHODS: PrayerMethod[] = [
  "egyptian",
  "umm_al_qura",
  "muslim_world_league",
  "karachi",
  "north_america",
  "dubai",
  "qatar",
  "kuwait",
  "singapore",
  "turkey",
  "tehran",
];

export type PrayerMadhab = "shafi" | "hanafi";

export interface PrayerDay {
  /** False until a location has been granted and stored at least once. */
  hasLocation: boolean;
  times: Record<PrayerKey, Date> | null;
  next: { name: PrayerKey; at: Date } | null;
}

/** The raw plugin shape, before ISO strings are parsed into Dates. */
export interface RawPrayerDay {
  hasLocation: boolean;
  times?: Record<PrayerKey, string>;
  next?: { name: PrayerKey; at: string };
}
```

- [ ] **Step 3: Write the failing service test**

Create `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts`:

```ts
import type { RawPrayerDay } from "../prayer-times.types";

// The plugin and the geolocation plugin are native; both are mocked so the
// service's own branching is what gets tested.
const getTimes = jest.fn();
const setLocation = jest.fn();
const getConfig = jest.fn();
const setConfig = jest.fn();

jest.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ getTimes, setLocation, getConfig, setConfig }),
}));

const getCurrentPosition = jest.fn();
const checkPermissions = jest.fn();
const requestPermissions = jest.fn();

jest.mock("@capacitor/geolocation", () => ({
  Geolocation: { getCurrentPosition, checkPermissions, requestPermissions },
}));

// Jest hoists the jest.mock calls above this import, so the service sees the
// stubbed plugin even though the import is written first.
import * as service from "../prayer-times.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadPrayerDay", () => {
  it("reports no location rather than throwing when none is stored", async () => {
    const raw: RawPrayerDay = { hasLocation: false };
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.hasLocation).toBe(false);
    expect(day.times).toBeNull();
    expect(day.next).toBeNull();
  });

  it("parses the plugin's ISO strings into Dates", async () => {
    const raw: RawPrayerDay = {
      hasLocation: true,
      times: {
        fajr: "2026-09-19T03:15:00.000Z",
        sunrise: "2026-09-19T04:41:00.000Z",
        dhuhr: "2026-09-19T10:50:00.000Z",
        asr: "2026-09-19T14:18:00.000Z",
        maghrib: "2026-09-19T16:57:00.000Z",
        isha: "2026-09-19T18:14:00.000Z",
      },
      next: { name: "asr", at: "2026-09-19T14:18:00.000Z" },
    };
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.hasLocation).toBe(true);
    expect(day.times!.fajr).toBeInstanceOf(Date);
    expect(day.times!.fajr.toISOString()).toBe("2026-09-19T03:15:00.000Z");
    expect(day.next!.name).toBe("asr");
    expect(day.next!.at).toBeInstanceOf(Date);
  });
});

describe("requestLocation", () => {
  it("stores the fix and reports success when permission is granted", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    const ok = await service.requestLocation();

    expect(ok).toBe(true);
    expect(setLocation).toHaveBeenCalledWith({ lat: 30.0444, lng: 31.2357 });
  });

  it("asks for permission when it has not been granted yet", async () => {
    checkPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    requestPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    const ok = await service.requestLocation();

    expect(requestPermissions).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("reports failure without storing anything when permission is denied", async () => {
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const ok = await service.requestLocation();

    expect(ok).toBe(false);
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("reports failure when the fix itself fails, leaving any stored fix alone", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockRejectedValue(new Error("position unavailable"));

    const ok = await service.requestLocation();

    expect(ok).toBe(false);
    expect(setLocation).not.toHaveBeenCalled();
  });
});
```

**Note:** move the `import * as service` line up beside the `import type { RawPrayerDay }` line at the top of the file when you write it — it is shown in place here only to keep it next to the mocks it depends on. Jest hoists `jest.mock` above all imports, so the ordering does not affect the stubbing.

- [ ] **Step 4: Run it and watch it fail**

```bash
npx react-scripts test --watchAll=false --testPathPattern "prayer-times.service"
```

Expected: FAIL — cannot find module `../prayer-times.service`.

- [ ] **Step 5: Write the service**

Create `src/app/core/services/prayer/prayer-times.service.ts`:

```ts
/**
 * PRAYER TIMES SERVICE
 * The only module that talks to the native prayer plugin.
 *
 * Calculation is native (PrayerTimesEngine.kt) because the home-screen widget
 * renders in the launcher process with no WebView. This service owns the web
 * side of it: acquiring a location, and turning the plugin's ISO strings into
 * Dates the page can render.
 */

import { registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type {
  PrayerDay,
  PrayerKey,
  PrayerMadhab,
  PrayerMethod,
  RawPrayerDay,
} from "./prayer-times.types";
import { PRAYER_KEYS } from "./prayer-times.types";

interface RafeeqPrayerPlugin {
  getTimes(options?: { date?: string }): Promise<RawPrayerDay>;
  setLocation(options: { lat: number; lng: number }): Promise<void>;
  getConfig(): Promise<{
    method: PrayerMethod;
    madhab: PrayerMadhab;
    hasLocation: boolean;
  }>;
  setConfig(options: {
    method?: PrayerMethod;
    madhab?: PrayerMadhab;
  }): Promise<void>;
}

const RafeeqPrayer = registerPlugin<RafeeqPrayerPlugin>("RafeeqPrayer");

/** Today's times, or a hasLocation:false day when none has been granted. */
export async function loadPrayerDay(date?: string): Promise<PrayerDay> {
  const raw = await RafeeqPrayer.getTimes(date ? { date } : undefined);

  if (!raw.hasLocation || !raw.times || !raw.next) {
    return { hasLocation: false, times: null, next: null };
  }

  const times = {} as Record<PrayerKey, Date>;
  PRAYER_KEYS.forEach((key) => {
    times[key] = new Date(raw.times![key]);
  });

  return {
    hasLocation: true,
    times,
    next: { name: raw.next.name, at: new Date(raw.next.at) },
  };
}

/**
 * Acquire a coarse fix and hand it to the native side.
 *
 * Returns false rather than throwing when the user declines or the fix fails:
 * both are states the page renders as a prompt, not errors to surface.
 */
export async function requestLocation(): Promise<boolean> {
  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions({
        permissions: ["coarseLocation"],
      });
    }
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      return false;
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
    });
    await RafeeqPrayer.setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getPrayerConfig(): Promise<{
  method: PrayerMethod;
  madhab: PrayerMadhab;
  hasLocation: boolean;
}> {
  return RafeeqPrayer.getConfig();
}

export async function setPrayerConfig(patch: {
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
}): Promise<void> {
  await RafeeqPrayer.setConfig(patch);
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx react-scripts test --watchAll=false --testPathPattern "prayer-times.service"
```

Expected: all 6 tests PASS.

- [ ] **Step 7: Confirm nothing else broke**

```bash
npx react-scripts test --watchAll=false
```

Expected: 27 suites pass (the existing 26 plus the new one).

- [ ] **Step 8: Commit**

```bash
git add src/app/core/services/prayer package.json package-lock.json
git commit -m "$(cat <<'EOF'
add the prayer-times web service

The only module that talks to the native plugin: it acquires a coarse
fix, hands it to the native side, and parses ISO strings into Dates.

A declined permission and a failed fix both return false rather than
throwing. Neither is an error — they are the state the page renders as
a prompt to grant location.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Strings

**Files:**
- Modify: `src/app/core/i18n/strings.ts` (interface ~line 25, `ar` ~line 442, `en` ~line 884)

**Interfaces:**
- Consumes: nothing.
- Produces: `t.prayerTimes` with the keys below, in both locales.

- [ ] **Step 1: Add the interface block**

In `src/app/core/i18n/strings.ts`, add to the `AppStrings` interface, immediately after the `more: { ... };` block:

```ts
  prayerTimes: {
    title: string;
    /** The six rows, in display order. */
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    nextPrayer: string;
    /** Countdown, e.g. "in 2h 14m" — {time} is substituted. */
    remaining: string;
    method: string;
    madhab: string;
    shafi: string;
    hanafi: string;
    methodEgyptian: string;
    methodUmmAlQura: string;
    methodMwl: string;
    methodKarachi: string;
    methodNorthAmerica: string;
    methodDubai: string;
    methodQatar: string;
    methodKuwait: string;
    methodSingapore: string;
    methodTurkey: string;
    methodTehran: string;
    locationNeeded: string;
    locationNeededDesc: string;
    grantLocation: string;
    locationDenied: string;
  };
```

- [ ] **Step 2: Add the Arabic strings**

In the `ar` object, immediately after its `more: { ... },` block:

```ts
  prayerTimes: {
    title: "مواقيت الصلاة",
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
    nextPrayer: "الصلاة القادمة",
    remaining: "بعد {time}",
    method: "طريقة الحساب",
    madhab: "المذهب",
    shafi: "الشافعي",
    hanafi: "الحنفي",
    methodEgyptian: "الهيئة المصرية العامة للمساحة",
    methodUmmAlQura: "أم القرى - مكة المكرمة",
    methodMwl: "رابطة العالم الإسلامي",
    methodKarachi: "جامعة العلوم الإسلامية - كراتشي",
    methodNorthAmerica: "الجمعية الإسلامية لأمريكا الشمالية",
    methodDubai: "دبي",
    methodQatar: "قطر",
    methodKuwait: "الكويت",
    methodSingapore: "سنغافورة",
    methodTurkey: "تركيا",
    methodTehran: "طهران",
    locationNeeded: "حدّد موقعك",
    locationNeededDesc: "نحتاج إلى موقعك لحساب مواقيت الصلاة. يبقى الموقع على جهازك ولا يُرسَل إلى أي جهة.",
    grantLocation: "تحديد الموقع",
    locationDenied: "تعذّر تحديد الموقع. يمكنك السماح بذلك من إعدادات التطبيق.",
  },
```

- [ ] **Step 3: Add the English strings**

In the `en` object, immediately after its `more: { ... },` block:

```ts
  prayerTimes: {
    title: "Prayer Times",
    fajr: "Fajr",
    sunrise: "Sunrise",
    dhuhr: "Dhuhr",
    asr: "Asr",
    maghrib: "Maghrib",
    isha: "Isha",
    nextPrayer: "Next prayer",
    remaining: "in {time}",
    method: "Calculation method",
    madhab: "Madhab",
    shafi: "Shafi",
    hanafi: "Hanafi",
    methodEgyptian: "Egyptian General Authority of Survey",
    methodUmmAlQura: "Umm al-Qura, Makkah",
    methodMwl: "Muslim World League",
    methodKarachi: "University of Islamic Sciences, Karachi",
    methodNorthAmerica: "Islamic Society of North America",
    methodDubai: "Dubai",
    methodQatar: "Qatar",
    methodKuwait: "Kuwait",
    methodSingapore: "Singapore",
    methodTurkey: "Turkey",
    methodTehran: "Tehran",
    locationNeeded: "Set your location",
    locationNeededDesc: "Prayer times are calculated from your location. It stays on your device and is never sent anywhere.",
    grantLocation: "Use my location",
    locationDenied: "Could not get your location. You can allow it in the app's settings.",
  },
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
```

Expected: no output. (Errors under `node_modules/@types/node` are pre-existing and must be ignored — filter to `^src/` as shown.)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/i18n/strings.ts
git commit -m "$(cat <<'EOF'
add prayer-times strings in both locales

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The Prayer Times page

**Files:**
- Create: `src/app/features/prayer-times/PrayerTimes.tsx`
- Create: `src/app/features/prayer-times/PrayerTimes.css`
- Modify: `src/App.tsx` (import block ~line 44, routes ~line 188)
- Modify: `src/app/features/more/More.tsx` (the prayerTimes entry)

**Interfaces:**
- Consumes: `loadPrayerDay`, `requestLocation`, `getPrayerConfig`, `setPrayerConfig` from Task 3; `PRAYER_KEYS`, `PRAYER_METHODS`, `PrayerKey`, `PrayerMethod`, `PrayerMadhab` from Task 3's types; `t.prayerTimes` from Task 4.
- Produces: the `/prayer-times` route.

- [ ] **Step 1: Read the sibling page for its conventions**

Read `src/app/features/more/More.tsx` and `src/app/features/more/More.css` in full before writing. The new page must match: `IonPage` > `IonContent fullscreen` > a wrapper div > a container div capped at `var(--max-width-mobile, 600px)`, and `<BottomNavBar active="more" fixed />` outside `IonContent`.

Read `src/app/shared/components/inline-select/InlineSelect.tsx` to learn its exact props before using it for the method and madhab pickers.

- [ ] **Step 2: Write the page**

Create `src/app/features/prayer-times/PrayerTimes.tsx`. It must:

- Load config and the day on mount, and again in `useIonViewWillEnter` (see `Account.tsx` for that hook's use).
- When `hasLocation` is false, render the permission prompt: `t.prayerTimes.locationNeeded` as a heading, `locationNeededDesc` as body, and a button reading `grantLocation` that calls `requestLocation()` then reloads the day. On a false return, show `locationDenied`. No spinner, no toast.
- When `hasLocation` is true, render the six rows in `PRAYER_KEYS` order, each with its localized name and its time formatted via `toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" })` — the locale pair `Bookmarks.tsx:47` already uses.
- Mark the row matching `next.name` as active, and show `nextPrayer` plus a countdown built from `remaining` with `{time}` replaced.
- Tick the countdown with a `setInterval` of 1000ms, cleared on unmount. When the countdown reaches zero, reload the day so `next` advances.
- Show the Hijri date from `new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(new Date())`.
- Render the method and madhab `InlineSelect`s, persisting through `setPrayerConfig` and reloading the day after a change.
- Distinguish Sunrise visually from the five prayers — it is not a prayer.

- [ ] **Step 3: Write the stylesheet**

Create `src/app/features/prayer-times/PrayerTimes.css` following `More.css`:

- `ion-content { --background: var(--color-bg-content); }` and the `::part(scroll)` block
- Wrapper: full height, `--color-bg-content`, flex column, centered
- Container: `max-width: var(--max-width-mobile, 600px)`, `margin: 0 auto`, `overflow-y: auto`, and `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`
- Rows on `--color-bg-card` with `1.5px solid var(--color-border-card)` and `var(--radius-xl)`, matching `.more-card`
- The next-prayer row emphasized with `var(--color-gold)`; Sunrise de-emphasized with `var(--color-text-muted)`
- First element clears the status bar: `padding-top: max(var(--space-5), var(--safe-inset-top))`
- A `@media (prefers-reduced-motion: reduce)` block disabling transitions
- **No scrollbar styling of any kind.**

- [ ] **Step 4: Add the route**

In `src/App.tsx`, add the import after `import More from "./app/features/more/More";`:

```tsx
import PrayerTimes from "./app/features/prayer-times/PrayerTimes";
```

and the route after the `/more` route:

```tsx
      <Route exact path="/prayer-times" component={PrayerTimes} />
```

Do **not** add `/prayer-times` to `ROOT_TAB_PATHS` — it is a sub-page of More, so back must return to More.

- [ ] **Step 5: Enable the card**

In `src/app/features/more/More.tsx`, delete the `comingSoon: true,` line from the `prayerTimes` entry only. Leave the `qibla` entry's `comingSoon` in place.

- [ ] **Step 6: Typecheck and test**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
npx react-scripts test --watchAll=false
```

Expected: no `src/` type errors; 27 suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/prayer-times src/App.tsx src/app/features/more/More.tsx
git commit -m "$(cat <<'EOF'
add the prayer times page

Renders the six times with the next prayer highlighted and a live
countdown, and offers the method and madhab pickers on the page itself
rather than adding to the 937-line Settings.

A missing location is a designed state, not an error: the page explains
why it needs one and offers a button, instead of spinning or showing a
toast.

Not in ROOT_TAB_PATHS — it is a sub-page of More, so back returns there
rather than arming the double-swipe exit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Hand Stage 1 to the user for a device check**

Stage 1 is complete and independently shippable. Tell the user:

> Stage 1 is done. Before I start the reminders, this needs `npx cap sync android` and a build from you — `@capacitor/geolocation` is a native plugin, and without the sync `Geolocation.getCurrentPosition` throws at runtime. Worth checking on the device: the permission prompt on first open, the times against a local table, the countdown ticking, and that back from the page returns to More.

Wait for their confirmation before Stage 2.

---

## Stage 2 — Reminders

### Task 6: The alarm scheduler

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmScheduler.kt`
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmReceiver.kt`
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerBootReceiver.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerReminderPrefsTest.kt`

**Interfaces:**
- Consumes: `PrayerConfig`, `PrayerTimesEngine`, `PrayerName`, `NextPrayer` from Tasks 1–2.
- Produces:
  - On `PrayerConfig`: `fun remindersEnabled(ctx): Boolean`, `fun setRemindersEnabled(ctx, Boolean)`, `fun enabledPrayers(ctx): Set<String>`, `fun setEnabledPrayers(ctx, Set<String>)`, `const val DEFAULT_ENABLED_PRAYERS: Set<String>`.
  - `object PrayerAlarmScheduler` with `fun scheduleNext(ctx: Context)` and `fun cancelAll(ctx: Context)`.
  - Plugin methods `getReminders` / `setReminders`.

- [ ] **Step 1: Add the permissions**

In `AndroidManifest.xml`, after `ACCESS_COARSE_LOCATION`:

```xml
    <!-- USE_EXACT_ALARM rather than SCHEDULE_EXACT_ALARM: Android's own docs
         name prayer-time and alarm-clock apps as its acceptable use case. It is
         granted at install and cannot be revoked, so there is no
         canScheduleExactAlarms() check and no trip to system settings. -->
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <!-- Alarms do not survive a reboot; the boot receiver re-arms them. -->
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

- [ ] **Step 2: Write the failing reminder-prefs test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerReminderPrefsTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrayerReminderPrefsTest {

    @Test
    fun `the five prayers are reminder-enabled by default`() {
        assertEquals(
            setOf("fajr", "dhuhr", "asr", "maghrib", "isha"),
            PrayerConfig.DEFAULT_ENABLED_PRAYERS,
        )
    }

    @Test
    fun `sunrise is never reminder-enabled`() {
        // Sunrise is displayed with the prayers but is not one.
        assertFalse(PrayerConfig.DEFAULT_ENABLED_PRAYERS.contains("sunrise"))
    }

    @Test
    fun `every enabled prayer names a real prayer`() {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        assertTrue(known.containsAll(PrayerConfig.DEFAULT_ENABLED_PRAYERS))
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerReminderPrefsTest"
```

Expected: `Unresolved reference: DEFAULT_ENABLED_PRAYERS`.

- [ ] **Step 4: Extend PrayerConfig**

Add to `PrayerConfig.kt`, inside the object:

```kotlin
    /** Sunrise is absent by design: it is displayed with the prayers but is
     *  not one, and never carries a reminder. */
    val DEFAULT_ENABLED_PRAYERS: Set<String> =
        setOf("fajr", "dhuhr", "asr", "maghrib", "isha")

    private const val KEY_REMINDERS = "reminders_enabled"
    private const val KEY_ENABLED_PRAYERS = "enabled_prayers"

    fun remindersEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_REMINDERS, false)

    fun setRemindersEnabled(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_REMINDERS, enabled).apply()
    }

    fun enabledPrayers(ctx: Context): Set<String> =
        prefs(ctx).getStringSet(KEY_ENABLED_PRAYERS, DEFAULT_ENABLED_PRAYERS)
            ?: DEFAULT_ENABLED_PRAYERS

    fun setEnabledPrayers(ctx: Context, prayers: Set<String>) {
        prefs(ctx).edit().putStringSet(KEY_ENABLED_PRAYERS, prayers).apply()
    }
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerReminderPrefsTest"
```

Expected: 3 tests PASS.

- [ ] **Step 6: Write the scheduler**

Create `PrayerAlarmScheduler.kt`. It must:

- Expose `scheduleNext(ctx)`: read coords from `PrayerConfig`; return immediately if null or `!remindersEnabled`. Ask `PrayerTimesEngine.nextAfter(Date(), …)` for the next prayer, skipping any prayer not in `enabledPrayers` by advancing past it. Set one alarm with `AlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.time, pendingIntent)` so Doze cannot swallow it.
- Use a single `PendingIntent` with a fixed request code and `FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE`, targeting `PrayerAlarmReceiver`, carrying the prayer name as an extra.
- Expose `cancelAll(ctx)`: cancel that same `PendingIntent`.
- Comment why only *one* alarm is pending at a time: prayer times move daily, so nothing recurs; each firing arms the next.

- [ ] **Step 7: Write the receivers**

Create `PrayerAlarmReceiver.kt`: a `BroadcastReceiver` whose `onReceive` posts a notification (channel `rafeeq_prayer`, created on first use with `IMPORTANCE_HIGH`) naming the prayer and its time, with a `PendingIntent` to `MainActivity`. **Its first action after posting is `PrayerAlarmScheduler.scheduleNext(ctx)`** — the chain must not break. Then call `PrayerWidgetProvider.refresh(ctx)` if Stage 3 has landed; until then, omit that line.

Create `PrayerBootReceiver.kt`: a `BroadcastReceiver` for `BOOT_COMPLETED` and `TIMEZONE_CHANGED` that calls `PrayerAlarmScheduler.scheduleNext(ctx)`.

Register both in `AndroidManifest.xml` inside `<application>`:

```xml
        <receiver
            android:name=".prayer.PrayerAlarmReceiver"
            android:exported="false" />

        <receiver
            android:name=".prayer.PrayerBootReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
        </receiver>
```

- [ ] **Step 8: Extend the plugin**

Add to `RafeeqPrayerPlugin.kt`:

```kotlin
    @PluginMethod
    fun getReminders(call: PluginCall) {
        val result = JSObject()
        result.put("enabled", PrayerConfig.remindersEnabled(context))
        result.put("prayers", JSArray.from(PrayerConfig.enabledPrayers(context).toTypedArray()))
        call.resolve(result)
    }

    @PluginMethod
    fun setReminders(call: PluginCall) {
        call.getBoolean("enabled")?.let {
            PrayerConfig.setRemindersEnabled(context, it)
        }
        call.getArray("prayers")?.let { arr ->
            PrayerConfig.setEnabledPrayers(context, arr.toList<String>().toSet())
        }
        if (PrayerConfig.remindersEnabled(context)) {
            PrayerAlarmScheduler.scheduleNext(context)
        } else {
            PrayerAlarmScheduler.cancelAll(context)
        }
        call.resolve()
    }
```

Add `import com.getcapacitor.JSArray` to the imports.

- [ ] **Step 9: Compile and run all native tests**

```bash
cd android && ./gradlew :app:compileDebugKotlin && ./gradlew :app:testDebugUnitTest
```

Expected: BUILD SUCCESSFUL; all native tests pass.

- [ ] **Step 10: Commit**

```bash
git add android/
git commit -m "$(cat <<'EOF'
schedule a reminder at each prayer

Prayer times move every day, so nothing recurs: exactly one alarm is
pending at a time and each firing arms the next. A reboot clears
alarms outright, so the boot receiver re-arms them, and a timezone
change does the same.

USE_EXACT_ALARM rather than SCHEDULE_EXACT_ALARM — Android's docs name
prayer-time apps as its acceptable use case, so it is granted at
install with no runtime prompt and no trip to system settings.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The reminders toggle in Settings

**Files:**
- Modify: `src/app/core/services/prayer/prayer-times.service.ts`
- Modify: `src/app/core/services/prayer/prayer-times.types.ts`
- Modify: `src/app/features/settings/Settings.tsx` (notifications section ~line 875)
- Modify: `src/app/core/i18n/strings.ts` (the `settings.prayerRemindersDesc` copy in both locales)
- Test: `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts` (extend)

**Interfaces:**
- Consumes: the plugin's `getReminders` / `setReminders` from Task 6.
- Produces: `async function getReminders(): Promise<{ enabled: boolean; prayers: PrayerKey[] }>` and `async function setReminders(patch: { enabled?: boolean; prayers?: PrayerKey[] }): Promise<void>` on the service.

- [ ] **Step 1: Write the failing test**

Append to `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts`, and add `getReminders`/`setReminders` to the plugin mock's returned object at the top of the file:

```ts
describe("reminders", () => {
  it("reads the enabled state and prayer list from the plugin", async () => {
    getReminders.mockResolvedValue({
      enabled: true,
      prayers: ["fajr", "maghrib"],
    });

    const result = await service.getReminders();

    expect(result.enabled).toBe(true);
    expect(result.prayers).toEqual(["fajr", "maghrib"]);
  });

  it("refuses to enable reminders without a stored location", async () => {
    getConfig.mockResolvedValue({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: false,
    });
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const ok = await service.enableReminders();

    // Nothing to schedule without coordinates, so it reports failure rather
    // than silently enabling a toggle that can never fire.
    expect(ok).toBe(false);
    expect(setReminders).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx react-scripts test --watchAll=false --testPathPattern "prayer-times.service"
```

Expected: FAIL — `service.getReminders is not a function`.

- [ ] **Step 3: Extend the service**

Add to `prayer-times.service.ts` — and add the two methods to the `RafeeqPrayerPlugin` interface in that file:

```ts
export async function getReminders(): Promise<{
  enabled: boolean;
  prayers: PrayerKey[];
}> {
  return RafeeqPrayer.getReminders();
}

export async function setReminders(patch: {
  enabled?: boolean;
  prayers?: PrayerKey[];
}): Promise<void> {
  await RafeeqPrayer.setReminders(patch);
}

/**
 * Turn reminders on, acquiring a location first if there isn't one.
 *
 * Returns false when no location could be obtained: there is nothing to
 * schedule without coordinates, and a toggle that can never fire is worse
 * than one that refuses to move.
 */
export async function enableReminders(): Promise<boolean> {
  const config = await getPrayerConfig();
  if (!config.hasLocation) {
    const granted = await requestLocation();
    if (!granted) return false;
  }
  await setReminders({ enabled: true });
  return true;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx react-scripts test --watchAll=false --testPathPattern "prayer-times.service"
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Enable the Settings toggle**

In `src/app/features/settings/Settings.tsx`, the notifications section currently wraps both toggles in `settings-card--coming-soon` with a `settings-card-disabled` div and `onChange={() => {}}`. Change **only the prayer reminders row**:

- Move it out of the disabled wrapper, leaving the azkar reminders row disabled inside it.
- Wire `checked={s.prayerReminders}` to a real handler: on turning on, call `enableReminders()`; if it returns false, leave the toggle off and show `t.prayerTimes.locationDenied`. On turning off, call `setReminders({ enabled: false })`.
- Persist through the existing settings-save path used by the other toggles.

- [ ] **Step 6: Update the description copy**

In `strings.ts`, the `settings.prayerRemindersDesc` currently reads "قريباً — سيتطلب إذن الموقع" / "Coming soon — requires location permission". Replace in both locales:

```ts
// ar
    prayerRemindersDesc: "تنبيه عند دخول وقت كل صلاة",
// en
    prayerRemindersDesc: "A notification when each prayer time begins",
```

- [ ] **Step 7: Typecheck and run everything**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
npx react-scripts test --watchAll=false
```

Expected: no `src/` errors; all suites pass.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
enable the prayer reminders toggle in settings

Turning it on with no stored location acquires one first, and refuses
to move if that is declined: a toggle that can never fire is worse than
one that will not switch.

Azkar reminders stay disabled — they are not built.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Hand Stage 2 to the user**

> Stage 2 is done. This needs a build from you to check on a device: that a reminder fires with the app swiped away, that the next one arms itself afterwards, and that both survive a reboot. The notification uses your normal notification sound — adhan audio is deliberately out of scope.

Wait for confirmation before Stage 3.

---

## Stage 3 — The widget

### Task 8: Home-screen widget

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerWidgetProvider.kt`
- Create: `android/app/src/main/res/layout/widget_prayer_times.xml`
- Create: `android/app/src/main/res/layout-night/widget_prayer_times.xml`
- Create: `android/app/src/main/res/xml/widget_prayer_times_info.xml`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerAlarmReceiver.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`

**Interfaces:**
- Consumes: `PrayerTimesEngine`, `PrayerConfig`, `PrayerName` from Tasks 1–2.
- Produces: `object`-level `PrayerWidgetProvider.refresh(ctx: Context)`, callable from the alarm receiver and the plugin.

- [ ] **Step 1: Write the widget metadata**

Create `android/app/src/main/res/xml/widget_prayer_times_info.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/widget_prayer_times"
    android:previewImage="@mipmap/ic_launcher"
    android:updatePeriodMillis="0" />
```

`updatePeriodMillis="0"`: the system's own period is capped at 30 minutes and would fire pointlessly. Updates are driven by the prayer alarms instead, which is exactly when the display changes.

- [ ] **Step 2: Write the layouts**

Create `android/app/src/main/res/layout/widget_prayer_times.xml`: a `LinearLayout` (vertical) with a header row holding the app name and today's date, then a horizontal row of six small vertical `LinearLayout`s, each with a `TextView` for the prayer name (id `name_fajr`, `name_sunrise`, …) and one for the time (id `time_fajr`, `time_sunrise`, …). Add a `TextView` with id `widget_prompt`, initially `android:visibility="gone"`, for the no-location state.

Use `@android:color/black` text on a light rounded background for this file. Create `android/app/src/main/res/layout-night/widget_prayer_times.xml` as the same tree with the same ids and light-on-dark colors — the app's `values`/`values-night` split already follows this convention.

Every id must exist in **both** files, or the night layout crashes when the provider sets a view it cannot find.

- [ ] **Step 3: Write the provider**

Create `PrayerWidgetProvider.kt`. It must:

- Extend `AppWidgetProvider` and override `onUpdate`, delegating to a private `render(ctx, mgr, id)`.
- In `render`: read coords from `PrayerConfig`. If null, show `widget_prompt` (text: open the app to set a location), hide the times row, and stop — **never show times computed from a guessed location**.
- Otherwise compute today's times with `PrayerTimesEngine.timesFor`, format each with a `SimpleDateFormat("HH:mm")` in the device timezone, and set the six `TextView`s. Emphasize the next prayer by setting its name and time `TextView`s to the gold accent.
- Set a `PendingIntent` on the root view opening `MainActivity`, with `FLAG_IMMUTABLE`.
- Expose a companion `fun refresh(ctx: Context)` that looks up every widget id via `AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, PrayerWidgetProvider::class.java))` and re-renders each.

- [ ] **Step 4: Register the provider**

In `AndroidManifest.xml`, inside `<application>`:

```xml
        <receiver
            android:name=".prayer.PrayerWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_prayer_times_info" />
        </receiver>
```

- [ ] **Step 5: Drive the refreshes**

In `PrayerAlarmReceiver.onReceive`, after `PrayerAlarmScheduler.scheduleNext(ctx)`, add:

```kotlin
        PrayerWidgetProvider.refresh(ctx)
```

so the widget's highlight advances as each prayer passes.

In `RafeeqPrayerPlugin`, add the same call at the end of `setLocation` and `setConfig`, so changing location or method updates the widget immediately.

- [ ] **Step 6: Add the midnight roll**

In `PrayerAlarmScheduler`, when the next prayer is tomorrow's Fajr, the widget would show yesterday's times until Fajr fires. Add a second `PendingIntent` (distinct request code) set for 00:01 local time, targeting `PrayerAlarmReceiver` with an extra marking it as a widget-roll rather than a prayer. The receiver, on seeing that extra, calls only `PrayerWidgetProvider.refresh(ctx)` and re-arms the next midnight — it posts no notification.

- [ ] **Step 7: Compile and run all native tests**

```bash
cd android && ./gradlew :app:compileDebugKotlin && ./gradlew :app:testDebugUnitTest
```

Expected: BUILD SUCCESSFUL; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add android/
git commit -m "$(cat <<'EOF'
add the prayer times home-screen widget

The widget reads the engine directly rather than a cache written by the
app, so it is right on a launcher restart, after a reboot, and on a day
the app was never opened — the reason the calculation is native at all.

updatePeriodMillis is 0: the system's own period is capped at 30
minutes and would fire pointlessly. The prayer alarms drive the
refreshes instead, which is exactly when the display changes, plus a
midnight roll for the new day.

With no location stored it prompts rather than showing times from a
guessed position.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Final handoff**

> All three stages are done. This needs a build from you. On the device, worth checking: the widget added from the launcher picker, that it survives a reboot, that its highlight moves as a prayer passes, and that it rolls over at midnight. Light and dark layouts are separate files, so both are worth a look.

---

## Self-Review

**Spec coverage.** Every section maps to a task: native calculation (1), coarse location and config storage (2, 3), permission-denied as a designed state (3, 5), the page with method/madhab pickers and Hijri date (5), strings (4), `USE_EXACT_ALARM` and daily rescheduling and boot survival (6), the Settings toggle (7), the widget with its layouts and refresh triggers (8). Out-of-scope items — iOS, adhan audio, manual city entry, Qibla, calendars, per-prayer offsets — appear in no task.

**Lint rules.** No code block in this plan contains an `eslint-disable` comment of any kind, per the project's standing rule. The service test stubs the native plugins with `jest.mock` and a plain `import * as service`, relying on Jest's hoisting rather than a `require` that would need a disable.

**Type consistency.** `PrayerName` (Kotlin) is uppercase; `PrayerKey` (TS) is lowercase; the plugin lowercases at the boundary in Task 2 Step 5 and the TS types in Task 3 Step 2 expect lowercase. `PrayerConfig.PREFS_NAME` is defined once (Task 2) and reused (Task 6). `PrayerWidgetProvider.refresh` is defined in Task 8 Step 3 and called in Step 5; Task 6 Step 7 explicitly says to omit that call until Stage 3 lands, so no task references a symbol that does not yet exist.
