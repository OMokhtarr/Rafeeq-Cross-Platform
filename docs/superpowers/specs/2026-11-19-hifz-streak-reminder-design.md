# Hifz Streak Reminder — Design

Date: 2026-11-19 · Size: small change (short design) · Status: approved

## Intent

A daily notification, at a time the user picks, reminding them to do their
hifz so they keep their streak. The time is picked on the main Hifz page.

## Goals

- One plain notification per day at the user's chosen time.
- Keeps arriving whether or not the app is opened (same reliability as the
  azkar and fasting reminders).
- Turned on/off and timed from the Hifz page's streak panel.

## Non-goals

- No check of whether today's hifz is already done — it fires every day
  (owner's choice: "a reminder is just a notification").
- No streak number in the text.
- No multiple times per day.
- No web/iOS reminders (none of the existing reminders exist there either).

## Anti-goals

- More than one notification per day.
- A reminder delivered hours late (e.g. after the phone was off all evening).

## Approaches

1. **Native scheduler, fires daily regardless (picked).** Mirrors
   `AzkarReminderScheduler`/`AzkarReminderReceiver`: native stores the switch
   and time, arms one alarm, the receiver posts and re-arms; boot re-arms.
2. Native scheduler + JS reports each counted streak day so the reminder skips
   done days. More useful, but adds a JS→native link; owner chose the plain
   notification.
3. `@capacitor/local-notifications` scheduled from JS. New dependency next to
   the existing native reminder stack; rejected.

## Design (decided)

**UI — Hifz page streak panel** (the `AccountModal` opened by the streak chip
in `Hifz.tsx`): below `StreakPanel`, a "Streak reminder" row with the shared
`Switch`, and a "Remind me at" row showing the time that opens the time
picker. Off by default; default time 21:00. Turning it on asks for
notification permission the same way the azkar switch does. Rendered only on
Android (where the native plugin exists).

**Notification:** title "Your hifz streak" / Arabic equivalent; text "Don't
break your streak — today's hifz is waiting." / Arabic equivalent. App
language, not device language (as `AzkarReminderReceiver`). Tap opens the
Hifz page through a `rafeeq://` VIEW deep link routed in the web layer.
Own notification channel.

**Native (`android/.../prayer/` alongside the other reminders):**
- Scheduler: stores enabled + time-of-day (minutes since midnight) in prefs;
  `scheduleNext` arms the next occurrence of that local time; `cancel`.
- Receiver: posts (best effort), always re-arms; lateness guard drops a
  delivery more than ~2 h late.
- Boot/time-change re-arm via the existing boot receiver path.
- Plugin methods `getStreakReminder` / `setStreakReminder` on
  `RafeeqPrayerPlugin`, same shape as the azkar/fasting pair.

## Left to the builder

- Exact Arabic copy (use the app's own terms for hifz/streak from
  `strings.ts`).
- Time picker mechanism (native time input in the WebView vs a plugin-backed
  dialog) — whichever matches the app's existing controls best.
- Exact alarm vs inexact: follow what azkar reminders do.
