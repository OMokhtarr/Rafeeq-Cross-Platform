# Hifz Streak Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily Android notification at a user-picked time reminding them to keep their hifz streak, set from the Hifz page's streak panel.

**Architecture:** A native self-re-arming alarm, copied from the azkar/fasting reminder chain (`PrayerConfig` prefs → scheduler arms one alarm → receiver posts + re-arms; boot and app launch re-arm). JS gets `get/set/enableStreakReminder` in `prayer-times.service.ts` and a `StreakReminderRow` component dropped into the streak panel `AccountModal` in `Hifz.tsx`. A tapped notification opens `/hifz` via `rafeeq://hifz`.

**Tech Stack:** Kotlin (AlarmManager, NotificationCompat, JUnit), Capacitor plugin `RafeeqPrayerPlugin`, React + TS, Jest (react-scripts).

**Spec:** `docs/superpowers/specs/2026-11-19-hifz-streak-reminder-design.md`

## Global Constraints

- Branch: `feat/hifz-streak-reminder`, created from `feat/sunnah-fasting-reminders` (both edit `RafeeqPrayerPlugin.kt`, `PrayerBootReceiver.kt`, `PrayerConfig.kt`, `App.tsx`). Do not commit the pre-existing unrelated changes in `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `src/app/features/prayer-times/AlarmsSheet.tsx`.
- Off by default; default time 21:00 → `minuteOfDay = 1260`.
- One notification per day; fires every day (no "already done today" check).
- Lateness guard: drop a delivery more than 2 h late (`MAX_LATENESS_MS = 2 * 60 * 60_000L`); always re-arm.
- Notification text in the app's language (`PrayerConfig.appLocale`), its own channel `rafeeq_hifz_streak`.
- Android only; the row is not rendered off-device.
- No `eslint-disable` comments; no visible scrollbars; Gold for text/borders, green only as fills (shared `Switch` already does this).
- JS tests: `$env:CI='true'; npx react-scripts test --watchAll=false <path>`. The user builds the app — ask before running Gradle (including unit tests).
- Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Picking a time already passed today → first reminder tomorrow, not immediately (Task 1 test `time already passed today goes to tomorrow`).
2. Changing the time while on → the old alarm is replaced, never two pending (same request code + `FLAG_UPDATE_CURRENT`; Task 1 plugin step re-arms on every `setStreakReminder`).
3. Notification permission denied → switch stays off and the denied note shows (Task 2 test `denied permission keeps it off and shows the note`).
4. Off-device (web/iOS) → no row at all (Task 2 test `renders nothing off-device`).
5. Phone off through the evening, delivered next morning → dropped by the lateness guard but still re-armed (Task 1 receiver; test `late delivery is dropped` on the pure `isLate` helper).

---

### Task 1: Native streak reminder (scheduler, receiver, plugin)

**Files:**
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/HifzStreakReminderScheduler.kt`
- Create: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/HifzStreakReminderReceiver.kt`
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerConfig.kt` (next to `fastingRemindersEnabled`)
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/RafeeqPrayerPlugin.kt` (header doc list, `load()` re-arm block, new methods after `setFastingReminders`)
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/prayer/PrayerBootReceiver.kt` (after `FastingReminderScheduler.scheduleNext`)
- Modify: `android/app/src/main/AndroidManifest.xml` (receiver after `FastingReminderReceiver`)
- Modify: `android/app/src/main/res/values/strings.xml`, `android/app/src/main/res/values-ar/strings.xml`
- Test: `android/app/src/test/java/com/rafeeq/quranquiz/prayer/HifzStreakReminderSchedulerTest.kt`

**Interfaces:**
- Produces (Kotlin):
  - `PrayerConfig.streakReminderEnabled(ctx): Boolean` (default false), `setStreakReminderEnabled(ctx, Boolean)`; `PrayerConfig.streakReminderMinute(ctx): Int` (default 1260), `setStreakReminderMinute(ctx, Int)`. Keys `streak_reminder_enabled`, `streak_reminder_minute`.
  - `HifzStreakReminderScheduler.nextAt(now: Date, tz: TimeZone, minuteOfDay: Int): Date` (internal, pure), `isLate(firedAt: Long, slotAt: Long): Boolean` (internal, pure), `scheduleNext(ctx)`, `cancel(ctx)`; `const val EXTRA_SLOT_AT = "streak_slot_at"`.
- Produces (plugin, consumed by Task 2): `getStreakReminder() → { enabled: boolean, minuteOfDay: number }`; `setStreakReminder({ enabled: boolean, minuteOfDay?: number })` — rejects without `enabled`; rejects `minuteOfDay` outside 0..1439.

- [ ] **Step 1: Branch.** `git switch -c feat/hifz-streak-reminder` (from `feat/sunnah-fasting-reminders`). Confirm request codes `4600`/notification id `4601` are unused: `git grep -n "460[01]" android/` returns nothing.

- [ ] **Step 2: Write the failing test** `HifzStreakReminderSchedulerTest` (tz `Africa/Cairo`, `at(date, h, m)` helper as in `FastingReminderSchedulerTest`):
  - `time later today fires today`: now 2026-12-07 18:00, minute 1260 → 2026-12-07 21:00.
  - `time already passed today goes to tomorrow`: now 2026-12-07 22:00, minute 1260 → 2026-12-08 21:00.
  - `exactly now goes to tomorrow`: now 2026-12-07 21:00:00.000 → 2026-12-08 21:00.
  - `minutes are honoured`: now 2026-12-07 06:00, minute 7*60+45 → 2026-12-07 07:45.
  - `late delivery is dropped`: `isLate(slot + 2h + 1ms, slot)` true; `isLate(slot + 2h, slot)` false; `isLate(x, 0L)` false (no extra → not late).

- [ ] **Step 3: Run it to verify it fails** (ask the user first): `cd android; ./gradlew :app:testDebugUnitTest --tests "*HifzStreakReminderSchedulerTest*"` → FAIL, unresolved `HifzStreakReminderScheduler`.

- [ ] **Step 4: Implement `HifzStreakReminderScheduler`** modelled on `AzkarReminderScheduler`: `REQUEST_CODE = 4600`; `nextAt` sets `HOUR_OF_DAY`/`MINUTE` from `minuteOfDay` on today's `Calendar` in `tz` (seconds/ms zeroed), adds one day if not strictly after `now`; `scheduleNext` no-ops when disabled, else `PrayerAlarmScheduler.setAlarm(ctx, at, pendingIntent(ctx, at))` with `EXTRA_SLOT_AT`; `cancel` cancels the same `PendingIntent`. `MAX_LATENESS_MS` lives here for `isLate`.

- [ ] **Step 5: Implement `HifzStreakReminderReceiver`** copied from `AzkarReminderReceiver`: `CHANNEL_ID = "rafeeq_hifz_streak"`, notification id `4601`, `TAG = "RafeeqStreak"`; post unless `isLate`, inside try/catch; always `HifzStreakReminderScheduler.scheduleNext`. Content intent: `ACTION_VIEW`, `Uri.parse("rafeeq://hifz")`, to `MainActivity`. Strings:

  | name | en | ar |
  |---|---|---|
  | `streak_reminder_channel` | Hifz streak reminder | تذكير سلسلة المواظبة |
  | `streak_reminder_title` | Your hifz streak | سلسلة المواظبة على الحفظ |
  | `streak_reminder_text` | Don\'t break your streak: today\'s hifz is waiting. | لا تقطع سلسلتك، حفظ اليوم بانتظارك. |

- [ ] **Step 6: Wire it up.** `PrayerConfig` getters/setters; manifest `<receiver android:name=".prayer.HifzStreakReminderReceiver" android:exported="false" />`; `HifzStreakReminderScheduler.scheduleNext(context)` in `PrayerBootReceiver` and in the plugin's `load()` re-arm block; plugin `getStreakReminder`/`setStreakReminder` like the fasting pair — `setStreakReminder` stores `minuteOfDay` if present, stores `enabled`, then `scheduleNext` when enabled (this replaces any pending alarm) or `cancel` when not. Add both to the header doc list. Location/method changes do **not** re-arm it (fixed clock time).

- [ ] **Step 7: Run the test to verify it passes** (same command) → PASS.

- [ ] **Step 8: Commit**
  ```bash
  git add android/app/src/main/java/com/rafeeq/quranquiz/prayer/HifzStreakReminder*.kt android/app/src/main/java/com/rafeeq/quranquiz/prayer/{PrayerConfig,RafeeqPrayerPlugin,PrayerBootReceiver}.kt android/app/src/main/AndroidManifest.xml android/app/src/main/res/values*/strings.xml android/app/src/test/java/com/rafeeq/quranquiz/prayer/HifzStreakReminderSchedulerTest.kt
  git commit -m "feat(hifz): daily streak reminder alarm on Android"
  ```

### Task 2: Streak reminder row on the Hifz page

**Files:**
- Modify: `src/app/core/services/prayer/prayer-times.service.ts` (plugin interface + functions after the fasting ones)
- Create: `src/app/features/hifz/StreakReminderRow.tsx`, styles in `src/app/features/hifz/Hifz.css`
- Modify: `src/app/features/hifz/Hifz.tsx:1361-1363` (render `<StreakReminderRow lang={lang} />` under `<StreakPanel …/>` inside `.hifz-streak-panel`)
- Modify: `src/app/core/i18n/strings.ts` (`hifz` block, interface + ar + en)
- Modify: `src/App.tsx` (deep-link handler, next to `rafeeq://tracker`)
- Test: `src/app/features/hifz/__tests__/StreakReminderRow.test.tsx`

**Interfaces:**
- Consumes: Task 1 plugin methods.
- Produces (`prayer-times.service.ts`):
  - `interface StreakReminder { enabled: boolean; minuteOfDay: number }`
  - `getStreakReminder(): Promise<StreakReminder>` — off-device `{ enabled: false, minuteOfDay: 1260 }`.
  - `setStreakReminder(r: StreakReminder): Promise<void>` — off-device no-op.
  - `enableStreakReminder(minuteOfDay: number): Promise<boolean>` — same body shape as `enableFastingReminders` (permission → set → best-effort `requestExactAlarm`); false when denied or off-device.
  - `isNativeReminders(): boolean` — exported `isNative`, so the row can hide itself and tests can mock it.
- `StreakReminderRow: React.FC<{ lang: string }>`.
- Strings in `hifz`: `streakReminder` ("Streak reminder" / "تذكير سلسلة المواظبة"), `streakReminderAt` ("Remind me at" / "ذكّرني الساعة"). The denied note reuses `STRINGS[lang].settings.notificationsDenied`.

- [ ] **Step 1: Write the failing test** `StreakReminderRow.test.tsx` (render with `createRoot` + `act` like `Settings.fasting.test.tsx`; mock the four service functions):
  - `renders nothing off-device`: `isNativeReminders` → false ⇒ container empty.
  - `shows the stored state and time`: get → `{ enabled: true, minuteOfDay: 1260 }` ⇒ switch checked, text `formatClock(<21:00 today>, "en")` visible.
  - `turning on asks permission and keeps the time`: get → off/1260; toggle ⇒ `enableStreakReminder` called with `1260`; switch checked.
  - `denied permission keeps it off and shows the note`: `enableStreakReminder` → false ⇒ switch unchecked, `STRINGS.en.settings.notificationsDenied` visible.
  - `turning off saves off with the time`: get → on/1260; toggle ⇒ `setStreakReminder({ enabled: false, minuteOfDay: 1260 })`.
  - `picking a time saves it`: change the time input to `"07:45"` ⇒ `setStreakReminder({ enabled: <current>, minuteOfDay: 465 })` and the shown time updates.

- [ ] **Step 2: Run it to verify it fails:** `$env:CI='true'; npx react-scripts test --watchAll=false src/app/features/hifz/__tests__/StreakReminderRow.test.tsx` → FAIL, module not found.

- [ ] **Step 3: Implement the service functions** in `prayer-times.service.ts` (interface methods `getStreakReminder`, `setStreakReminder` on `RafeeqPrayerPlugin`).

- [ ] **Step 4: Implement `StreakReminderRow`.** Two rows: label + shared `Switch` (label `h.streakReminder`); "Remind me at" + a button showing `formatClock` (from `features/prayer-times/alarmFormat`) that opens a visually hidden `<input type="time" step="60">` via `showPicker()` (fall back to `click()`); its `onChange` parses `HH:MM` → `minuteOfDay` and calls `setStreakReminder` with the current `enabled` (when off, storing the time is harmless — native only arms when enabled). The time row shows always, so the time can be set before switching on. Loads state once on mount. Re-read on `visibilitychange` (user may grant permission in system settings), as Settings does.

- [ ] **Step 5: Mount it and route the deep link.** Add the row inside the streak panel in `Hifz.tsx`; in `App.tsx` add `if (url === "rafeeq://hifz") { historyRef.current.push("/hifz"); return; }` and mention it in the comment above. Add the two `hifz` strings.

- [ ] **Step 6: Run the tests to verify they pass:** the Step 2 command → PASS; then the Hifz suite `$env:CI='true'; npx react-scripts test --watchAll=false src/app/features/hifz` → PASS (the existing Hifz tests mock `prayer-times.service` only if they import it — add the four functions to any mock that breaks).

- [ ] **Step 7: Commit**
  ```bash
  git add src/app/core/services/prayer/prayer-times.service.ts src/app/features/hifz/StreakReminderRow.tsx src/app/features/hifz/Hifz.css src/app/features/hifz/Hifz.tsx src/app/core/i18n/strings.ts src/App.tsx src/app/features/hifz/__tests__/StreakReminderRow.test.tsx
  git commit -m "feat(hifz): pick a daily streak reminder time on the Hifz page"
  ```

  Implementation note: the state/permission logic lives in a hook `useStreakReminder()` in `src/app/features/hifz/useStreakReminder.ts` returning `{ visible: boolean; enabled: boolean; minuteOfDay: number; denied: boolean; toggle(on: boolean): Promise<void>; setMinute(m: number): Promise<void> }`, so Task 3 reuses it. The time-input button is its own small component `StreakReminderTime` (`{ minuteOfDay, lang, label, onChange }`) exported from `StreakReminderRow.tsx`.

### Task 3: Streak reminder in Settings → Notifications

Owner asked (2026-11-19) for the switch in Settings too, next to the other reminders, and for the exact-alarm/battery warnings to count it.

**Files:**
- Modify: `src/app/features/settings/Settings.tsx` (ToggleRow after the fasting one; `remindersOn`)
- Modify: `src/app/core/i18n/strings.ts` (`settings.streakReminder`, `settings.streakReminderDesc`)
- Modify: `src/app/features/settings/__tests__/Settings.fasting.test.tsx`, `Settings.sync.test.tsx` (add the new service mocks)
- Test: `src/app/features/settings/__tests__/Settings.streak.test.tsx`

**Interfaces:** Consumes `useStreakReminder`, `StreakReminderTime` from Task 2.

- [ ] **Step 1: Write the failing test** `Settings.streak.test.tsx` (same harness as `Settings.fasting.test.tsx`):
  - `shows the streak reminder switch`: label `ts.streakReminder` present.
  - `turning it on enables with the stored time`: toggle ⇒ `enableStreakReminder(1260)`.
  - `counts toward the exact-alarm warning`: only the streak reminder on + health `exactAlarms: false` ⇒ `ts.exactAlarmsDesc` visible.
- [ ] **Step 2: Run it to verify it fails** → FAIL.
- [ ] **Step 3: Implement.** ToggleRow (icon `ICONS.bell` or nearest existing, label `streakReminder` "Hifz Streak Reminder" / "تذكير سلسلة المواظبة", desc "A daily reminder to keep your hifz streak" / "تنبيه يومي للمحافظة على سلسلة المواظبة في الحفظ"); when on, a `StreakReminderTime` row under it; denied note like fasting; `remindersOn` includes `streak.enabled`.
- [ ] **Step 4: Run Settings tests** `$env:CI='true'; npx react-scripts test --watchAll=false src/app/features/settings` → PASS.
- [ ] **Step 5: Commit** `feat(settings): hifz streak reminder switch in Notifications`.
