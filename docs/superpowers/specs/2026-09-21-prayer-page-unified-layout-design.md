# Unified Prayer Page: Compass, Place Name and Location Refresh — Design

Date: 2026-09-21
Status: Approved, not yet implemented
Branch: `prayer-page-layout` (off `qibla-and-show`)
Follows: `docs/superpowers/specs/2026-09-20-qibla-and-visible-times-design.md`

## Problem

A reference screenshot sets the target layout: the compass ring sits at the
top of the page on a warm gradient band, the date sits under it, and the
times list flows directly beneath — one continuous scroll, no tabs. Three
changes follow from it, plus one the user asked for on top:

1. The segmented Prayers/Qibla control disappears; both live in one scroll.
2. The ring carries labels around its circumference and a turn instruction.
3. The header names the user's **place**, not the page.
4. A **location button** re-acquires the fix and refreshes the times, and
   prompts when location services are off.

The palette stays Rafeeq's gold. Only the layout follows the reference.

## What the reference asks for that we cannot honestly give

The screenshot shows `1270 km to Kabaa`, `188 m above sea level`, and the
place name `Madīnat aṭ Ṭalā'i'`. These are not equivalent in cost:

- **Distance** is a great-circle computation from coordinates we already
  store. Offline, exact, cheap. *Not requested — omitted.*
- **Altitude** comes from the GPS fix and is frequently null or tens of
  metres wrong indoors. *Not requested — omitted.*
- **Place name** requires reverse geocoding. *Requested — see below.*

Omitting the first two keeps the ring's circumference clear for the one
label the user actually asked for.

## Reverse geocoding, and why it is cached

Android's `Geocoder.getFromLocation` performs a **network lookup**. It
returns an empty list when offline, and `Geocoder.isPresent()` is false on
devices with no backend service at all. A live lookup on every page open
would make the header flicker, depend on connectivity, and burn a request
per visit.

So the name is resolved **once, at the moment a location fix is taken**, and
written to `SharedPreferences` beside the coordinates:

```
setLocation(lat, lng)
   ├── store coords                    (always, synchronously)
   └── resolve name on a worker thread (best effort)
         ├── success → store name
         └── offline / absent / empty → clear name
```

After that the name renders from storage forever, with no network. This
makes the header a **cached label on the coordinates**, not a live service
call — which is the only shape consistent with the app's offline-first
constraint.

**The name is never load-bearing.** Coordinates drive the compass and the
times; the name is decoration on top. When it is absent the header falls
back to the page title and nothing else changes. A fix taken on a plane is
still a perfectly good fix.

### Which name

`Address` exposes several fields at different granularities. The header
wants the most human answer, so it takes the first non-null of:

```
locality → subAdminArea → adminArea → countryName
```

`locality` is the city, which is what the reference shows. The fallbacks
handle rural coordinates where no locality exists.

Locale matters: the geocoder is asked in the app's current language, so an
Arabic UI gets an Arabic place name. The name is re-resolved when the user
takes a new fix, not when they switch language — a stale-language name is a
smaller problem than a network call on a settings toggle.

## The location button

A single icon button in the header, beside the place name. Its job is the
whole acquire-and-refresh cycle:

```
tap
 └── permission granted?
       ├── no  → request it
       │          └── still denied → inline message, stop
       └── yes → acquire fix
                   ├── success → store coords + resolve name → reload times
                   └── failure → is location *services* off?
                                   ├── yes → prompt, offer to open settings
                                   └── no  → generic "couldn't locate" message
```

The distinction in the last branch is the point. A denied *permission* and a
disabled *location service* are different failures with different remedies,
and telling a user to grant a permission they already granted is the kind of
dead end that makes a feature feel broken. `Geolocation.getCurrentPosition`
reports the latter as a distinct error, so the plugin exposes a
`locationServicesEnabled` check and the page branches on it.

While the fix is in flight the button shows a spinner and is disabled —
`requestLocation` already guards re-entry with a ref, and the button
surfaces that state rather than hiding it.

## Layout

```
┌──────────────────────────────────────┐
│ ░░░░░░ gradient band ░░░░░░░░░░░░░░░ │
│        Madīnat aṭ Ṭalā'i'    ⌖       │  ← place name + location button
│           Egyptian GAS               │  ← calculation method, small
│                                      │
│         ╭─────●─────╮                │  ← Kaaba marker on the ring
│        │             │               │
│        │      ➤      │               │  ← needle, rotates
│        │             │               │
│         ╰───────────╯                │
│           Turn Left                  │  ← only when off-target
│                                      │
│        20 September 2026             │
│        9 Rabi al-Thani 1448          │
├──────────────────────────────────────┤  ← card, overlaps the band
│  Fajr                     5:13 am    │
│  Sunrise                  6:41 am    │
│ (Dhuhr                   12:48 pm)   │  ← next prayer, capsule
│  Asr                      4:15 pm    │
│  Maghrib                  6:53 pm    │
│  Isha                     8:10 pm    │
│  ──── Additional Times ────          │  ← dashed rule
│  Duha                     7:01 am    │
└──────────────────────────────────────┘
            [ BottomNavBar ]
```

The ring is fixed to the device and the needle rotates inside it, as now.
The **Kaaba marker rides the ring's circumference** at the qibla bearing
minus the heading, so it converges with the needle as the user turns — this
is what makes the dial readable at a glance rather than a number to compare.

`Turn Left` / `Turn Right` appears only when the user is more than a few
degrees off; inside that window it becomes a "facing the qibla" confirmation.
Without a hysteresis band the label would flicker between left and right
every time the magnetometer jitters, so the confirmation window is **±5°**
and the label is suppressed entirely when no needle is available.

### The no-sensor case

Everything above assumes a magnetometer. Without one there is no heading, so
the needle, the Kaaba marker and the turn instruction all have no meaning.
The ring then renders **static with the numeric bearing centred inside it**,
and the existing `qiblaNoSensor` hint explains why. The ring is not hidden:
the page's shape should not change depending on hardware, and the bearing is
still a complete answer.

## Structure

`QiblaView` stops being a route-level alternative and becomes the page's
header. `PrayerTimes.tsx` renders it unconditionally above the card, and
the segmented control is deleted.

`/prayer-times?view=qibla` must keep working — the More page's القبلة card
links to it and users may have it in history. It now **scrolls the compass
into view** on mount rather than switching a view. Since the compass is at
the top of the page, that is very nearly a no-op, which is the point: the
deep link stops being a mode and becomes a hint.

```
PrayerTimes.tsx
  ├── QiblaHeader     (place name, location button, ring, date)
  │     └── consumes qibla.service — unchanged
  ├── times card      (rows, separator, next-prayer capsule)
  ├── pickers         (method, madhab)
  └── ShowTimesSheet  (unchanged)
```

`QiblaView.tsx` is renamed and reshaped rather than rewritten: the sensor
lifecycle, the calibration hint and the no-sensor fallback all survive as-is.
Its standalone permission prompt is **removed** — the page above it already
owns that state, and two prompts for one permission on one screen is a bug
waiting to happen.

## Native surface

- `PrayerConfig` — `placeName(ctx): String?` / `setPlaceName`, cleared
  whenever `setCoords` runs so a stale name can never outlive its
  coordinates.
- `RafeeqPrayerPlugin.setLocation` — resolves the name on a worker thread
  after storing coordinates, and never fails the call if geocoding fails.
- `RafeeqPrayerPlugin.getPlace()` — resolves `{name: String?}`.
- `RafeeqPrayerPlugin.locationServicesEnabled()` — resolves `{enabled}`
  from `LocationManager`, so the page can tell the two failures apart.

`INTERNET` and `ACCESS_COARSE_LOCATION` are already declared. No manifest
change, no new dependency.

### Widget

The widget does not show the place name and is unaffected. It re-renders on
a location change as it already does.

## Testing

**Native.** `PrayerConfig` place-name round-trip, and the invariant that
`setCoords` clears a previously stored name — that one guards the failure
mode where a user travels, re-fixes, and sees their old city. Geocoding
itself is an Android framework call and is not unit-tested; the plugin's
worker-thread wrapper is verified by the instrumented path only.

**Web.** `prayer-times.service` gains `getPlace` and
`locationServicesEnabled` with the same `isNative` guards as every other
export, plus the matching web-fallback tests (`null` and `true`). The turn
instruction is a pure function of `(bearing, heading)` and gets its own unit
tests: left, right, within-tolerance, and the 0/360 wrap — where a naive
subtraction sends the user the long way round.

**Manual, on device:** the needle and Kaaba marker against a real compass;
the location button with services off; the place name surviving airplane
mode; the name updating after travelling.

## Out of scope

- Distance to the Kaaba, altitude (see above)
- Per-prayer mute icons — asked and declined for this pass
- Re-resolving the place name on a language switch
- A map view, the moon-phase dial, the calendar picker, Agenda, Imsak
- iOS: there is still no `ios/` directory

## Build note

No new native dependency. The user runs `npx cap sync android` and builds;
the plugin gains methods, which requires a sync.
