# Qibla and Visible Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a Qibla compass beside the prayer times on one page, let the user choose which times appear, and restyle the page to the reference layout.

**Architecture:** The Qibla bearing and the magnetic declination are computed natively (adhan-java's `Qibla`, Android's `GeomagneticField`) and corrected there, because the bearing is relative to true north while the device sensor reports magnetic north. The visible-times preference lives in `SharedPreferences` rather than localStorage, because the home-screen widget reads it too. Both views share `/prayer-times` behind a segmented control — Rafeeq already pins a nav bar to every page, so a second one would stack two bars.

**Tech Stack:** Kotlin, `com.batoulapps.adhan:adhan:1.2.1`, Android `GeomagneticField`, Capacitor 8, React 18 + Ionic, Web `deviceorientationabsolute`, JUnit 4 (native), Jest via react-scripts (web).

**Spec:** `docs/superpowers/specs/2026-09-20-qibla-and-visible-times-design.md`

## Global Constraints

- **Branch:** `qibla-and-show`, already created off `prayer-times-ui`.
- **Android only.** There is no `ios/` directory. Never add iOS files.
- **No new npm or Gradle dependency.** `deviceorientationabsolute` is a plain Web API; `Qibla` and `GeomagneticField` already ship with adhan-java and the Android platform. `@capacitor/motion` is explicitly NOT needed.
- **Never add `// eslint-disable` comments**, of any kind, including `react-hooks/exhaustive-deps`.
- **Never add visible scrollbars.** `src/index.css` hides them globally; do not re-add scroll styling that reveals them.
- **Page width:** containers use `max-width: var(--max-width-mobile, 600px)` and `margin: 0 auto`. Never hard-code a pixel width.
- **Fixed nav clearance:** scroll containers need `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`. No trailing spacer `<div>`.
- **Use existing design tokens** (`--color-bg-card`, `--color-border-card`, `--color-gold`, `--radius-xl`, `--radius-pill`, `--space-*`, `--text-*`). Do not invent hex values. Rafeeq is gold-on-black / gold-on-white; the reference screenshots are green and that palette is NOT adopted.
- **The five obligatory prayers can never be hidden.** Enforced natively, not only in the UI.
- **Do not run** `npm run build`, `npx cap sync`, or any gradle *assemble* task. `./gradlew :app:compileDebugKotlin` and `./gradlew :app:testDebugUnitTest` ARE required.
- **Filter `tsc` output to `^src/`** — roughly 50 pre-existing `@types/node` errors are unrelated and must be ignored.
- **Stage explicit paths when committing.** Never `git add -A`.
- **Every commit message** ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Baselines that must not regress

- Kotlin: 20 unit tests, 0 failures (`PrayerTimesEngineTest` 9, `PrayerConfigTest` 2, `PrayerReminderPrefsTest` 3, `PrayerAlarmSchedulerFindNextEnabledTest` 4, `PrayerWidgetProviderTest` 2).
- Web: 28 suites / 259 tests, 0 failures. 0 `src/` type errors.

## File Structure

| File | Responsibility |
|---|---|
| `android/.../prayer/QiblaEngine.kt` | Bearing to the Kaaba + magnetic declination. Pure, no Android UI types. The TDD unit |
| `android/.../prayer/QiblaEngineTest.kt` | JUnit tests against computed reference bearings |
| `android/.../prayer/PrayerConfig.kt` (modify) | `visibleTimes` / `setVisibleTimes`, with the obligatory five forced in |
| `android/.../prayer/PrayerConfigVisibleTimesTest.kt` | Defaults + the always-visible guarantee |
| `android/.../prayer/RafeeqPrayerPlugin.kt` (modify) | `getQibla`, `getVisibleTimes`, `setVisibleTimes` |
| `android/.../prayer/PrayerWidgetProvider.kt` (modify) | Renders the visible set, truncated to six slots |
| `src/app/core/services/prayer/qibla.service.ts` | The only module touching the plugin's qibla call and the orientation sensor |
| `src/app/core/services/prayer/__tests__/qibla.service.test.ts` | Mocked plugin + synthetic orientation events |
| `src/app/core/services/prayer/prayer-times.service.ts` (modify) | `getVisibleTimes` / `setVisibleTimes` wrappers |
| `src/app/features/prayer-times/QiblaView.tsx` / `.css` | Dial, needle, numeric bearing, sensor states |
| `src/app/features/prayer-times/ShowTimesSheet.tsx` / `.css` | The checklist sheet |
| `src/app/features/prayer-times/PrayerTimes.tsx` / `.css` (modify) | Segmented control, restyled hero and card, three-dot menu, visible-set filtering |
| `src/app/features/more/More.tsx` (modify) | Qibla card loses `comingSoon`, deep-links to the qibla view |
| `src/App.tsx` (modify) | Nothing new — `/prayer-times` already routed. Verify only |
| `src/app/core/i18n/strings.ts` (modify) | Qibla and Show strings, both locales |

---

### Task 1: Qibla engine

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/QiblaEngine.kt`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/QiblaEngineTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `object QiblaEngine`
    - `fun bearing(lat: Double, lng: Double): Double` — degrees clockwise from **true** north, 0–360
    - `fun declination(lat: Double, lng: Double): Float` — degrees; positive means magnetic north lies east of true north
    - `fun magneticBearing(lat: Double, lng: Double): Double` — `bearing - declination`, normalised to 0–360. This is what a magnetic compass needle should point to.

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/QiblaEngineTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * Reference bearings are great-circle initial bearings to the Kaaba
 * (21.4225N, 39.8262E), computed independently of adhan-java. A one-degree
 * tolerance absorbs the difference between spherical and ellipsoidal models.
 */
class QiblaEngineTest {

    private fun assertDegreesClose(expected: Double, actual: Double, label: String) {
        // Compare on the circle: 359.5 and 0.5 are one degree apart, not 359.
        val diff = abs((expected - actual + 540.0) % 360.0 - 180.0)
        assertTrue("$label: expected about $expected but was $actual", diff <= 1.0)
    }

    @Test
    fun `cairo faces south-east toward the kaaba`() {
        assertDegreesClose(136.14, QiblaEngine.bearing(30.0444, 31.2357), "Cairo")
    }

    @Test
    fun `jakarta faces north-west toward the kaaba`() {
        assertDegreesClose(295.15, QiblaEngine.bearing(-6.2088, 106.8456), "Jakarta")
    }

    @Test
    fun `london faces south-east toward the kaaba`() {
        assertDegreesClose(118.99, QiblaEngine.bearing(51.5074, -0.1278), "London")
    }

    @Test
    fun `a point due north of mecca faces due south`() {
        // Same meridian, higher latitude: the great circle runs straight down it.
        assertDegreesClose(180.0, QiblaEngine.bearing(40.0, 39.8262), "due north of Mecca")
    }

    @Test
    fun `bearings are always normalised to the zero-to-360 range`() {
        listOf(
            30.0444 to 31.2357,
            -6.2088 to 106.8456,
            51.5074 to -0.1278,
            -33.8688 to 151.2093,
            64.1466 to -21.9426,
        ).forEach { (lat, lng) ->
            val b = QiblaEngine.bearing(lat, lng)
            assertTrue("bearing at $lat,$lng was $b", b >= 0.0 && b < 360.0)
        }
    }

    @Test
    fun `magnetic bearing differs from true bearing by the declination`() {
        val lat = 30.0444
        val lng = 31.2357
        val trueBearing = QiblaEngine.bearing(lat, lng)
        val magnetic = QiblaEngine.magneticBearing(lat, lng)
        val decl = QiblaEngine.declination(lat, lng)

        val expected = (trueBearing - decl + 360.0) % 360.0
        assertEquals(expected, magnetic, 0.001)
    }

    @Test
    fun `magnetic bearing is also normalised`() {
        val b = QiblaEngine.magneticBearing(64.1466, -21.9426) // Reykjavik: large declination
        assertTrue("magnetic bearing was $b", b >= 0.0 && b < 360.0)
    }
}
```

Note on `declination`: it calls Android's `GeomagneticField`, which is available in unit tests only as a stub returning 0 unless `testOptions.unitTests.returnDefaultValues` is set. The test above asserts the *relationship* between the three functions, not a specific declination value — so it passes whether the stub returns 0 or a real value, and does not rot as the World Magnetic Model drifts. Do not add an assertion on a literal declination number.

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.QiblaEngineTest"
```

Expected: compilation failure — `Unresolved reference: QiblaEngine`.

- [ ] **Step 3: Enable default return values for Android stubs**

In `android/app/build.gradle`, inside the `android { ... }` block, add:

```gradle
    testOptions {
        unitTests {
            // GeomagneticField is an Android framework class. Without this the
            // JVM stub throws on call; with it, it returns 0 and QiblaEngine's
            // arithmetic stays testable off-device.
            returnDefaultValues = true
        }
    }
```

- [ ] **Step 4: Write the engine**

Create `android/app/src/main/java/com/rafeeq/quranquiz/prayer/QiblaEngine.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import android.hardware.GeomagneticField
import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.Qibla

/**
 * Direction to the Kaaba, and the correction a magnetic compass needs.
 *
 * adhan-java reports the bearing relative to TRUE north. A device compass
 * reports its heading relative to MAGNETIC north. Subtracting one from the
 * other without correcting for the local declination produces a needle wrong
 * by up to twenty degrees — so the correction happens here, once, rather than
 * being left to each consumer.
 *
 * GeomagneticField is part of the Android platform and works entirely offline:
 * it evaluates the World Magnetic Model from a built-in table.
 */
object QiblaEngine {

    /** Degrees clockwise from true north, 0 (inclusive) to 360 (exclusive). */
    fun bearing(lat: Double, lng: Double): Double =
        normalise(Qibla(Coordinates(lat, lng)).direction)

    /**
     * Local magnetic declination in degrees: positive where magnetic north
     * lies east of true north.
     */
    fun declination(lat: Double, lng: Double): Float =
        GeomagneticField(
            lat.toFloat(),
            lng.toFloat(),
            0f,
            System.currentTimeMillis(),
        ).declination

    /**
     * The bearing a magnetic compass needle should show — the true bearing
     * less the declination.
     */
    fun magneticBearing(lat: Double, lng: Double): Double =
        normalise(bearing(lat, lng) - declination(lat, lng))

    private fun normalise(degrees: Double): Double = ((degrees % 360.0) + 360.0) % 360.0
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.QiblaEngineTest" --rerun-tasks
```

Expected: 7 tests PASS. If a bearing is off by more than a degree, do NOT widen the tolerance — check that `Coordinates(lat, lng)` is in that order and not transposed.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/QiblaEngine.kt android/app/src/test/java/com/rafeeq/quranquiz/prayer/QiblaEngineTest.kt android/app/build.gradle
git commit -m "$(cat <<'EOF'
compute the qibla bearing and its magnetic correction

adhan-java gives the bearing relative to true north; a device compass
reads relative to magnetic north. Subtracting one from the other
uncorrected yields a needle wrong by the local declination — about five
degrees in Cairo and up to twenty elsewhere. For a direction people
pray toward, silently wrong is the worst available failure, so the
correction lives here rather than in each consumer.

GeomagneticField is part of the platform and evaluates the World
Magnetic Model offline, so this needs no network and no new dependency.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Visible-times preference

**Files:**
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigVisibleTimesTest.kt`

**Interfaces:**
- Consumes: `PrayerName` from `PrayerTimesEngine.kt`.
- Produces on `PrayerConfig`:
  - `val OBLIGATORY_TIMES: Set<String>` — `setOf("fajr", "dhuhr", "asr", "maghrib", "isha")`
  - `val DEFAULT_VISIBLE_TIMES: Set<String>` — the obligatory five plus `"sunrise"`
  - `fun visibleTimes(ctx: Context): Set<String>` — always a superset of `OBLIGATORY_TIMES`
  - `fun setVisibleTimes(ctx: Context, times: Set<String>)` — stores the union with `OBLIGATORY_TIMES`

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigVisibleTimesTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Storage needs a Context a JVM test cannot build, so what is asserted here is
 * the part with no Android dependency: the defaults, and the rule that the
 * obligatory prayers can never be hidden.
 */
class PrayerConfigVisibleTimesTest {

    @Test
    fun `the five obligatory prayers are exactly the ones that cannot be hidden`() {
        assertEquals(
            setOf("fajr", "dhuhr", "asr", "maghrib", "isha"),
            PrayerConfig.OBLIGATORY_TIMES,
        )
    }

    @Test
    fun `sunrise is not obligatory but is visible by default`() {
        // It is displayed with the prayers but is not one, so it may be hidden.
        assertFalse(PrayerConfig.OBLIGATORY_TIMES.contains("sunrise"))
        assertTrue(PrayerConfig.DEFAULT_VISIBLE_TIMES.contains("sunrise"))
    }

    @Test
    fun `the supplementary times are hidden by default`() {
        // Matches what the page showed before this preference existed, so an
        // existing user sees no change until they opt in.
        listOf("duha", "midnight", "last_third").forEach {
            assertFalse("$it must be hidden by default", PrayerConfig.DEFAULT_VISIBLE_TIMES.contains(it))
        }
    }

    @Test
    fun `the default visible set contains every obligatory prayer`() {
        assertTrue(PrayerConfig.DEFAULT_VISIBLE_TIMES.containsAll(PrayerConfig.OBLIGATORY_TIMES))
    }

    @Test
    fun `sanitising a set restores any missing obligatory prayer`() {
        // The guarantee the UI relies on: even a stored set that somehow omits
        // Fajr comes back with it, so no code path can hide an obligatory time.
        val sanitised = PrayerConfig.sanitiseVisibleTimes(setOf("duha"))

        assertTrue(sanitised.containsAll(PrayerConfig.OBLIGATORY_TIMES))
        assertTrue("an explicit choice is kept", sanitised.contains("duha"))
    }

    @Test
    fun `sanitising drops names that are not real times`() {
        val sanitised = PrayerConfig.sanitiseVisibleTimes(setOf("fajr", "not_a_time"))

        assertFalse(sanitised.contains("not_a_time"))
    }

    @Test
    fun `every default visible name is a real prayer name`() {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        assertTrue(known.containsAll(PrayerConfig.DEFAULT_VISIBLE_TIMES))
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerConfigVisibleTimesTest"
```

Expected: `Unresolved reference: OBLIGATORY_TIMES`.

- [ ] **Step 3: Extend PrayerConfig**

Add inside the `PrayerConfig` object in `PrayerConfig.kt`:

```kotlin
    /**
     * Times the user may never hide. A prayer-times app that can be configured
     * to omit Fajr is not one, so this is enforced here rather than only in the
     * UI — every read passes through sanitiseVisibleTimes.
     */
    val OBLIGATORY_TIMES: Set<String> =
        setOf("fajr", "dhuhr", "asr", "maghrib", "isha")

    /**
     * Sunrise joins the obligatory five; the supplementary times start hidden,
     * so the page looks exactly as it did before this preference existed.
     */
    val DEFAULT_VISIBLE_TIMES: Set<String> = OBLIGATORY_TIMES + "sunrise"

    private const val KEY_VISIBLE_TIMES = "visible_times"

    /** Forces the obligatory times in and drops anything that is not a real time. */
    fun sanitiseVisibleTimes(times: Set<String>): Set<String> {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        return (times + OBLIGATORY_TIMES).filter { it in known }.toSet()
    }

    fun visibleTimes(ctx: Context): Set<String> {
        val stored = prefs(ctx).getStringSet(KEY_VISIBLE_TIMES, null)
            ?: return DEFAULT_VISIBLE_TIMES
        return sanitiseVisibleTimes(stored)
    }

    fun setVisibleTimes(ctx: Context, times: Set<String>) {
        prefs(ctx).edit()
            .putStringSet(KEY_VISIBLE_TIMES, sanitiseVisibleTimes(times))
            .apply()
    }
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "com.rafeeq.quranquiz.prayer.PrayerConfigVisibleTimesTest" --rerun-tasks
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt android/app/src/test/java/com/rafeeq/quranquiz/prayer/PrayerConfigVisibleTimesTest.kt
git commit -m "$(cat <<'EOF'
store which prayer times the user wants shown

The preference lives in SharedPreferences rather than localStorage
because the home-screen widget reads it too: hiding sunrise in the app
should not leave it on the home screen.

Every read passes through sanitiseVisibleTimes, so the five obligatory
prayers are forced back in even if storage says otherwise. A
prayer-times app that can be configured to omit Fajr is not one, and
that rule belongs where the data is, not only in the UI.

Supplementary times start hidden, so the page looks exactly as it did
before this preference existed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Plugin surface and widget

**Files:**
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerWidgetProvider.kt`

**Interfaces:**
- Consumes: `QiblaEngine` (Task 1), `PrayerConfig.visibleTimes` / `setVisibleTimes` / `OBLIGATORY_TIMES` (Task 2).
- Produces, on the `RafeeqPrayer` plugin:
  - `getQibla()` → `{ hasLocation: boolean, bearing?: number, magneticBearing?: number, declination?: number }` — degrees, absent when no coordinates are stored
  - `getVisibleTimes()` → `{ times: string[] }`
  - `setVisibleTimes({ times: string[] })` → resolves empty; refreshes the widget

- [ ] **Step 1: Add the plugin methods**

In `RafeeqPrayerPlugin.kt`, add these three methods alongside the existing ones, and add `import com.getcapacitor.JSArray` if it is not already imported:

```kotlin
    /**
     * The qibla direction for the stored location.
     *
     * Resolves hasLocation:false rather than rejecting when no coordinates are
     * stored — the same designed state getTimes uses, which the page renders as
     * its permission prompt.
     */
    @PluginMethod
    fun getQibla(call: PluginCall) {
        val result = JSObject()
        val coords = PrayerConfig.coords(context)
        if (coords == null) {
            result.put("hasLocation", false)
            call.resolve(result)
            return
        }
        val (lat, lng) = coords
        result.put("hasLocation", true)
        result.put("bearing", QiblaEngine.bearing(lat, lng))
        result.put("magneticBearing", QiblaEngine.magneticBearing(lat, lng))
        result.put("declination", QiblaEngine.declination(lat, lng).toDouble())
        call.resolve(result)
    }

    @PluginMethod
    fun getVisibleTimes(call: PluginCall) {
        val result = JSObject()
        result.put("times", JSArray.from(PrayerConfig.visibleTimes(context).toTypedArray()))
        call.resolve(result)
    }

    @PluginMethod
    fun setVisibleTimes(call: PluginCall) {
        val arr = call.getArray("times")
        if (arr == null) {
            call.reject("times is required")
            return
        }
        PrayerConfig.setVisibleTimes(context, arr.toList<String>().toSet())
        // The widget renders the same set, so it must not lag the app.
        PrayerWidgetProvider.refresh(context)
        call.resolve()
    }
```

Update the plugin's header KDoc comment to list the three new methods alongside the existing ones.

- [ ] **Step 2: Make the widget honour the visible set**

In `PrayerWidgetProvider.kt`, the render path currently walks `VIEW_IDS` (a `List<Triple<PrayerName, Int, Int>>`) and fills each slot from `DAILY_TIMETABLE`. Change it so the slots are filled from the **visible set** instead:

- Read `PrayerConfig.visibleTimes(ctx)` at the top of `render`.
- Build the ordered list to display: take `PrayerName.values()` in enum order (which is already display order: FAJR, SUNRISE, DUHA, DHUHR, ASR, MAGHRIB, ISHA, MIDNIGHT, LAST_THIRD), keep only names whose lowercase form is in the visible set AND whose time is non-null, then take the first `VIEW_IDS.size` entries.
- Zip that list against `VIEW_IDS`: slot *i* shows entry *i*.
- **Any slot beyond the end of the list must be hidden** with `views.setViewVisibility(nameViewId, View.GONE)` and the same for its time view — otherwise a shorter visible set leaves stale text from the previous render in the trailing slots.

Add a comment explaining that the widget shows the visible set truncated to its fixed slot count, so hiding sunrise frees a slot for Duha.

- [ ] **Step 3: Update the widget's slot test**

The existing `PrayerWidgetProviderTest` asserts `VIEW_IDS` maps exactly onto `PrayerTimesEngine.DAILY_TIMETABLE`. That is no longer the contract — the ids are now generic slots, not per-prayer positions. Replace that test with two that assert what is actually true now:

```kotlin
    @Test
    fun `the widget has six slots`() {
        // Fixed geometry: the layout declares six name/time pairs, and the
        // visible set is truncated to fit rather than the layout growing.
        assertEquals(6, PrayerWidgetProvider.VIEW_IDS.size)
    }

    @Test
    fun `no view id is reused across slots`() {
        // A duplicated id would make two slots overwrite each other — the exact
        // copy-paste error this table invites.
        val ids = PrayerWidgetProvider.VIEW_IDS.flatMap { listOf(it.first, it.second) }
        assertEquals(ids.size, ids.toSet().size)
    }
```

**Convert `VIEW_IDS` from `List<Triple<PrayerName, Int, Int>>` to `List<Pair<Int, Int>>`** as part of this step. The `PrayerName` element no longer means anything once slots are generic positions, and leaving it would invite a future reader to believe slot *i* is bound to prayer *i* — the exact confusion this refactor removes. The test code above already assumes the `Pair` form (`it.first` / `it.second`); update the render zip to match.

- [ ] **Step 4: Compile and run every native test**

```bash
cd android && ./gradlew :app:compileDebugKotlin && ./gradlew :app:testDebugUnitTest --rerun-tasks
```

Expected: BUILD SUCCESSFUL. Test count is now 28 (20 prior + 7 Task 1 + 7 Task 2, minus the one widget test replaced by two, so 20 + 7 + 7 + 1 = 35 — verify the actual number and record it; the point is zero failures, not a specific total).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/ android/app/src/test/java/com/rafeeq/quranquiz/prayer/
git commit -m "$(cat <<'EOF'
expose qibla and the visible-times preference to the web layer

The widget now renders the visible set rather than a fixed timetable,
truncated to its six slots, so hiding sunrise frees a slot for Duha.
Trailing slots are hidden rather than left holding text from the
previous render.

That also changes what the slot table means: the ids are generic
positions now, not per-prayer ones, so its test asserts the geometry
and the absence of duplicate ids instead of a mapping onto the
timetable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Qibla web service

**Files:**
- Create: `src/app/core/services/prayer/qibla.service.ts`
- Test: `src/app/core/services/prayer/__tests__/qibla.service.test.ts`
- Modify: `src/app/core/services/prayer/prayer-times.service.ts`
- Modify: `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts`
- Modify: `src/app/core/services/prayer/__tests__/prayer-times.service.web.test.ts`

**Interfaces:**
- Consumes: the plugin methods from Task 3.
- Produces:
  - In `qibla.service.ts`:
    - `interface QiblaDirection { hasLocation: boolean; bearing: number | null; magneticBearing: number | null; declination: number | null }`
    - `async function loadQibla(): Promise<QiblaDirection>`
    - `function watchHeading(onHeading: (deg: number) => void, onUnavailable: () => void): () => void` — starts listening, calls `onUnavailable` if no event arrives within `HEADING_TIMEOUT_MS`, returns a teardown function
    - `const HEADING_TIMEOUT_MS = 3000`
  - In `prayer-times.service.ts`:
    - `async function getVisibleTimes(): Promise<PrayerKey[]>`
    - `async function setVisibleTimes(times: PrayerKey[]): Promise<void>`

- [ ] **Step 1: Write the failing qibla test**

Create `src/app/core/services/prayer/__tests__/qibla.service.test.ts`:

```ts
jest.mock("@capacitor/core", () => {
  const plugin = { getQibla: jest.fn() };
  return {
    registerPlugin: () => plugin,
    Capacitor: { isNativePlatform: () => true },
  };
});

import { registerPlugin } from "@capacitor/core";
import * as service from "../qibla.service";

const plugin = registerPlugin("RafeeqPrayer") as unknown as {
  getQibla: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("loadQibla", () => {
  it("returns the bearings the plugin computed", async () => {
    plugin.getQibla.mockResolvedValue({
      hasLocation: true,
      bearing: 136.14,
      magneticBearing: 131.2,
      declination: 4.94,
    });

    const q = await service.loadQibla();

    expect(q.hasLocation).toBe(true);
    expect(q.bearing).toBeCloseTo(136.14, 2);
    expect(q.magneticBearing).toBeCloseTo(131.2, 2);
  });

  it("reports no location rather than throwing when none is stored", async () => {
    plugin.getQibla.mockResolvedValue({ hasLocation: false });

    const q = await service.loadQibla();

    expect(q.hasLocation).toBe(false);
    expect(q.bearing).toBeNull();
  });
});

describe("watchHeading", () => {
  it("reports each heading the device emits", () => {
    const onHeading = jest.fn();
    const onUnavailable = jest.fn();

    const stop = service.watchHeading(onHeading, onUnavailable);

    const event = new Event("deviceorientationabsolute") as Event & {
      alpha: number;
      absolute: boolean;
    };
    event.alpha = 90;
    event.absolute = true;
    window.dispatchEvent(event);

    expect(onHeading).toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    stop();
  });

  it("declares the sensor unavailable when no event arrives in time", () => {
    jest.useFakeTimers();
    const onHeading = jest.fn();
    const onUnavailable = jest.fn();

    const stop = service.watchHeading(onHeading, onUnavailable);
    jest.advanceTimersByTime(service.HEADING_TIMEOUT_MS + 1);

    // A phone with no magnetometer never fires the event at all, so silence
    // has to be turned into an answer rather than a permanent spinner.
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onHeading).not.toHaveBeenCalled();
    stop();
  });

  it("stops listening once torn down", () => {
    const onHeading = jest.fn();
    const stop = service.watchHeading(onHeading, jest.fn());
    stop();

    const event = new Event("deviceorientationabsolute") as Event & {
      alpha: number;
    };
    event.alpha = 90;
    window.dispatchEvent(event);

    expect(onHeading).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx react-scripts test --watchAll=false --testPathPattern "qibla.service"
```

Expected: FAIL — cannot find module `../qibla.service`.

- [ ] **Step 3: Write the qibla service**

Create `src/app/core/services/prayer/qibla.service.ts`:

```ts
/**
 * QIBLA SERVICE
 * The only module that talks to the plugin's qibla call and to the device
 * orientation sensor.
 *
 * The bearing itself is computed natively, together with the magnetic
 * declination: adhan-java reports relative to true north while the sensor
 * reports relative to magnetic north, and correcting that in one place keeps
 * every consumer honest.
 *
 * The sensor is treated as an enhancement, never a requirement. Phones without
 * a magnetometer never fire the event at all, so silence is turned into an
 * answer after HEADING_TIMEOUT_MS rather than leaving a spinner forever.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface RafeeqQiblaPlugin {
  getQibla(): Promise<{
    hasLocation: boolean;
    bearing?: number;
    magneticBearing?: number;
    declination?: number;
  }>;
}

const RafeeqPrayer = registerPlugin<RafeeqQiblaPlugin>("RafeeqPrayer");

const isNative = Capacitor.isNativePlatform();

/** How long to wait for a first orientation event before giving up on it. */
export const HEADING_TIMEOUT_MS = 3000;

export interface QiblaDirection {
  hasLocation: boolean;
  /** Degrees clockwise from true north. */
  bearing: number | null;
  /** Degrees clockwise from magnetic north — what a needle should match. */
  magneticBearing: number | null;
  declination: number | null;
}

const NO_DIRECTION: QiblaDirection = {
  hasLocation: false,
  bearing: null,
  magneticBearing: null,
  declination: null,
};

export async function loadQibla(): Promise<QiblaDirection> {
  if (!isNative) return NO_DIRECTION;

  const raw = await RafeeqPrayer.getQibla();
  if (
    !raw.hasLocation ||
    raw.bearing === undefined ||
    raw.magneticBearing === undefined
  ) {
    return NO_DIRECTION;
  }

  return {
    hasLocation: true,
    bearing: raw.bearing,
    magneticBearing: raw.magneticBearing,
    declination: raw.declination ?? null,
  };
}

/**
 * Listen for the device's compass heading.
 *
 * `onUnavailable` fires once if nothing arrives within HEADING_TIMEOUT_MS,
 * which is what a device with no magnetometer looks like from here. Returns a
 * teardown function; callers must call it.
 */
export function watchHeading(
  onHeading: (deg: number) => void,
  onUnavailable: () => void,
): () => void {
  let settled = false;

  const timer = window.setTimeout(() => {
    if (!settled) {
      settled = true;
      onUnavailable();
    }
  }, HEADING_TIMEOUT_MS);

  const handle = (event: Event) => {
    const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    // iOS exposes a ready-made compass heading; elsewhere alpha counts
    // anticlockwise from north, so it is subtracted from 360.
    const heading =
      typeof e.webkitCompassHeading === "number"
        ? e.webkitCompassHeading
        : typeof e.alpha === "number"
        ? (360 - e.alpha) % 360
        : null;

    if (heading === null) return;

    settled = true;
    window.clearTimeout(timer);
    onHeading(heading);
  };

  window.addEventListener("deviceorientationabsolute", handle, true);
  // Older Android WebViews only fire the non-absolute event.
  window.addEventListener("deviceorientation", handle, true);

  return () => {
    settled = true;
    window.clearTimeout(timer);
    window.removeEventListener("deviceorientationabsolute", handle, true);
    window.removeEventListener("deviceorientation", handle, true);
  };
}
```

- [ ] **Step 4: Run the qibla tests and watch them pass**

```bash
npx react-scripts test --watchAll=false --testPathPattern "qibla.service"
```

Expected: 5 tests PASS.

- [ ] **Step 5: Add the visible-times wrappers**

In `src/app/core/services/prayer/prayer-times.service.ts`, add the two methods to the `RafeeqPrayerPlugin` interface and export wrappers following the existing `isNative` pattern exactly:

```ts
export async function getVisibleTimes(): Promise<PrayerKey[]> {
  if (!isNative) return [...PRAYER_KEYS];
  const { times } = await RafeeqPrayer.getVisibleTimes();
  return times as PrayerKey[];
}

export async function setVisibleTimes(times: PrayerKey[]): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setVisibleTimes({ times });
}
```

Add to the plugin interface in that file:

```ts
  getVisibleTimes(): Promise<{ times: string[] }>;
  setVisibleTimes(options: { times: string[] }): Promise<void>;
```

- [ ] **Step 6: Test the wrappers on both platform paths**

Add to `prayer-times.service.test.ts` (native path) — remember to add `getVisibleTimes` and `setVisibleTimes` to that file's plugin mock object:

```ts
describe("visible times", () => {
  it("returns the set the plugin reports", async () => {
    getVisibleTimes.mockResolvedValue({ times: ["fajr", "dhuhr", "duha"] });

    const times = await service.getVisibleTimes();

    expect(times).toEqual(["fajr", "dhuhr", "duha"]);
  });

  it("passes a chosen set straight through to the plugin", async () => {
    await service.setVisibleTimes(["fajr", "dhuhr", "asr", "maghrib", "isha"]);

    expect(setVisibleTimes).toHaveBeenCalledWith({
      times: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
    });
  });
});
```

And to `prayer-times.service.web.test.ts` (web path):

```ts
describe("visible times on web", () => {
  it("falls back to the full timetable without calling the plugin", async () => {
    const times = await service.getVisibleTimes();

    expect(times).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(plugin.getVisibleTimes).not.toHaveBeenCalled();
  });

  it("makes setVisibleTimes a no-op", async () => {
    await expect(service.setVisibleTimes(["fajr"])).resolves.toBeUndefined();
    expect(plugin.setVisibleTimes).not.toHaveBeenCalled();
  });
});
```

Add `getVisibleTimes: jest.fn()` and `setVisibleTimes: jest.fn()` to the plugin object inside BOTH files' `jest.mock("@capacitor/core", ...)` factories. Those factories build their mocks inside the factory because `babel-plugin-jest-hoist@27.5.1` rejects a factory referencing non-`mock`-prefixed outer consts — follow the existing shape, do not restructure it.

- [ ] **Step 7: Run everything**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
CI=true npx react-scripts test --watchAll=false
```

Expected: no `src/` output; 29 suites (28 prior + qibla), all passing.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/services/prayer/
git commit -m "$(cat <<'EOF'
add the qibla service and the visible-times wrappers

The sensor is an enhancement, not a requirement: a phone without a
magnetometer never fires the orientation event at all, so silence is
turned into an answer after three seconds rather than leaving the view
spinning forever. The numeric bearing needs no sensor and is always
available.

Both the absolute and the plain orientation events are bound, because
older Android WebViews only fire the latter.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Show-times sheet

**Files:**
- Create: `src/app/features/prayer-times/ShowTimesSheet.tsx`
- Create: `src/app/features/prayer-times/ShowTimesSheet.css`
- Modify: `src/app/core/i18n/strings.ts`

**Interfaces:**
- Consumes: `getVisibleTimes` / `setVisibleTimes` from Task 4; `PRAYER_KEYS`, `ADDITIONAL_KEYS`, `PrayerKey` from `prayer-times.types`.
- Produces: `ShowTimesSheet` — props `{ open: boolean; onClose: () => void; onChanged: () => void }`.

- [ ] **Step 1: Read the sheet pattern this must follow**

Read `src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx` and its `.css` before writing. Match: a fixed backdrop that closes on click, a bottom-anchored panel, and — critically — the overlay registry:

```ts
import { registerOverlay } from "../../core/utils/overlay-registry";

useEffect(() => {
  if (!open) return;
  return registerOverlay(onClose);
}, [open, onClose]);
```

`registerOverlay(close)` returns its own unregister function, so returning it directly from the effect is the whole cleanup. Without this, the Android hardware back button leaves the page instead of closing the sheet.

- [ ] **Step 2: Add the strings**

In `src/app/core/i18n/strings.ts`, add to the `prayerTimes` interface block and to BOTH locale objects:

```ts
    // interface
    show: string;
    showDesc: string;
    alwaysShown: string;
```

```ts
    // ar
    show: "الأوقات المعروضة",
    showDesc: "اختر ما يظهر في القائمة",
    alwaysShown: "دائماً",
```

```ts
    // en
    show: "Shown times",
    showDesc: "Choose what appears in the list",
    alwaysShown: "Always",
```

- [ ] **Step 3: Write the sheet**

Create `ShowTimesSheet.tsx`. It must:

- Load the current set with `getVisibleTimes()` when `open` becomes true, into local state.
- List every key in `[...PRAYER_KEYS, ...ADDITIONAL_KEYS]` order, labelled from `t.prayerTimes[key]`.
- Render each as a row with a checkbox. **The five obligatory keys (`fajr`, `dhuhr`, `asr`, `maghrib`, `isha`) render checked and `disabled`, with `t.prayerTimes.alwaysShown` as a short note in place of an interactive control.** Do not rely on the native guarantee alone — the UI must not offer a toggle that silently does nothing.
- On toggling a non-obligatory key, update local state, call `setVisibleTimes(next)`, then `onChanged()` so the page reloads its rows.
- Register with the overlay registry as in Step 1, and render nothing when `open` is false.
- Use `t.prayerTimes.show` as the heading and `showDesc` beneath it.

Create `ShowTimesSheet.css` following `VerseActionSheet.css`: fixed backdrop, bottom-anchored panel capped at `var(--max-width-mobile, 600px)` and centred, `--color-bg-card` surface, `1.5px solid var(--color-border-card)`, top corners `var(--radius-xl)`. Include a `@media (prefers-reduced-motion: reduce)` block. **No scrollbar styling.**

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/prayer-times/ShowTimesSheet.tsx src/app/features/prayer-times/ShowTimesSheet.css src/app/core/i18n/strings.ts
git commit -m "$(cat <<'EOF'
add the sheet for choosing which times are shown

The obligatory five render as checked and disabled rather than simply
being forced back by the native layer: a toggle that silently undoes
itself is worse than one that is visibly unavailable.

Registers with the overlay registry, so the hardware back button closes
the sheet instead of leaving the page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Qibla view

**Files:**
- Create: `src/app/features/prayer-times/QiblaView.tsx`
- Create: `src/app/features/prayer-times/QiblaView.css`
- Modify: `src/app/core/i18n/strings.ts`

**Interfaces:**
- Consumes: `loadQibla`, `watchHeading`, `QiblaDirection` from Task 4; `requestLocation` from `prayer-times.service`.
- Produces: `QiblaView` — props `{ onNeedLocation: () => void }`, called when the user taps the grant button so the parent can reuse its existing permission flow.

- [ ] **Step 1: Add the strings**

Add to the `prayerTimes` interface and BOTH locales:

```ts
    // interface
    qibla: string;
    qiblaFromNorth: string;
    qiblaNoSensor: string;
    qiblaCalibrate: string;
    prayersTab: string;
```

```ts
    // ar
    qibla: "القبلة",
    qiblaFromNorth: "{deg}° من الشمال",
    qiblaNoSensor: "لا تتوفر بوصلة في هذا الجهاز. اتجاه القبلة من الشمال مذكور أعلاه.",
    qiblaCalibrate: "حرّك الجهاز على شكل رقم ٨ لمعايرة البوصلة",
    prayersTab: "الصلوات",
```

```ts
    // en
    qibla: "Qibla",
    qiblaFromNorth: "{deg}° from north",
    qiblaNoSensor: "This device has no compass. The bearing from north is shown above.",
    qiblaCalibrate: "Move the device in a figure eight to calibrate the compass",
    prayersTab: "Prayers",
```

- [ ] **Step 2: Write the view**

Create `QiblaView.tsx`. Required behaviour:

- On mount, call `loadQibla()`. If `hasLocation` is false, render the same permission prompt shape the prayers view uses (heading `locationNeeded`, body `locationNeededDesc`, a button calling `onNeedLocation`). This is a designed state, not an error.
- With a bearing, always render the **numeric bearing**: `t.prayerTimes.qiblaFromNorth` with `{deg}` replaced by the rounded `bearing`. This never depends on a sensor.
- Call `watchHeading` in an effect, storing the teardown and calling it on unmount. **The effect must clean up properly — a leaked listener keeps firing after navigation.**
- Needle rotation is `magneticBearing - heading`, so the needle points at the Kaaba as the device turns. Apply it with a CSS `transform: rotate(Ndeg)` on the needle element only, not the whole dial.
- On `onUnavailable`, set a flag and render `qiblaNoSensor` beneath the numeric bearing, with no needle.
- Show `qiblaCalibrate` when an event arrives with `absolute === false`, since a non-absolute reading is relative and unreliable for this.

Create `QiblaView.css`: a circular dial built from tokens (`--color-border-card` ring, `--color-gold` needle), the numeric bearing in `--text-3xl` gold, cardinal marks in `--color-text-muted`. Include `@media (prefers-reduced-motion: reduce)` disabling the needle's rotation transition. **No scrollbar styling; no hard-coded widths.**

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/prayer-times/QiblaView.tsx src/app/features/prayer-times/QiblaView.css src/app/core/i18n/strings.ts
git commit -m "$(cat <<'EOF'
add the qibla compass view

The numeric bearing is always shown because it is always correct and
needs no sensor; the needle is an enhancement over it. A device with no
magnetometer gets a real answer rather than a broken dial.

The needle follows the magnetic bearing, not the true one — the device
reports its heading against magnetic north, and the native layer has
already applied the declination.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Page layout, segmented control and menu

**Files:**
- Modify: `src/app/features/prayer-times/PrayerTimes.tsx`
- Modify: `src/app/features/prayer-times/PrayerTimes.css`
- Modify: `src/app/features/more/More.tsx`

**Interfaces:**
- Consumes: `QiblaView` (Task 6), `ShowTimesSheet` (Task 5), `getVisibleTimes` (Task 4).
- Produces: the finished page. Nothing later depends on it.

- [ ] **Step 1: Add the segmented control**

In `PrayerTimes.tsx`:

- Add `const [view, setView] = useState<"prayers" | "qibla">(...)`, initialised from the query string: `new URLSearchParams(location.search).get("view") === "qibla" ? "qibla" : "prayers"`. Use `useLocation` from `react-router-dom`, which the codebase already uses elsewhere.
- Render a two-button segmented control above everything, labelled `t.prayerTimes.prayersTab` and `t.prayerTimes.qibla`, with the active one carrying a `--radius-pill` gold-tinted background.
- When `view === "qibla"`, render `<QiblaView onNeedLocation={handleGrantLocation} />` in place of the hero/dates/rows, keeping the segmented control and `<BottomNavBar active="more" fixed />`.

- [ ] **Step 2: Filter rows by the visible set**

- Add `const [visible, setVisible] = useState<PrayerKey[] | null>(null)`.
- Load it with `getVisibleTimes()` inside the existing `load` callback, so one refresh updates times and visibility together.
- Replace the row list source: instead of `PRAYER_KEYS.filter(...)` plus a separate `ADDITIONAL_KEYS` section, build one ordered list from `[...PRAYER_KEYS, ...ADDITIONAL_KEYS]` filtered to entries that are both in `visible` and present in `day.times`.
- **Remove the `additionalOpen` state, the `pt-additional*` markup and its CSS entirely.** The visible-set preference replaces it; two mechanisms for hiding the same rows is one too many.
- Insert a **dashed separator** before the first supplementary row that is visible (`duha`, `midnight`, `last_third`), matching the screenshot. If none are visible, no separator renders.

- [ ] **Step 3: Add the three-dot menu**

- A button in the card header row, right-aligned, with a vertical-ellipsis SVG (three `<circle>` elements, matching the More tab's horizontal one in `BottomNavBar.tsx`).
- Tapping it opens `ShowTimesSheet` directly. The reference app's menu also lists Countdown, Calculation Settings, Mute and Share; only **Show** is in scope, so the button opens that sheet rather than an intermediate menu with one live entry and four dead ones.
- Pass `onChanged={load}` so the rows refresh when the set changes.

- [ ] **Step 4: Restyle the hero and card**

In `PrayerTimes.css`:

- Hero: change from centred to **start-aligned** (`align-items: flex-start`, `text-align: start`), with the prayer name preceded by a `»` marker rendered as a CSS `::before` on `.pt-hero-name` in `--color-gold`. In RTL the marker must point the other way — use `«` under `[dir="rtl"]`.
- Give the hero a subtle background band distinct from the page (`--color-bg-card-alt` or a gold-faint gradient) so the card below can overlap it.
- The card holding the date row and the list gets `border-radius: var(--radius-xl)` on its **top corners only**, `margin-top: calc(-1 * var(--space-5))` to overlap the hero band, and `--color-bg-card`.
- Add `.pt-separator`: a 1px dashed line in `--color-border-subtle`, with `var(--space-3)` margin.
- Add `.pt-segmented` and `.pt-segment` rules: a pill-shaped container, the active segment filled with `--color-gold-faint` and bordered `--color-gold`.

Keep every hard rule: `max-width: var(--max-width-mobile, 600px)`, `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`, no scrollbar styling, a `prefers-reduced-motion` block.

- [ ] **Step 5: Enable the Qibla card**

In `src/app/features/more/More.tsx`, on the `qibla` entry: delete `comingSoon: true,` and change `route: "/qibla"` to `route: "/prayer-times?view=qibla"`.

- [ ] **Step 6: Verify no orphaned CSS**

```bash
python - <<'PY'
import re, io
css = io.open("src/app/features/prayer-times/PrayerTimes.css", encoding="utf-8").read()
tsx = io.open("src/app/features/prayer-times/PrayerTimes.tsx", encoding="utf-8").read()
d = set(re.findall(r'\.(pt-[\w-]+)', css))
u = set(re.findall(r'[\s"\'](pt-[\w-]+)', tsx))
print("unused:", sorted(d-u) or "none", "| undefined:", sorted(u-d) or "none")
PY
```

Expected: both "none". The `pt-additional*` rules must be gone, not merely unreferenced.

- [ ] **Step 7: Run everything**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^src/"
CI=true npx react-scripts test --watchAll=false
cd android && ./gradlew :app:testDebugUnitTest --rerun-tasks
```

Expected: no `src/` type errors; all web suites pass; all native tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/prayer-times/ src/app/features/more/More.tsx
git commit -m "$(cat <<'EOF'
put qibla beside the times and let the user choose what shows

Both views share one page behind a segmented control rather than the
reference app's bottom nav: Rafeeq already pins a nav bar to every
page, and a second would stack two bars.

The visible-set preference replaces the collapsible section added last
branch — two mechanisms for hiding the same rows is one too many — and
a dashed rule now separates the supplementary times instead.

The three-dot button opens the Show sheet directly. The reference menu
also lists Countdown, Calculation Settings, Mute and Share; none is
built, and a menu with one live entry and four dead ones is worse than
no menu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Hand over for a device check**

Tell the user:

> Done. This needs `npx cap sync android` and a build. Worth checking on the device: the compass needle against a real compass (and that it survives leaving and re-entering the page), the Show sheet's toggles surviving an app restart, hiding a time and confirming the widget drops it too, and the hardware back button closing the sheet rather than leaving the page.

---

## Self-Review

**Spec coverage.** Every section maps to a task: the declination correction and bearing (Task 1), the visible-times store with the obligatory guarantee (Task 2), the plugin surface and the widget honouring the set (Task 3), the sensor with its timeout fallback (Task 4), the Show sheet including the disabled obligatory rows (Task 5), the compass view with its three sensor states (Task 6), the segmented control, layout restyle, dashed separator, three-dot menu and the More card deep link (Task 7). The spec's out-of-scope list — moon dial, location name, per-prayer mute, calendar, Agenda, Imsak, manual adjustments, map view, iOS — appears in no task.

**Placeholder scan.** No "TBD", "TODO", or "handle edge cases". Tasks 5, 6 and 7 describe markup and CSS in prose rather than complete code, which is deliberate: they must match existing components the implementer is told to read first, and transcribing a guess at those files would be worse than pointing at the real ones. Every behavioural requirement in them is concrete and checkable.

**Type consistency.** `QiblaEngine.bearing/declination/magneticBearing` (Task 1) match the plugin's `getQibla` payload (Task 3) and `QiblaDirection` (Task 4). `PrayerConfig.visibleTimes`/`setVisibleTimes`/`sanitiseVisibleTimes`/`OBLIGATORY_TIMES`/`DEFAULT_VISIBLE_TIMES` (Task 2) are used under those exact names in Tasks 3, 4 and 5. `getVisibleTimes`/`setVisibleTimes` on the TS service (Task 4) are consumed under those names in Tasks 5 and 7. `HEADING_TIMEOUT_MS` is defined and exported in Task 4 and referenced by its test in the same task. `VIEW_IDS` changes shape in Task 3 and both its tests are updated in the same task, so no later task reads the old `Triple` form.

**One known risk, stated rather than hidden.** Task 3 changes `PrayerWidgetProvider`'s slot semantics, which is working code from a previous branch. The two replacement tests cover the geometry and id-uniqueness, but the render zip itself has no unit test — `RemoteViews` needs instrumentation. The device check in Task 7 Step 9 explicitly asks the user to confirm a hidden time disappears from the widget.
