# Prayer Widget: a 4×1 Strip with a Swipeable Countdown — Design

## What changes

The prayer widget becomes a **4×1 strip**. Its right-hand side is a
**swipeable deck**: one card per visible time, each showing that time's name,
clock time, and a **live countdown to it**. Swiping moves to the next or
previous time.

Today's widget is a 4×2 block: a header row (app name, date) over a row of six
fixed slots, each a name above a time, with the next prayer tinted. It shows
everything at once and counts down to nothing.

The two differ in kind, not degree. The old widget answers *"what is the
timetable today?"*. The new one answers *"how long until the next prayer?"* —
and lets the user page through the rest rather than showing them all at once.
That is the whole reason it fits in half the height.

## Why a StackView

`RemoteViews` cannot run code in the launcher process. There is no touch
listener, no gesture detector, no `onFling`. A widget therefore cannot
"handle a swipe" the way a page can.

Android offers exactly one swipeable widget primitive: **`StackView`**, backed
by a `RemoteViewsService.RemoteViewsFactory`. The launcher drives the gesture
itself and asks the factory for each card's `RemoteViews`. This is the only way
to get a real horizontal swipe, so it is what the deck uses.

The cost is that a `StackView` looks like a **stacked card deck** — cards peek
behind the front one, and the swipe animation is the platform's, not ours. That
shape is not configurable. It is accepted deliberately: a genuine swipe was
worth more than a flat strip, which would have had to be driven by tap targets
instead.

`ViewFlipper` was rejected: it auto-advances on a timer and is not swipeable.

## Why the countdown is a Chronometer

The countdown must tick. A `TextView` in a widget only changes when the app
pushes an update, and pushing one per second is not acceptable — it would wake
the app process every second, forever.

`Chronometer` in **countdown mode** (`setChronometerCountDown(true)`,
API 24; minSdk here is 26) is ticked by the **system**, in the launcher's own
process, at no cost to the app. It counts toward a fixed `base` timestamp.

Its constraint: the format is a plain `H:MM:SS` elapsed-time rendering with no
control over suppressing seconds. That matches the mock — `4:07:15` — so the
constraint costs nothing here.

**Each card counts to its own time.** A card for a prayer that has already
passed today counts to **tomorrow's** occurrence of it, never to a negative
number. Computing that is the factory's job, and it is the one piece of
arithmetic in this design worth testing directly.

## What the cards cycle through

The user's **visible-times preference** (`PrayerConfig.visibleTimes`) — the
same set the page and the old widget slots already honour. Enabling Duha in the
app's sheet adds a Duha card; hiding sunrise removes its card.

Two differences from the old widget's slot logic:

- **No truncation.** The old widget had six physical slots and had to rank and
  cut. A deck has as many cards as there are times, so `SLOT_PRIORITY` is no
  longer needed for *fitting* — but it is still the **display order**, so a
  supplementary time never sorts ahead of an obligatory prayer.
- **Null times still excluded.** adhan-java returns null inside the
  midnight-sun window; a card with a name and no time must never exist.

The deck **opens on the next prayer**, not on the first card, so the widget
answers its main question without any swipe at all.

## Layout

```
┌──────────────────────────────────────────────┐
│ Mon, 21 Sep · 10 Rab. II      ╭────────────╮ │
│                               │   Fajr     │ │
│                               │   5:14     │ │
│                               │  4:07:15   │ │
│                               ╰────────────╯ │
└──────────────────────────────────────────────┘
  date column (left)             swipe deck (right)
```

The left column is static: the Gregorian date over the Hijri date. The right is
the `StackView`.

**The location line is deliberately absent.** The mock shows `📍 El Shorouk`,
but no place name is stored yet — `PrayerConfig` holds coordinates only. The
place name is specced in `2026-09-21-prayer-page-unified-layout-design.md` and
not yet built. Showing coordinates instead would be worse than showing nothing,
so the row is omitted and the date column keeps the space. When that spec lands,
the line drops into the left column with no restructuring.

Hijri date comes from `java.time.chrono.HijrahDate` (API 26 = minSdk), so no
library is added.

## Size

`targetCellWidth=4`, `targetCellHeight=1`; `minWidth=250dp`,
`minHeight=40dp`. Resizing stays horizontal-only — a 4×1 strip has no
meaningful taller form, and `StackView` cards do not reflow usefully.

## Day/night

Unchanged in approach: two layout files (`layout/`, `layout-night/`) with
**identical view ids**, and the provider picks text colors from the device
configuration. That invariant now spans four files rather than two, because the
card layout is also themed — it is the single most likely thing to drift, so a
test asserts the id sets match.

## Touch targets

`StackView` consumes horizontal swipes, so the card itself cannot also be a
whole-widget tap target without fighting the gesture. Instead:

- **The card** opens the app via the collection's
  `setPendingIntentTemplate` + per-item `setOnClickFillInIntent`, which is how
  a collection child must receive clicks.
- **The date column** opens the app with an ordinary
  `setOnClickPendingIntent`.

## Files

**Native**
- `PrayerWidgetProvider.kt` — renders the strip; delegates the deck to the
  factory. `selectForDisplay` loses its `slotCount` truncation and becomes the
  deck's ordering function.
- `PrayerDeckService.kt` *(new)* — `RemoteViewsService` + factory building one
  card per visible time, each with its own `Chronometer` base.
- `AndroidManifest.xml` — registers the service with
  `BIND_REMOTEVIEWS` permission (required; the launcher binds it).

**Resources**
- `layout/widget_prayer_times.xml`, `layout-night/…` — rebuilt as the strip.
- `layout/widget_prayer_card.xml`, `layout-night/…` *(new)* — one deck card.
- `drawable/widget_card_background_{light,dark}.xml` *(new)* — the card block.
- `xml/widget_prayer_times_info.xml` — 4×1, and `autoAdvanceViewId` left unset.

**Tests**
- `PrayerWidgetProviderTest` — updated for the untruncated ordering.
- `PrayerDeckServiceTest` *(new)* — the roll-to-tomorrow arithmetic, and the
  deck opening on the next prayer.

## Refresh

Unchanged: `updatePeriodMillis=0`, pushed from the alarm chain and the midnight
roll. One addition — the provider must call
`notifyAppWidgetViewDataChanged` on the `StackView` id, or the launcher
serves cached cards with yesterday's times and dead countdowns.

## What is explicitly not in scope

- The place name / location row (blocked on the page spec above).
- Qibla in the widget.
- Configuring the widget's own visible set separately from the app's.
