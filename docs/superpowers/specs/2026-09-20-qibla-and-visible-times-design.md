# Qibla, Visible-Times Control and Page Layout — Design

Date: 2026-09-20
Status: Approved, not yet implemented
Branch: `qibla-and-show` (off `prayer-times-ui`)
Follows: `docs/superpowers/specs/2026-09-19-prayer-times-design.md`

## Problem

Three requests, from annotated screenshots of a reference prayer-times app:

1. The Prayer Times page should follow that app's layout more closely — a
   left-aligned hero with the next prayer, and a light card that overlaps the
   hero band and carries the list.
2. A three-dot menu on the list header, whose **Show** entry opens a checklist
   of times. Unchecking one removes it from the list; checking it puts it back.
3. Qibla and prayer times should live "in one place".

The first is styling. The second is a small preference store plus a sheet. The
third is a new subsystem — device sensors — which is why this has a spec.

## Terminology

- **Timetable** — the five prayers plus Sunrise.
- **Supplementary times** — Duha, Midnight, Last third. Displayed, never
  reminded, never "next prayer". Added in the previous branch.
- **Visible set** — the times the user has chosen to show. A preference,
  independent of which times the engine can compute.
- **True north** vs **magnetic north** — the compass measures magnetic; the
  Qibla bearing is computed against true. The difference is the *declination*.

## Why the compass needs care

`Qibla(Coordinates).direction` in adhan-java gives the bearing to the Kaaba
**relative to true north**. On Android, the Web `deviceorientationabsolute`
event reports heading **relative to magnetic north**. Subtracting one from the
other without correction produces a needle wrong by the local declination —
roughly 5° in Cairo, and up to 20° elsewhere in the world.

A silently wrong direction is the worst possible failure for this feature. So
the declination is corrected natively, using Android's `GeomagneticField`,
which is part of the platform, works entirely offline, and takes the
coordinates already stored in `PrayerConfig`:

```
qiblaFromMagneticNorth = qiblaFromTrueNorth - declination(lat, lng, altitude, now)
```

The plugin returns both the true-north bearing (to display as a number, as the
reference app does) and the declination, so the web layer can correct the live
heading without re-deriving anything.

### When the sensor is missing or poor

Not every device has a magnetometer, and those that do can be uncalibrated —
near a laptop, a speaker magnet, or in a car. The design treats a working
needle as the *best* case, not the only one:

- **No `deviceorientationabsolute` support, or no event within 3 seconds** →
  no needle. Show the bearing as a number with a one-line explanation.
- **Event carries `webkitCompassAccuracy` or an `absolute: false` flag
  indicating poor accuracy** → show the needle, plus a calibration hint.
- **Working** → live needle, numeric bearing beneath it.

The numeric bearing is always shown, because it is always correct and needs no
sensor. The needle is the enhancement.

## Layout: one page, two views

The reference app puts Prayers and Qibla in a bottom nav. Rafeeq already has a
`BottomNavBar` pinned to the bottom of every page, so a second nav would stack
two bars. Instead both views live on `/prayer-times` behind a **segmented
control** at the top:

```
┌────────────────────────────┐
│   [ الصلوات ]  [ القبلة ]    │  ← segmented, gold active pill
├────────────────────────────┤
│  » DHUHR                   │
│    12:47    (3 minutes)    │  ← hero, left-aligned
├────────────────────────────┤
│  Sunday, 20 September ⌄  ⋮ │  ← card overlaps the hero band
│  9 Rabia Thani 1448        │
│  ────────────────────────  │
│  Fajr              5:13 AM │
│  Dhuhr            12:47 PM │  ← next prayer as a capsule
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │  ← dashed rule before supplementary
│  Midnight         12:03 AM │
└────────────────────────────┘
        [ existing nav bar ]
```

The More page's **القبلة** card loses `comingSoon` and routes to
`/prayer-times?view=qibla`. The view is read from the query string so the card
can deep-link straight to it, and the segmented control swaps views without
navigating.

**No second nav bar, and `ROOT_TAB_PATHS` is untouched** — `/prayer-times`
remains a sub-page of More, so back still returns there.

## The Show sheet

The three-dot button opens a sheet listing every time the engine can produce,
each with a checkbox. It uses the app's existing sheet pattern
(`VerseActionSheet`) and registers with the **overlay registry**, so hardware
back closes the sheet rather than leaving the page.

Rules:

- **The five obligatory prayers cannot be hidden.** Their rows render with a
  disabled, checked control and a short note. Hiding Fajr from a prayer-times
  app is not a preference worth honouring.
- Sunrise and the three supplementary times are freely toggleable.
- Defaults: timetable visible, supplementary times hidden — matching what the
  page shows today, so existing users see no change until they opt in.
- The choice persists to `SharedPreferences` through the plugin, not to
  localStorage, because the **widget** reads the same preference. A user who
  hides Sunrise should not see it reappear on their home screen.

The existing `ADDITIONAL_KEYS` collapsible section is **removed**: with a
visible-set preference, a second mechanism for hiding the same rows is one
mechanism too many. The dashed rule from the screenshot separates the
supplementary times from the timetable instead.

### Widget consequence

The widget has six fixed slots. It renders the **visible set truncated to
six**, in timetable order, so hiding Sunrise frees a slot for Duha. If the
visible set is smaller than six, the spare slots are hidden rather than left
blank.

## Architecture

Calculation and preferences stay native, for the reason the previous spec
established: the widget has no WebView.

```
        ┌──────────────────────────────┐
        │  PrayerTimesEngine (Kotlin)  │
        │  + QiblaEngine (new)         │
        └──────────────┬───────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
RafeeqPrayerPlugin  PrayerAlarm…    PrayerWidget…
    │               (unchanged)     (reads visible set)
    │
  prayer-times.service.ts
    │
    ├── PrayerTimes.tsx   (prayers view)
    ├── QiblaView.tsx     (compass view)
    └── ShowTimesSheet.tsx
```

**New native surface:**

- `QiblaEngine.kt` — `bearing(lat, lng): Double` from `Qibla(Coordinates)`,
  and `declination(lat, lng): Float` from `GeomagneticField`. Pure, testable.
- `PrayerConfig` — `visibleTimes(ctx): Set<String>` / `setVisibleTimes`.
- Plugin — `getQibla()` resolving `{bearing, declination}`;
  `getVisibleTimes()` / `setVisibleTimes({times})`.

**New web surface:**

- `qibla.service.ts` — owns the plugin call and the orientation listener,
  including the 3-second no-event timeout. The view never touches the sensor.
- `QiblaView.tsx` + `.css` — the dial, needle, numeric bearing, states.
- `ShowTimesSheet.tsx` + `.css` — the checklist.
- `PrayerTimes.tsx` — segmented control, restyled hero and card, three-dot
  menu; filters rows by the visible set.

## Testing

**Native.** `QiblaEngine` is the TDD unit. Cairo (30.0444, 31.2357) bears
roughly 136° to the Kaaba; Jakarta bears roughly 295°; a point due north of
Mecca bears 180°. Each asserted at ±1°. Declination is asserted only for sign
and magnitude (Cairo is a few degrees east) — the exact value drifts yearly
with the World Magnetic Model, so pinning it would make the test rot.

`PrayerConfig.visibleTimes` gets defaults tests like the reminder prefs, and a
test that the obligatory five are always present in the returned set even if
storage somehow says otherwise.

**Web.** `qibla.service.ts` against a mocked plugin and a synthetic
orientation event: bearing arrives, no-sensor path resolves to numeric-only,
and the listener is removed on teardown. The Show sheet's filtering logic is
tested through the service's visible-set round-trip.

**Manual, on device:** the needle against a real compass, sheet toggles
surviving an app restart, and the widget honouring a hidden time.

## Out of scope

- The moon-phase dial in the hero (decorative; the countdown carries the
  information)
- Location name / reverse geocoding — the app stores coordinates only, and
  resolving a name needs either a network call or a bundled place database
- Per-prayer mute icons, the calendar picker, the Agenda tab, Imsak, manual
  time adjustments, higher-latitude method selection
- A map view for Qibla
- iOS: there is still no `ios/` directory

## Build note

`@capacitor/motion` is **not** required — `deviceorientationabsolute` is a
plain Web API available in the Android WebView. No new native dependency, so
no `npx cap sync` beyond what the previous branch already needs.
