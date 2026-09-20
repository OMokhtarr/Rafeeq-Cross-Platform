# Unified Prayer Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the qibla compass into the prayer-times scroll as a header, add a cached place name resolved at fix time, and add a location button that distinguishes a denied permission from disabled location services.

**Architecture:** The compass stops being a route-level alternative and becomes the page's header, so the segmented control is deleted. The place name is resolved once by Android's `Geocoder` when coordinates are stored and cached in `SharedPreferences` — never fetched on render, because `Geocoder` is a network call. Turn-instruction and marker geometry are extracted as pure functions in a new `qibla.geometry.ts` so they can be unit-tested without a sensor.

**Tech Stack:** Kotlin (Capacitor 8 plugin, JUnit 4 — **no Robolectric**), React + Ionic, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-09-21-prayer-page-unified-layout-design.md`

## Global Constraints

- Branch: `prayer-page-layout`, off `qibla-and-show`. Do not merge or push.
- **Never** add `// eslint-disable` comments of any kind, including `react-hooks/exhaustive-deps`.
- **Never** add visible scrollbars, or CSS that would reveal them. `src/index.css` hides them globally; component CSS must not re-enable them.
- Page/view containers cap width at `var(--max-width-mobile, 600px)` and centre with `margin: 0 auto`. **Never** hard-code `600px` or any pixel page width.
- Any container scrolling inside `IonContent` on a page with a fixed `BottomNavBar` must carry `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`. Do **not** use a trailing spacer `<div>`.
- Use existing design tokens only (`--color-gold`, `--color-gold-faint`, `--color-gold-subtle`, `--color-bg-card`, `--color-bg-card-alt`, `--color-border-card`, `--color-border-subtle`, `--space-*`, `--text-*`, `--radius-*`). No new colour literals.
- Arabic text uses `var(--font-arabic)`; every Arabic rule needs a matching `[dir="ltr"]` rule setting `var(--font-latin)`.
- Every new string is added to **both** locales in `src/app/core/i18n/strings.ts` (the `ar` block near line 514, the `en` block near line 997) **and** to the `prayerTimes` interface (near line 41). All three or the build fails.
- Every new `prayer-times.service.ts` / `qibla.service.ts` export is guarded by `const isNative = Capacitor.isNativePlatform();` and returns a designed fallback on web — never lets a bridge error escape.
- Kotlin unit tests are plain JUnit with **no `Context`**. Anything touching `SharedPreferences` or `Geocoder` cannot be unit-tested; keep logic pure and test the pure part.
- Do **not** run `npm run build`, `npx cap sync`, or any gradle assemble. The user builds. Running `npm test`, `npx tsc --noEmit`, and `gradlew testDebugUnitTest` is expected and required.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

**Native (Kotlin)**
- `PrayerConfig.kt` — *modify*: add `placeName` / `setPlaceName`, and clear the name inside `setCoords`.
- `PlaceNameResolver.kt` — *create*: pure `pick(...)` field-priority selection + the `Geocoder` call, kept separate so `pick` is unit-testable.
- `RafeeqPrayerPlugin.kt` — *modify*: resolve the name on a worker thread in `setLocation`; add `getPlace()` and `locationServicesEnabled()`.

**Web (services)**
- `prayer-times.service.ts` — *modify*: widen `requestLocation` to a result object; add `getPlace`, `locationServicesEnabled`.
- `qibla.geometry.ts` — *create*: pure `turnInstruction()` and `markerRotation()`. No React, no sensor, no plugin.

**Web (UI)**
- `QiblaView.tsx` → renamed `QiblaHeader.tsx` (+ `.css`) — the ring, Kaaba marker, turn label; permission prompt removed.
- `PrayerTimes.tsx` / `.css` — *modify*: delete the segmented control, render the header unconditionally, add the place row and location button.
- `More.tsx` — *modify*: the القبلة card's route.
- `strings.ts` — *modify*: new keys in both locales.

**Tests**
- `PlaceNameResolverTest.kt`, `PrayerConfigTest.kt` — *create/modify*.
- `qibla.geometry.test.ts` — *create*.
- `prayer-times.service.test.ts`, `prayer-times.service.web.test.ts` — *modify*.

---

### Task 1: Place-name selection and storage (native)

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PlaceNameResolver.kt`
- Create: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PlaceNameResolverTest.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt`

**Interfaces:**
- Consumes: `PrayerConfig.setCoords(ctx, lat, lng)`, `PrayerConfig.PREFS_NAME`.
- Produces:
  - `PlaceNameResolver.pick(locality: String?, subAdminArea: String?, adminArea: String?, countryName: String?): String?`
  - `PlaceNameResolver.resolve(ctx: Context, lat: Double, lng: Double, locale: Locale): String?`
  - `PrayerConfig.placeName(ctx: Context): String?`
  - `PrayerConfig.setPlaceName(ctx: Context, name: String?)`

**Why `pick` is separate:** `Geocoder` needs a `Context` and a network, so it cannot be unit-tested here (JUnit only, no Robolectric). The field-priority decision is the part with actual logic, so it is extracted as a pure function and tested exhaustively.

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/rafeeq/quranquiz/prayer/PlaceNameResolverTest.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Only `pick` is covered: the Geocoder call itself needs a Context and a
 * network, neither of which a JVM unit test has. The field-priority choice is
 * where the judgement lives, so that is what is pinned here.
 */
class PlaceNameResolverTest {

    @Test
    fun `prefers the locality, which is the city a user recognises`() {
        assertEquals(
            "Cairo",
            PlaceNameResolver.pick("Cairo", "Cairo Governorate", "Cairo", "Egypt"),
        )
    }

    @Test
    fun `falls back through sub-admin, admin, then country`() {
        assertEquals(
            "Cairo Governorate",
            PlaceNameResolver.pick(null, "Cairo Governorate", "Cairo", "Egypt"),
        )
        assertEquals("Cairo", PlaceNameResolver.pick(null, null, "Cairo", "Egypt"))
        assertEquals("Egypt", PlaceNameResolver.pick(null, null, null, "Egypt"))
    }

    @Test
    fun `treats a blank field as absent rather than showing an empty header`() {
        // Some geocoder backends return "" instead of null; a header reading
        // "" would look like a rendering bug to a user.
        assertEquals("Egypt", PlaceNameResolver.pick("", "   ", null, "Egypt"))
    }

    @Test
    fun `yields null when nothing is known, so the caller can fall back`() {
        assertNull(PlaceNameResolver.pick(null, null, null, null))
    }

    @Test
    fun `trims surrounding whitespace so layout is not thrown off`() {
        assertEquals("Cairo", PlaceNameResolver.pick("  Cairo  ", null, null, null))
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*PlaceNameResolverTest*"`
Expected: FAIL — `Unresolved reference: PlaceNameResolver`.

- [ ] **Step 3: Write the resolver**

Create `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PlaceNameResolver.kt`:

```kotlin
package com.rafeeq.quranquiz.prayer

import android.content.Context
import android.location.Geocoder
import android.util.Log
import java.util.Locale

/**
 * The human name for a set of coordinates.
 *
 * Android's Geocoder performs a NETWORK lookup — it returns an empty list
 * offline, and Geocoder.isPresent() is false where no backend exists at all.
 * So this is called once, when a location fix is stored, and the answer is
 * cached in PrayerConfig. It is never called to render a frame.
 *
 * The name is decoration on coordinates: the compass and the times are driven
 * entirely by lat/lng, and every failure here resolves to null, which the page
 * renders as its own title.
 */
object PlaceNameResolver {

    private const val TAG = "RafeeqPrayer"

    /**
     * The most human of the fields an Address carries, in descending
     * specificity. Blank strings count as absent: some backends return "".
     */
    fun pick(
        locality: String?,
        subAdminArea: String?,
        adminArea: String?,
        countryName: String?,
    ): String? =
        listOf(locality, subAdminArea, adminArea, countryName)
            .firstOrNull { !it.isNullOrBlank() }
            ?.trim()

    /**
     * Blocking network call — callers must be on a worker thread.
     * Returns null on any failure, which is a normal offline outcome.
     */
    @Suppress("DEPRECATION")
    fun resolve(ctx: Context, lat: Double, lng: Double, locale: Locale): String? {
        if (!Geocoder.isPresent()) return null
        return try {
            val addresses = Geocoder(ctx, locale).getFromLocation(lat, lng, 1)
            val a = addresses?.firstOrNull() ?: return null
            pick(a.locality, a.subAdminArea, a.adminArea, a.countryName)
        } catch (e: Exception) {
            // Offline, no backend, or a malformed response. All the same here:
            // the header simply falls back to the page title.
            Log.w(TAG, "reverse geocoding failed", e)
            null
        }
    }
}
```

> **Note on the deprecation:** the `getFromLocation(double, double, int)` overload is deprecated from API 33 in favour of an async callback form, but it remains functional and is the only form available at our `minSdk` of 26. `@Suppress("DEPRECATION")` on the function is deliberate — it is the correct call for this floor, and it already runs on a worker thread.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*PlaceNameResolverTest*"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add storage to `PrayerConfig`**

In `PrayerConfig.kt`, add the key beside `KEY_MADHAB`:

```kotlin
    private const val KEY_PLACE_NAME = "place_name"
```

Add these functions after `setCoords`:

```kotlin
    /** The cached human name for the stored coordinates, if one resolved. */
    fun placeName(ctx: Context): String? =
        prefs(ctx).getString(KEY_PLACE_NAME, null)

    fun setPlaceName(ctx: Context, name: String?) {
        val e = prefs(ctx).edit()
        if (name.isNullOrBlank()) e.remove(KEY_PLACE_NAME) else e.putString(KEY_PLACE_NAME, name)
        e.apply()
    }
```

- [ ] **Step 6: Make `setCoords` clear the stale name**

Replace the body of `setCoords` with:

```kotlin
    fun setCoords(ctx: Context, lat: Double, lng: Double) {
        prefs(ctx).edit()
            .putLong(KEY_LAT, lat.toRawBits())
            .putLong(KEY_LNG, lng.toRawBits())
            // A name belongs to the coordinates it was resolved for. Dropping
            // it here means a user who travels and re-fixes can never be shown
            // the city they left, even if the new lookup fails.
            .remove(KEY_PLACE_NAME)
            .apply()
    }
```

- [ ] **Step 7: Run the whole native suite**

Run: `cd android && ./gradlew testDebugUnitTest`
Expected: PASS, no regressions (previously 40 tests; now 45).

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/PlaceNameResolver.kt android/app/src/test/java/com/rafeeq/quranquiz/prayer/PlaceNameResolverTest.kt android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt
git commit -m "add place-name resolution and cache it against the coordinates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Plugin surface — resolve on fix, expose place and services state

**Files:**
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt`

**Interfaces:**
- Consumes: `PlaceNameResolver.resolve(ctx, lat, lng, locale)`, `PrayerConfig.setPlaceName`, `PrayerConfig.placeName`.
- Produces (JS-visible):
  - `getPlace(): Promise<{ name: string | null }>`
  - `locationServicesEnabled(): Promise<{ enabled: boolean }>`
  - `setLocation({lat, lng})` — unchanged signature, now also resolves the name.

**No test step:** every function here needs a live `Context`, a `LocationManager` and a network. JUnit without Robolectric cannot construct any of them. The logic worth testing was extracted into `PlaceNameResolver.pick` in Task 1; what remains is bridge plumbing, verified on device.

- [ ] **Step 1: Add the imports**

At the top of `RafeeqPrayerPlugin.kt`, alongside the existing imports:

```kotlin
import android.content.Context
import android.location.LocationManager
```

- [ ] **Step 2: Resolve the name when a fix is stored**

Replace the body of `setLocation` with:

```kotlin
    @PluginMethod
    fun setLocation(call: PluginCall) {
        val lat = call.getDouble("lat")
        val lng = call.getDouble("lng")
        if (lat == null || lng == null) {
            call.reject("lat and lng are required")
            return
        }
        // Coordinates first and synchronously: they drive the times, the
        // compass and the widget. This also clears any previously cached name.
        PrayerConfig.setCoords(context, lat, lng)
        PrayerAlarmScheduler.scheduleMidnightRoll(context)
        PrayerWidgetProvider.refresh(context)

        // The name is best-effort decoration, and Geocoder blocks on the
        // network — so it never delays the call the page is awaiting.
        val ctx = context
        val locale = Locale.getDefault()
        Thread {
            val name = PlaceNameResolver.resolve(ctx, lat, lng, locale)
            if (name != null) PrayerConfig.setPlaceName(ctx, name)
        }.start()

        call.resolve()
    }
```

> The call resolves immediately; the page fetches the name separately via `getPlace()` once its reload completes. A name that arrives after that render appears on the next page entry, which is the correct trade — a spinner on the whole page for a decorative label would be worse.

- [ ] **Step 3: Add `getPlace` and `locationServicesEnabled`**

Insert both after `getQibla`:

```kotlin
    /**
     * The cached place name, or null. Never triggers a lookup: the name is
     * resolved when a fix is stored, because Geocoder is a network call.
     */
    @PluginMethod
    fun getPlace(call: PluginCall) {
        val result = JSObject()
        result.put("name", PrayerConfig.placeName(context))
        call.resolve(result)
    }

    /**
     * Whether the device's location services are switched on.
     *
     * This is a different question from whether the app holds the permission,
     * and it has a different remedy: a user who has granted the permission but
     * disabled GPS cannot fix anything by being asked to grant it again.
     */
    @PluginMethod
    fun locationServicesEnabled(call: PluginCall) {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val enabled = lm != null && (
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            )
        val result = JSObject()
        result.put("enabled", enabled)
        call.resolve(result)
    }
```

- [ ] **Step 4: Update the plugin's header comment**

In the `JS → Native:` block near the top, add these two lines after the `getQibla()` line:

```
 *   getPlace()                           — cached place name for the stored location, or null
 *   locationServicesEnabled()            — whether device location services are on
```

- [ ] **Step 5: Verify it compiles**

Run: `cd android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Run the native suite**

Run: `cd android && ./gradlew testDebugUnitTest`
Expected: PASS, 45 tests, no regressions.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt
git commit -m "resolve the place name on a fix and expose location-services state

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Compass geometry as pure functions

**Files:**
- Create: `src/app/core/services/prayer/qibla.geometry.ts`
- Create: `src/app/core/services/prayer/__tests__/qibla.geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const FACING_TOLERANCE_DEG = 5;`
  - `export type TurnDirection = "left" | "right" | "facing";`
  - `export function signedDelta(bearing: number, heading: number): number` — degrees to turn, `-180 < d <= 180`; negative means left.
  - `export function turnInstruction(bearing: number, heading: number): TurnDirection`
  - `export function markerRotation(bearing: number, heading: number): number` — degrees, `0 <= r < 360`.

**Why this file exists:** the 0/360 wrap is the bug that makes compasses send users the long way round, and it is invisible in manual testing (it only bites near north). Pure functions make it a unit test instead of a device hunt.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/prayer/__tests__/qibla.geometry.test.ts`:

```typescript
import {
  FACING_TOLERANCE_DEG,
  markerRotation,
  signedDelta,
  turnInstruction,
} from "../qibla.geometry";

describe("signedDelta", () => {
  it("is positive when the target is clockwise of the heading", () => {
    expect(signedDelta(90, 45)).toBe(45);
  });

  it("is negative when the target is anticlockwise", () => {
    expect(signedDelta(45, 90)).toBe(-45);
  });

  // The wrap is the whole reason this function exists: a naive subtraction
  // gives -350 here and would send the user almost all the way round.
  it("takes the short way across north", () => {
    expect(signedDelta(5, 355)).toBe(10);
    expect(signedDelta(355, 5)).toBe(-10);
  });

  it("never exceeds half a turn in either direction", () => {
    for (let b = 0; b < 360; b += 7) {
      for (let h = 0; h < 360; h += 11) {
        const d = signedDelta(b, h);
        expect(d).toBeGreaterThan(-180.0001);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });

  it("handles headings outside 0-360 rather than producing nonsense", () => {
    expect(signedDelta(10, 370)).toBe(0);
  });
});

describe("turnInstruction", () => {
  it("says facing inside the tolerance band", () => {
    expect(turnInstruction(100, 100)).toBe("facing");
    expect(turnInstruction(100, 100 + FACING_TOLERANCE_DEG - 1)).toBe("facing");
    expect(turnInstruction(100, 100 - FACING_TOLERANCE_DEG + 1)).toBe("facing");
  });

  it("says right when the qibla is clockwise of where the user points", () => {
    expect(turnInstruction(180, 90)).toBe("right");
  });

  it("says left when it is anticlockwise", () => {
    expect(turnInstruction(90, 180)).toBe("left");
  });

  it("still resolves at exactly the tolerance edge", () => {
    // A gap between "facing" and a turn would leave the label blank.
    expect(turnInstruction(100, 100 - FACING_TOLERANCE_DEG)).toBe("right");
    expect(turnInstruction(100, 100 + FACING_TOLERANCE_DEG)).toBe("left");
  });
});

describe("markerRotation", () => {
  it("puts the marker at the top when the user faces the qibla", () => {
    expect(markerRotation(136, 136)).toBe(0);
  });

  it("offsets the marker by the difference as the user turns", () => {
    expect(markerRotation(136, 46)).toBe(90);
  });

  it("normalises into a single turn rather than going negative", () => {
    expect(markerRotation(10, 100)).toBe(280);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/app/core/services/prayer/__tests__/qibla.geometry.test.ts`
Expected: FAIL — cannot find module `../qibla.geometry`.

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/prayer/qibla.geometry.ts`:

```typescript
/**
 * QIBLA GEOMETRY
 * Pure angle arithmetic for the compass. No React, no sensor, no plugin —
 * which is what makes the 0/360 wrap testable rather than something you only
 * discover standing in a car park facing north.
 */

/**
 * How close to the qibla counts as facing it, in degrees either side.
 *
 * This is a hysteresis band, not a precision claim: a magnetometer jitters by
 * a couple of degrees at rest, and without a band the label would flicker
 * between "left" and "right" while the phone sits still on a table.
 */
export const FACING_TOLERANCE_DEG = 5;

export type TurnDirection = "left" | "right" | "facing";

/** Normalise any angle into [0, 360). */
function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Degrees from the heading to the bearing, taking the shorter way round:
 * (-180, 180], positive clockwise.
 */
export function signedDelta(bearing: number, heading: number): number {
  const raw = normalise(bearing - heading);
  return raw > 180 ? raw - 360 : raw;
}

/** Which way to turn to face the qibla, or that the user already does. */
export function turnInstruction(
  bearing: number,
  heading: number,
): TurnDirection {
  const delta = signedDelta(bearing, heading);
  if (Math.abs(delta) < FACING_TOLERANCE_DEG) return "facing";
  return delta > 0 ? "right" : "left";
}

/**
 * Where to place the Kaaba marker on the ring, in degrees clockwise from the
 * top. The ring is fixed to the device, so the marker carries the whole
 * bearing-minus-heading offset and converges with the needle as the user turns.
 */
export function markerRotation(bearing: number, heading: number): number {
  return normalise(bearing - heading);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/core/services/prayer/__tests__/qibla.geometry.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/prayer/qibla.geometry.ts src/app/core/services/prayer/__tests__/qibla.geometry.test.ts
git commit -m "add pure compass geometry with the 0/360 wrap pinned by tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Service surface — place, services state, and a reason for failure

**Files:**
- Modify: `src/app/core/services/prayer/prayer-times.service.ts`
- Modify: `src/app/core/services/prayer/__tests__/prayer-times.service.test.ts`
- Modify: `src/app/core/services/prayer/__tests__/prayer-times.service.web.test.ts`

**Interfaces:**
- Consumes: plugin methods `getPlace()`, `locationServicesEnabled()` from Task 2.
- Produces:
  - `export type LocationOutcome = "granted" | "denied" | "services-off" | "failed";`
  - `export async function requestLocation(): Promise<LocationOutcome>` — **breaking change**, was `Promise<boolean>`.
  - `export async function getPlace(): Promise<string | null>`
  - `export async function locationServicesEnabled(): Promise<boolean>`

**Breaking change, deliberate:** `requestLocation` returned a bare `boolean`, so the page could not tell a denied permission from disabled GPS — the exact distinction the spec requires. The only caller is `PrayerTimes.tsx`, updated in Task 6.

- [ ] **Step 1: Write the failing tests**

In `prayer-times.service.test.ts`, append:

```typescript
describe("requestLocation outcomes", () => {
  it("reports denied when the user refuses the permission", async () => {
    Geolocation.checkPermissions.mockResolvedValue({ location: "prompt" });
    Geolocation.requestPermissions.mockResolvedValue({ location: "denied" });

    await expect(service.requestLocation()).resolves.toBe("denied");
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("reports services-off when the fix fails and location is switched off", async () => {
    // The distinction that matters: the permission is held, so telling the
    // user to grant it would be a dead end.
    Geolocation.checkPermissions.mockResolvedValue({ location: "granted" });
    Geolocation.getCurrentPosition.mockRejectedValue(new Error("location unavailable"));
    plugin.locationServicesEnabled.mockResolvedValue({ enabled: false });

    await expect(service.requestLocation()).resolves.toBe("services-off");
  });

  it("reports failed when the fix fails but location is on", async () => {
    Geolocation.checkPermissions.mockResolvedValue({ location: "granted" });
    Geolocation.getCurrentPosition.mockRejectedValue(new Error("timeout"));
    plugin.locationServicesEnabled.mockResolvedValue({ enabled: true });

    await expect(service.requestLocation()).resolves.toBe("failed");
  });

  it("reports granted and stores the fix", async () => {
    Geolocation.checkPermissions.mockResolvedValue({ location: "granted" });
    Geolocation.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    await expect(service.requestLocation()).resolves.toBe("granted");
    expect(plugin.setLocation).toHaveBeenCalledWith({
      lat: 30.0444,
      lng: 31.2357,
    });
  });
});

describe("getPlace", () => {
  it("returns the cached name", async () => {
    plugin.getPlace.mockResolvedValue({ name: "Cairo" });
    await expect(service.getPlace()).resolves.toBe("Cairo");
  });

  it("returns null when none has resolved, so the page can use its title", async () => {
    plugin.getPlace.mockResolvedValue({ name: null });
    await expect(service.getPlace()).resolves.toBeNull();
  });

  it("returns null rather than propagating a bridge failure", async () => {
    plugin.getPlace.mockRejectedValue(new Error("bridge"));
    await expect(service.getPlace()).resolves.toBeNull();
  });
});
```

In the same file, extend the plugin mock factory to include the new methods — add `getPlace: jest.fn(),` and `locationServicesEnabled: jest.fn(),` to the object inside the `jest.mock("@capacitor/core", ...)` factory, and add matching `getPlace: jest.Mock;` / `locationServicesEnabled: jest.Mock;` entries to the `const plugin = registerPlugin(...) as unknown as {...}` type assertion.

> **Mock hoisting:** `babel-plugin-jest-hoist@27.5.1` only lets a `jest.mock` factory reference outer identifiers prefixed with `mock`. Build the object **inside** the factory, exactly as the existing files do — do not lift it to a `const` above.

In `prayer-times.service.web.test.ts`, append:

```typescript
describe("place and location services on web", () => {
  it("has no place name without a plugin to cache one", async () => {
    await expect(service.getPlace()).resolves.toBeNull();
    expect(plugin.getPlace).not.toHaveBeenCalled();
  });

  it("reports location services as off rather than guessing", async () => {
    await expect(service.locationServicesEnabled()).resolves.toBe(false);
    expect(plugin.locationServicesEnabled).not.toHaveBeenCalled();
  });

  it("reports requestLocation as failed, since there is nowhere to store a fix", async () => {
    await expect(service.requestLocation()).resolves.toBe("failed");
    expect(Geolocation.checkPermissions).not.toHaveBeenCalled();
  });
});
```

Also in the web test file: add `getPlace: jest.fn(),` and `locationServicesEnabled: jest.fn(),` to the factory object and the type assertion, and **replace** the existing assertion `expect(ok).toBe(false);` in the test named `"declines to request a location it could not store anywhere"` with `expect(ok).toBe("failed");`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/app/core/services/prayer/__tests__/prayer-times.service`
Expected: FAIL — `service.getPlace is not a function`, and the outcome assertions fail against `false`/`true`.

- [ ] **Step 3: Extend the plugin interface**

In `prayer-times.service.ts`, add to `interface RafeeqPrayerPlugin`:

```typescript
  getPlace(): Promise<{ name: string | null }>;
  locationServicesEnabled(): Promise<{ enabled: boolean }>;
```

- [ ] **Step 4: Rewrite `requestLocation`**

Replace the whole `requestLocation` function and its doc comment with:

```typescript
/**
 * Why a location attempt ended. A bare boolean could not distinguish a
 * refused permission from switched-off location services, and those have
 * different remedies — asking a user to grant a permission they already hold
 * is a dead end.
 */
export type LocationOutcome = "granted" | "denied" | "services-off" | "failed";

/**
 * Acquire a coarse fix and hand it to the native side.
 *
 * Never throws: every failure is a state the page renders as a message.
 */
export async function requestLocation(): Promise<LocationOutcome> {
  // Nothing to store a fix into off-device, and no way to tell why — so this
  // is "failed" rather than a more specific claim it cannot support.
  if (!isNative) return "failed";

  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions({
        permissions: ["coarseLocation"],
      });
    }
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      return "denied";
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
    });
    await RafeeqPrayer.setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    return "granted";
  } catch {
    // The permission is held by this point, so a failure here is either the
    // device's location services being off or a fix that did not arrive.
    const on = await locationServicesEnabled();
    return on ? "failed" : "services-off";
  }
}
```

- [ ] **Step 5: Add `getPlace` and `locationServicesEnabled`**

Append to `prayer-times.service.ts`:

```typescript
/**
 * The cached name for the stored location, or null.
 *
 * Resolved natively when a fix is taken, because Android's Geocoder is a
 * network call — so this is a read from storage, not a lookup, and works
 * offline. Null is a normal outcome (offline fix, no geocoder backend, or
 * coordinates with no named place), which the page renders as its own title.
 */
export async function getPlace(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const { name } = await RafeeqPrayer.getPlace();
    return name ?? null;
  } catch {
    return null;
  }
}

/** Whether the device's location services are switched on. */
export async function locationServicesEnabled(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { enabled } = await RafeeqPrayer.locationServicesEnabled();
    return enabled;
  } catch {
    return false;
  }
}
```

> Define `locationServicesEnabled` **above** `requestLocation` in the file, or rely on function hoisting — `requestLocation`'s catch block calls it. Function declarations hoist, so either order compiles; put it above for readability.

- [ ] **Step 6: Run the tests**

Run: `npx jest src/app/core/services/prayer/`
Expected: PASS — all prayer service suites green.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: one error in `src/app/features/prayer-times/PrayerTimes.tsx` — `if (!ok)` on a `LocationOutcome`. **This is expected**; Task 6 fixes the caller. Record it and continue.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/services/prayer/prayer-times.service.ts src/app/core/services/prayer/__tests__/
git commit -m "widen requestLocation to report why it failed, and expose the place name

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Strings

**Files:**
- Modify: `src/app/core/i18n/strings.ts`

**Interfaces:**
- Produces: `t.prayerTimes.turnLeft`, `.turnRight`, `.facingQibla`, `.updateLocation`, `.locationServicesOff`, `.locationServicesOffDesc`, `.locating`.

**All three places or the build fails:** the interface (near line 41), the `ar` values (near line 514), the `en` values (near line 997).

- [ ] **Step 1: Add to the interface**

In the `prayerTimes` interface block, after `prayersTab: string;`:

```typescript
    /** Compass turn guidance — shown only when a heading is available. */
    turnLeft: string;
    turnRight: string;
    facingQibla: string;
    /** The location button and its failure states. */
    updateLocation: string;
    locating: string;
    locationServicesOff: string;
    locationServicesOffDesc: string;
```

- [ ] **Step 2: Add the Arabic values**

In the `ar` `prayerTimes` block, after `prayersTab: "الصلوات",`:

```typescript
    turnLeft: "استدر يساراً",
    turnRight: "استدر يميناً",
    facingQibla: "أنت تواجه القبلة",
    updateLocation: "تحديث الموقع",
    locating: "جارٍ تحديد الموقع…",
    locationServicesOff: "خدمات الموقع متوقفة",
    locationServicesOffDesc: "شغّل خدمات الموقع في إعدادات الجهاز ثم حاول مرة أخرى.",
```

- [ ] **Step 3: Add the English values**

In the `en` `prayerTimes` block, after `prayersTab: "Prayers",`:

```typescript
    turnLeft: "Turn left",
    turnRight: "Turn right",
    facingQibla: "Facing the qibla",
    updateLocation: "Update location",
    locating: "Finding your location…",
    locationServicesOff: "Location services are off",
    locationServicesOffDesc: "Turn on location in your device settings, then try again.",
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: the same single pre-existing `PrayerTimes.tsx` error from Task 4, and **no** new "missing property" errors — which is what proves all three blocks agree.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/i18n/strings.ts
git commit -m "add strings for turn guidance and the location button

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The compass header

**Files:**
- Create: `src/app/features/prayer-times/QiblaHeader.tsx`
- Create: `src/app/features/prayer-times/QiblaHeader.css`
- Delete: `src/app/features/prayer-times/QiblaView.tsx`
- Delete: `src/app/features/prayer-times/QiblaView.css`

**Interfaces:**
- Consumes: `loadQibla`, `watchHeading`, `QiblaDirection`, `HeadingReading` from `qibla.service`; `markerRotation`, `turnInstruction` from Task 3.
- Produces: `interface QiblaHeaderProps { placeName: string | null; onUpdateLocation: () => void; locating: boolean; }` and `const QiblaHeader: React.FC<QiblaHeaderProps>` (default export).

**What changes from `QiblaView`:** the standalone permission prompt is removed (the page owns that state now — two prompts for one permission on one screen is a bug), and the Kaaba marker and turn label are added. The sensor lifecycle, calibration hint and no-sensor fallback survive unchanged.

- [ ] **Step 1: Create the component**

Create `src/app/features/prayer-times/QiblaHeader.tsx`:

```tsx
/**
 * QIBLA HEADER
 * The top of the prayer page: place name, location button, compass ring, and
 * the date. Renders inside the page's own container — it owns no page chrome.
 *
 * The ring is fixed to the device; the needle and the Kaaba marker rotate
 * inside it, converging as the user turns. That convergence is what makes the
 * dial readable at a glance rather than two numbers to compare.
 *
 * Everything heading-dependent (needle, marker, turn label) disappears when no
 * magnetometer is present, but the ring does not: the page's shape should not
 * change with the hardware, and the numeric bearing is a complete answer on
 * its own.
 */

import React, { useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import {
  loadQibla,
  watchHeading,
  type QiblaDirection,
} from "../../core/services/prayer/qibla.service";
import {
  markerRotation,
  turnInstruction,
} from "../../core/services/prayer/qibla.geometry";
import "./QiblaHeader.css";

interface QiblaHeaderProps {
  placeName: string | null;
  onUpdateLocation: () => void;
  locating: boolean;
}

const QiblaHeader: React.FC<QiblaHeaderProps> = ({
  placeName,
  onUpdateLocation,
  locating,
}) => {
  const { t, lang } = useLang();
  const tp = t.prayerTimes;

  const [direction, setDirection] = useState<QiblaDirection | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorUnavailable, setSensorUnavailable] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadQibla().then((q) => {
      if (!cancelled) setDirection(q);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasBearing = direction?.hasLocation === true;

  useEffect(() => {
    if (!hasBearing) return undefined;

    setSensorUnavailable(false);
    setNeedsCalibration(false);

    const stop = watchHeading(
      (reading) => {
        setHeading(reading.heading);
        setNeedsCalibration(!reading.absolute);
      },
      () => setSensorUnavailable(true),
    );

    return stop;
  }, [hasBearing]);

  const hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const gregorianDate = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-EG" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date());

  const bearing = direction?.bearing ?? 0;
  const magneticBearing = direction?.magneticBearing ?? 0;
  const showNeedle = hasBearing && !sensorUnavailable && heading !== null;

  const needleRotation = magneticBearing - (heading ?? 0);
  const marker = markerRotation(magneticBearing, heading ?? 0);
  const turn = showNeedle ? turnInstruction(magneticBearing, heading ?? 0) : null;
  const turnLabel =
    turn === "facing"
      ? tp.facingQibla
      : turn === "left"
      ? tp.turnLeft
      : turn === "right"
      ? tp.turnRight
      : null;

  return (
    <header className="qh-header">
      <div className="qh-place-row">
        <h1 className="qh-place">{placeName ?? tp.title}</h1>
        <button
          type="button"
          className="qh-location-btn"
          onClick={onUpdateLocation}
          disabled={locating}
          aria-label={tp.updateLocation}
        >
          {locating ? (
            <span className="qh-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="qh-dial">
        <div className="qh-dial-ring">
          {hasBearing && (
            <div
              className="qh-marker"
              style={{ transform: `rotate(${marker}deg)` }}
              aria-hidden="true"
            >
              <span className="qh-marker-dot" />
            </div>
          )}
          {showNeedle && (
            <div
              className="qh-needle"
              style={{ transform: `rotate(${needleRotation}deg)` }}
              aria-hidden="true"
            >
              <span className="qh-needle-tip" />
            </div>
          )}
          <span className="qh-dial-center" aria-hidden="true" />
          {!showNeedle && hasBearing && (
            <span className="qh-dial-bearing">
              {tp.qiblaFromNorth.replace("{deg}", String(Math.round(bearing)))}
            </span>
          )}
        </div>
      </div>

      {turnLabel && (
        <p
          className={
            "qh-turn" + (turn === "facing" ? " qh-turn--facing" : "")
          }
          aria-live="polite"
        >
          {turnLabel}
        </p>
      )}

      {sensorUnavailable && <p className="qh-hint">{tp.qiblaNoSensor}</p>}
      {showNeedle && needsCalibration && (
        <p className="qh-hint">{tp.qiblaCalibrate}</p>
      )}

      <div className="qh-dates">
        <p className="qh-date-greg">{gregorianDate}</p>
        <p className="qh-date-hijri">{hijriDate}</p>
      </div>
    </header>
  );
};

export default QiblaHeader;
```

- [ ] **Step 2: Create the stylesheet**

Create `src/app/features/prayer-times/QiblaHeader.css`:

```css
/* ═══════════════════════════════════════════════
   QIBLA HEADER
   The gradient band at the top of the prayer page. The ring is fixed to the
   device; only the needle and the Kaaba marker rotate inside it.
   ═══════════════════════════════════════════════ */

.qh-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: max(var(--space-5), var(--safe-inset-top)) var(--space-4)
    calc(var(--space-6) + var(--space-5));
  background: linear-gradient(
    180deg,
    var(--color-gold-faint) 0%,
    var(--color-bg-card-alt) 100%
  );
}

/* ── Place name and location button ──────────── */

.qh-place-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
}

.qh-place {
  font-family: var(--font-arabic);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.5;
  /* A long place name must not push the button off the row. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[dir="ltr"] .qh-place {
  font-family: var(--font-latin);
}

.qh-location-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--color-gold);
  background: none;
  border: none;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--transition-fast);
}

.qh-location-btn svg {
  width: 20px;
  height: 20px;
}

.qh-location-btn:active {
  background: var(--color-gold-faint);
}

.qh-location-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.qh-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-gold-subtle);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: qh-spin 0.8s linear infinite;
}

@keyframes qh-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Dial ────────────────────────────────────── */

.qh-dial {
  width: 100%;
  max-width: 220px;
  aspect-ratio: 1 / 1;
  margin: var(--space-4) 0 0;
}

.qh-dial-ring {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  border: 2px solid var(--color-gold-subtle);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-card);
}

.qh-dial-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-gold);
  transform: translate(-50%, -50%);
}

/* The numeric bearing, shown inside the ring only where there is no needle
   to point with. */
.qh-dial-bearing {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-arabic);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

[dir="ltr"] .qh-dial-bearing {
  font-family: var(--font-latin);
}

/* ── Kaaba marker ─────────────────────────────
   A full-height box rotated about the ring's centre, with the dot pinned at
   its top edge — so rotation carries the dot around the circumference. */

.qh-marker {
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 100%;
  transform-origin: center center;
  transition: transform var(--transition-base, 0.2s ease-out);
}

.qh-marker-dot {
  position: absolute;
  top: -7px;
  left: 50%;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border-radius: 50%;
  background: var(--color-gold);
  border: 2px solid var(--color-bg-card);
  box-sizing: border-box;
}

/* ── Needle ──────────────────────────────────── */

.qh-needle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 40%;
  transform-origin: bottom center;
  margin-left: -2px;
  margin-top: -40%;
  transition: transform var(--transition-base, 0.2s ease-out);
}

.qh-needle-tip {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--color-gold);
  border-radius: var(--radius-full, 9999px);
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
}

/* ── Turn guidance ───────────────────────────── */

.qh-turn {
  font-family: var(--font-arabic);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-gold);
  margin: var(--space-4) 0 0;
  line-height: 1.5;
}

[dir="ltr"] .qh-turn {
  font-family: var(--font-latin);
}

.qh-turn--facing {
  color: var(--color-text-primary);
}

/* ── Hints ───────────────────────────────────── */

.qh-hint {
  font-family: var(--font-arabic);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
  margin: var(--space-3) 0 0;
  max-width: 320px;
}

[dir="ltr"] .qh-hint {
  font-family: var(--font-latin);
}

/* ── Dates ───────────────────────────────────── */

.qh-dates {
  margin-top: var(--space-5);
}

.qh-date-greg {
  font-family: var(--font-arabic);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.5;
}

.qh-date-hijri {
  font-family: var(--font-arabic);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.5;
}

[dir="ltr"] .qh-date-greg,
[dir="ltr"] .qh-date-hijri {
  font-family: var(--font-latin);
}

@media (prefers-reduced-motion: reduce) {
  .qh-needle,
  .qh-marker,
  .qh-location-btn {
    transition: none;
  }
  .qh-spinner {
    animation: none;
  }
}
```

- [ ] **Step 3: Delete the old view**

```bash
git rm src/app/features/prayer-times/QiblaView.tsx src/app/features/prayer-times/QiblaView.css
```

> `PrayerTimes.tsx` still imports `QiblaView` at this point and will not typecheck until Task 7. That is expected — these two tasks are one deliverable split for reviewability.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/prayer-times/QiblaHeader.tsx src/app/features/prayer-times/QiblaHeader.css
git commit -m "replace the qibla view with a page header carrying marker and turn guidance

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire the page together

**Files:**
- Modify: `src/app/features/prayer-times/PrayerTimes.tsx`
- Modify: `src/app/features/prayer-times/PrayerTimes.css`
- Modify: `src/app/features/more/More.tsx:41`

**Interfaces:**
- Consumes: `QiblaHeader` (Task 6), `getPlace` / `requestLocation` / `LocationOutcome` (Task 4), the strings from Task 5.
- Produces: the finished page.

- [ ] **Step 1: Update the imports**

In `PrayerTimes.tsx`, replace `import QiblaView from "./QiblaView";` with:

```tsx
import QiblaHeader from "./QiblaHeader";
```

and extend the service import to:

```tsx
import {
  loadPrayerDay,
  requestLocation,
  getPrayerConfig,
  setPrayerConfig,
  getVisibleTimes,
  getPlace,
} from "../../core/services/prayer/prayer-times.service";
```

Remove `useLocation` from the `react-router-dom` import and delete the now-unused `import { useLocation } from "react-router-dom";` line entirely.

- [ ] **Step 2: Replace the view state with location state**

Delete the `const [view, setView] = useState<...>` block entirely. Add beside the other state:

```tsx
  const [place, setPlace] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<
    "denied" | "services-off" | "failed" | null
  >(null);
```

Delete the `denied` state and its `setDenied` calls — `locationError` replaces it.

- [ ] **Step 3: Load the place name alongside everything else**

Replace the `load` callback with:

```tsx
  const load = useCallback(async () => {
    const [cfg, d, v, p] = await Promise.all([
      getPrayerConfig(),
      loadPrayerDay(),
      getVisibleTimes(),
      getPlace(),
    ]);
    setConfig({ method: cfg.method, madhab: cfg.madhab });
    setDay(d);
    setVisible(v);
    setPlace(p);
  }, []);
```

- [ ] **Step 4: Rewrite the location handler**

Replace `handleGrantLocation` with:

```tsx
  const handleUpdateLocation = useCallback(async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setLocating(true);
    setLocationError(null);
    try {
      const outcome = await requestLocation();
      if (outcome !== "granted") {
        setLocationError(outcome);
        return;
      }
      await load();
    } finally {
      requestingRef.current = false;
      setLocating(false);
    }
  }, [load]);
```

- [ ] **Step 5: Restructure the render**

Replace everything from `{day === null ? null : ...}` through the closing of that expression with:

```tsx
            {day === null ? null : !day.hasLocation ? (
              <>
                <h1 className="pt-title">{tp.title}</h1>
                <div className="pt-permission">
                  <h2 className="pt-permission-title">
                    {locationError === "services-off"
                      ? tp.locationServicesOff
                      : tp.locationNeeded}
                  </h2>
                  <p className="pt-permission-desc">
                    {locationError === "services-off"
                      ? tp.locationServicesOffDesc
                      : tp.locationNeededDesc}
                  </p>
                  <button
                    type="button"
                    className="pt-grant-btn"
                    onClick={handleUpdateLocation}
                    disabled={locating}
                  >
                    {locating ? tp.locating : tp.grantLocation}
                  </button>
                  {locationError === "denied" && (
                    <p className="pt-denied">{tp.locationDenied}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <QiblaHeader
                  placeName={place}
                  onUpdateLocation={handleUpdateLocation}
                  locating={locating}
                />

                <div className="pt-card">
                  {day.next && nextAt !== undefined && (
                    <div className="pt-next">
                      <span className="pt-next-label">{tp.nextPrayer}</span>
                      <span className="pt-next-name">
                        {rowLabel(day.next.name)}
                      </span>
                      <span className="pt-next-countdown">
                        {formatCountdown(nextAt - now, lang)}
                      </span>
                    </div>
                  )}

                  <div className="pt-card-header">
                    <button
                      type="button"
                      className="pt-menu-btn"
                      onClick={() => setShowSheetOpen(true)}
                      aria-label={tp.show}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                  </div>

                  <div className="pt-rows">
                    {rowKeys.map((key) => {
                      const time = day.times![key];
                      const isNext = day.next?.name === key;
                      const isSunrise = key === "sunrise";
                      return (
                        <React.Fragment key={key}>
                          {key === firstAdditionalKey && (
                            <div className="pt-separator" aria-hidden="true">
                              <span className="pt-separator-label">
                                {tp.additionalTimes}
                              </span>
                            </div>
                          )}
                          <div
                            className={
                              "pt-row" +
                              (isNext ? " pt-row--next" : "") +
                              (isSunrise ? " pt-row--sunrise" : "")
                            }
                          >
                            <span className="pt-row-label">
                              {rowLabel(key)}
                            </span>
                            <span className="pt-row-time">
                              {formatTime(time)}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {locationError !== null && locationError !== "denied" && (
                  <p className="pt-location-error">
                    {locationError === "services-off"
                      ? tp.locationServicesOffDesc
                      : tp.locationDenied}
                  </p>
                )}

                <div className="pt-settings">
                  <div className="pt-setting-row">
                    <span className="pt-setting-label">{tp.method}</span>
                    <InlineSelect
                      value={config?.method ?? PRAYER_METHODS[0]}
                      options={PRAYER_METHODS.map((m) => ({
                        value: m,
                        label: tp[METHOD_LABEL_KEY[m] as keyof typeof tp],
                      }))}
                      onChange={handleMethodChange}
                      night={isNight}
                      fullWidth
                      aria-label={tp.method}
                    />
                  </div>
                  <div className="pt-setting-row">
                    <span className="pt-setting-label">{tp.madhab}</span>
                    <InlineSelect
                      value={config?.madhab ?? MADHABS[0]}
                      options={MADHABS.map((m) => ({
                        value: m,
                        label: tp[m],
                      }))}
                      onChange={handleMadhabChange}
                      night={isNight}
                      fullWidth
                      aria-label={tp.madhab}
                    />
                  </div>
                </div>

                <ShowTimesSheet
                  open={showSheetOpen}
                  onClose={() => setShowSheetOpen(false)}
                  onChanged={load}
                />
              </>
            )}
```

Also delete the now-unused `hijriDate` and `gregorianDate` consts from `PrayerTimes.tsx` — `QiblaHeader` owns the date band now. Leave `formatTime`, `rowLabel`, `rowKeys` and `firstAdditionalKey` in place.

- [ ] **Step 6: Update the page CSS**

In `PrayerTimes.css`, **delete** these rule blocks entirely: `.pt-segmented`, `.pt-segment`, `[dir="ltr"] .pt-segment`, `.pt-segment--active`, `.pt-hero`, `.pt-hero-name::before`, `[dir="rtl"] .pt-hero-name::before`, `.pt-hero-label`, `.pt-hero-name`, `.pt-hero-time`, `.pt-hero-pill`, `.pt-dates`, `.pt-date-greg`, `.pt-date-hijri`.

Remove `.pt-segment` and `.pt-menu-btn` from the `prefers-reduced-motion` selector list, leaving `.pt-page-wrapper, .pt-row, .pt-grant-btn`.

Replace the `.pt-card-header` rule with:

```css
/* Only the three-dot button now — the dates moved into the compass header. */
.pt-card-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--space-4);
}
```

Append these rules:

```css
/* ── Next prayer, inside the card ─────────────── */
/* The page's one loud element. A capsule rather than a block, so it reads as
   a status attached to the list rather than a second header. */
.pt-next {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 var(--space-4) var(--space-4);
  padding: var(--space-3) var(--space-5);
  background: var(--color-gold-faint);
  border: 1.5px solid var(--color-gold-subtle);
  border-radius: var(--radius-pill);
}

.pt-next-label {
  font-family: var(--font-arabic);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.pt-next-name {
  font-family: var(--font-arabic);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-gold);
}

.pt-next-countdown {
  font-family: var(--font-arabic);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

[dir="ltr"] .pt-next-label,
[dir="ltr"] .pt-next-name,
[dir="ltr"] .pt-next-countdown {
  font-family: var(--font-latin);
}

/* ── Location failure, with times already on screen ───────────────────── */
.pt-location-error {
  font-family: var(--font-arabic);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  margin: var(--space-4) var(--space-4) 0;
  line-height: var(--leading-normal);
}

[dir="ltr"] .pt-location-error {
  font-family: var(--font-latin);
}
```

Replace the `.pt-separator` rule with a labelled version:

```css
/* ── Separator ────────────────────────────────── */
/* Marks the boundary before the first supplementary (non-obligatory) row,
   carrying the section's name on the rule itself. */
.pt-separator {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0 var(--space-1);
}

.pt-separator::before,
.pt-separator::after {
  content: "";
  flex: 1;
  border-top: 1px dashed var(--color-border-subtle);
}

.pt-separator-label {
  font-family: var(--font-arabic);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

[dir="ltr"] .pt-separator-label {
  font-family: var(--font-latin);
}
```

Finally, update `.pt-card` so it overlaps the header band:

```css
.pt-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  /* Overlaps the gradient band above it, so the page reads as one surface. */
  margin-top: calc(-1 * var(--space-5));
  padding-top: var(--space-5);
  padding-bottom: var(--space-5);
  position: relative;
}
```

- [ ] **Step 7: Point the More card at the page**

In `src/app/features/more/More.tsx`, line 41, change:

```tsx
    route: "/prayer-times?view=qibla",
```

to:

```tsx
    route: "/prayer-times",
```

> The compass is now the first thing on the page, so the query string has nothing left to select. Both cards landing on the same route is correct: one page, two things on it.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: **zero** errors in `src/` — including the `PrayerTimes.tsx` error carried from Task 4.

- [ ] **Step 9: Run the full web suite**

Run: `npm test -- --watchAll=false`
Expected: PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/prayer-times/PrayerTimes.tsx src/app/features/prayer-times/PrayerTimes.css src/app/features/more/More.tsx
git commit -m "merge the compass into the times scroll and drop the segmented control

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Whole-branch verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full native suite**

Run: `cd android && ./gradlew testDebugUnitTest`
Expected: PASS, 45 tests, 0 failures.

- [ ] **Step 2: Full web suite**

Run: `npm test -- --watchAll=false`
Expected: PASS, 30 suites, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors in `src/`.

- [ ] **Step 4: Check the standing CSS rules by hand**

```bash
grep -rn "eslint-disable" src/app/features/prayer-times/ src/app/core/services/prayer/
grep -rn "scrollbar\|overflow-y: scroll" src/app/features/prayer-times/
grep -rn "600px\|500px" src/app/features/prayer-times/
grep -rn "bottom-nav-height" src/app/features/prayer-times/PrayerTimes.css
```

Expected: the first three print **nothing**; the fourth prints the `padding-bottom` line in `.pt-container`.

- [ ] **Step 5: Confirm the old view is gone**

```bash
grep -rn "QiblaView\|view=qibla\|pt-hero\|pt-segment" src/
```

Expected: **nothing**. Any hit is a dangling reference to a deleted thing.

- [ ] **Step 6: Commit if anything was fixed**

```bash
git add -u
git commit -m "fix verification findings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

If nothing needed fixing, skip this step — do not create an empty commit.

---

## Manual verification (user, after `npx cap sync android` and a build)

These cannot be automated and are the real gate on the feature:

1. **The needle and marker against a real compass** — they should converge as you turn, and agree with a known qibla direction.
2. **The turn label near north** — stand facing ~355° with a qibla near 5°; it must say turn right, not turn left.
3. **The location button with services off** — switch off location in quick settings, tap it: expect the services-off message, not a permission prompt.
4. **The place name offline** — enable airplane mode and take a fix: the header falls back to مواقيت الصلاة and the times still compute.
5. **The place name after travel** — take a fix in one city, then another elsewhere: the old name must never survive.
6. **Hardware back closes the Show sheet** rather than leaving the page.
7. **The widget** still renders and honours hidden times.
