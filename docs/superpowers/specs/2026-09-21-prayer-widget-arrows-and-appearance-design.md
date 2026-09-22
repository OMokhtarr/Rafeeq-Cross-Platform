# Prayer Widget: Arrow Navigation and Per-Widget Appearance — Design

## What changes

Three things, all driven by the widget being unusable as built:

1. **The swipe deck becomes a single card with ‹ › buttons.** The `StackView`
   swipe never worked in the launcher, and the card could not be moved.
2. **Nothing but the date column opens the app.** The arrows and the card are
   inert as app-launchers, so reaching for "next" can never open Rafeeq.
3. **Appearance is configurable per widget**: background colour, transparency
   (including fully transparent), text colour, accent colour, font size.

## Why the StackView goes

`StackView` was chosen because it is the only *swipeable* `RemoteViews`
primitive, and its swipe does work — vertically, up and down. What it cannot
do is show a single card: the stacked, peeking card-deck look **is**
`StackView`, is not configurable, and is not what this widget wants.

`AdapterViewFlipper` renders exactly one child with nothing behind it, which
is the requested display. It is not swipeable, so navigation moves to explicit
‹ › buttons — which is the better trade here anyway, since the buttons are
discoverable where a vertical swipe on a 4×1 strip is not, and they remove the
`setPendingIntentTemplate` that made every card a tap target for the app.

**`PrayerDeckService` stays.** `AdapterViewFlipper` is still a collection view
backed by a `RemoteViewsFactory`, so the service and its card building are
unchanged; only the view it feeds and the way the position is chosen change.

## How the arrows work

Each button is a `PendingIntent.getBroadcast` back to `PrayerWidgetProvider`
carrying a custom action and the widget id:

```
ACTION_STEP + EXTRA_APPWIDGET_ID + EXTRA_DELTA (+1 / -1)
```

`onReceive` reads the widget's stored index, applies the delta, wraps it
within the card count, stores it, and re-renders that one widget.

**The index is stored per widget id**, not globally: two widgets on the same
home screen must be able to show different prayers. It lives in the same
`SharedPreferences` file as the rest of the prayer config, keyed by id, and is
deleted in `onDeleted` so removed widgets leave nothing behind.

**Wrapping, not clamping.** At Isha, "next" returns to Fajr rather than
disabling the button — a disabled arrow in a 4×1 strip is a dead pixel the
user has to learn about, and the timetable is a cycle anyway.

**The index is reset on every refresh that changes the day.** A widget left on
"Asr" overnight must not still be on yesterday's Asr; the midnight roll resets
it to the next prayer, which is where the widget is most useful.

## What opens the app

Only `widget_date_column` (the date, Hijri date and place name). The arrows
carry their own broadcast intents, and the card has no `PendingIntent` at all.

Double-tap was requested but is **not possible**: `RemoteViews` exposes a
single click callback per view, with no gesture detection and no way to run
timing code in the launcher process. The underlying goal — an arrow press must
never open the app — is met more strictly by making the arrows the only thing
in that region that responds at all.

## Appearance settings

A configuration `Activity` (`PrayerWidgetConfigActivity`), declared with
`ACTION_APPWIDGET_CONFIGURE` so the launcher opens it on placement, and
re-openable from the prayer times page.

Stored **per widget id**, so two widgets can look different:

| Setting        | Type        | Default                           |
|----------------|-------------|-----------------------------------|
| Background     | ARGB colour | theme surface                     |
| Transparency   | 0–100%      | 0% (opaque)                       |
| Text colour    | ARGB colour | follows device light/dark         |
| Accent colour  | ARGB colour | the app's gold `#D4B48C`          |
| Font size      | sp          | 14sp                              |

**Transparency is applied to the background colour's alpha channel**, not to
the whole widget: the text must stay fully opaque over a wallpaper, which is
the entire point of a transparent widget. A `View.setAlpha` on the root would
fade the text with it.

The background is drawn with `setInt(id, "setBackgroundColor", argb)` rather
than a drawable, because a drawable's colour cannot be varied per widget id
without generating one resource per widget. This loses the rounded corners the
shape drawable provided — so the shape is kept, tinted with
`setColorStateList(id, "setBackgroundTintList", …)` (API 31+) and falls back
to a flat `setBackgroundColor` below that. **minSdk is 26**, so the fallback is
the common path on older devices and the corners are lost there; that is
accepted rather than shipping one drawable per widget id.

Fully transparent (`alpha = 0`) is a first-class value, not an edge case: it
is the headline request, and the code must not treat 0 as "unset".

## Defaults follow the device theme

With no configuration, the widget renders exactly as it does today — the
existing day/night layouts and `baseTextColor`. A stored colour overrides that
for that widget only. This keeps "add widget, never open settings" working.

## Layout

```
┌──────────────────────────────────────────────┐
│ Mon, 21 Sep · 10 Rab. II                     │
│ 📍 El Shorouk      ‹  ┌──────────┐  ›        │
│      2:33:53          │ Maghrib  │           │
│                       │  6:58    │           │
│ └─ opens the app ─┘   └──────────┘           │
│                        not tappable          │
└──────────────────────────────────────────────┘
```

Both layout variants (`layout/`, `layout-night/`) keep identical view ids;
`WidgetLayoutParityTest` already enforces that and is extended to the new ids.

## Files

**Native**
- `PrayerWidgetProvider.kt` — arrow broadcasts, per-widget appearance, index
  storage, and `setDisplayedChild` on the flipper.
- `PrayerDeckService.kt` — unchanged; still serves one card per visible time.
- `PrayerWidgetConfig.kt` *(new)* — per-widget appearance + index, in
  SharedPreferences, keyed by widget id.
- `PrayerWidgetConfigActivity.kt` *(new)* — the configuration screen.
- `RafeeqPrayerPlugin.kt` — `openWidgetSettings()` so the app can re-open it.

**Resources**
- `layout/widget_prayer_times.xml`, `layout-night/…` — card + arrows.
- `layout/widget_prayer_config.xml` *(new)* — the config screen.
- `widget_prayer_card.xml` — kept, no longer served by a factory.

**Tests**
- `PrayerWidgetIndexTest` *(new)* — wrapping, per-id isolation, reset on day
  change.
- `PrayerWidgetConfigTest` *(new)* — round-trip, transparency at 0 and 100,
  per-id isolation, defaults when unset.
- `PrayerDeckTest` — retained; the card arithmetic did not change.

## Not in scope

- A preview of the widget inside the config screen (the reference screenshot
  has one; it needs a second rendering path and is not worth it yet).
- Per-widget choice of *which* times appear — that stays the app-wide
  visible-times preference.
