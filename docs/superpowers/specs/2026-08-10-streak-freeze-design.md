# Streak Freeze — Design

Date: 2026-08-10
Status: Implemented (2026-08-11). See "As built" at the end for the two rules
that changed during implementation.

## Problem

Rafeeq has two streaks — the Hifz session streak and the Quiz streak — and a
single recovery mechanism: miss a day, and you can buy it back by completing 2
sessions (or 2 quizzes) the following day. That mechanism is retroactive and
requires the user to notice the break and act within one day.

There is no cushion. A user with a 40-day streak who misses one day and doesn't
open the app the next day loses everything, with no warning and nothing they
could have done in advance.

This design adds a **streak freeze**: a small consumable inventory, earned by
doing more than the minimum, that silently absorbs a missed day.

## Terminology

The existing code already uses the word "freeze" for the retroactive buy-back:
`rafiq_hifz_streak_freeze_v1` and `rafiq_quiz_streak_freeze_v1` hold dates that
were bridged by doing 2 activities the next day. That is a misnomer.

Throughout this design and the code that implements it:

- **Repair** — the existing retroactive mechanism. Do 2 activities the day after
  a miss, and the missed day is bridged. Unchanged by this work.
- **Freeze** — the new consumable. Earned in advance, spent automatically when a
  day is missed.

The legacy `*_streak_freeze_v1` keys are **not renamed** — renaming would strand
data on existing installs. Each declaration gets a comment noting that the key
holds repaired days despite its name.

## Rules

### Pools

Two independent pools, one per streak. Each holds 0–2 freezes.

A pool is refilled only by its own activity: extra Hifz sessions refill Hifz
freezes, extra quizzes refill Quiz freezes. There is no cross-filling.

### Starting state

A missing token store reads as `count: 2`. Existing users therefore get both
freezes on the first launch after the update, with no migration step.

### Earning

On each recorded activity, let *n* be the number of activities completed for
that streak on that day, and let *threshold* be:

- `1` normally — the first activity of the day keeps the streak alive and earns
  nothing;
- `2` on a day where a repair was performed — the repair consumes the extra, so
  earning starts at the 3rd activity.

Freezes earned that day = `max(0, n - threshold)`, with the pool capped at 2.

`earnedOn[date]` is stored rather than blindly incrementing a counter, so the
value is recomputable and the operation is idempotent under repeated calls.

### Spending

One freeze per missed day, up to the 2 in the pool. Two consecutive missed days
consume both freezes and the streak survives. A third consecutive missed day
breaks the streak permanently.

**All or nothing.** Freezes are spent only when they can bridge the entire gap.
A partial spend would leave the newest missed day uncovered while making the day
before it active — which is exactly the state repair looks for. A user could
then freeze two days, repair the third, and carry a 3-day gap, contradicting the
rule above. **Freezes and repair never stack within one gap.**

Declining also means a user returning after a long lapse keeps their freezes for
the new streak rather than burning them on days long past, and never sees a
"a freeze covered <date>" notice for a date months ago.

Today is never covered — the day is not over. Nor is yesterday alone, for the
same reason: the streak is still alive until today ends.

### Freeze before repair

`settleFreezes()` runs on app open, so a miss is normally covered before the
user sees anything. `streakRecoveryInfo` then reports `recovered: true` and the
repair prompt never appears.

Repair surfaces only when the pool was empty at settle time. **No change is
required to the existing repair code.**

### Known consequence

With a full meter, a user can miss two days and never notice — the streak simply
does not break. The toast on spend, and the persistent spend notice in the
Account card, are what make the mechanic visible. This is intended.

## Data model

Two new localStorage keys, one per pool:

```
rafiq_hifz_freeze_tokens_v1
rafiq_quiz_freeze_tokens_v1
```

Each holds:

```ts
interface FreezePool {
  /** 0..2. Absent store reads as 2. */
  count: number;
  /** date (YYYY-MM-DD) -> freezes earned that day. Makes earning idempotent. */
  earnedOn: Record<string, number>;
  /** Dates covered by a spent freeze. Distinguishes frozen from repaired. */
  spentOn: string[];
}
```

A third new key supports Hifz earning (see "Hifz session counting" below):

```
rafiq_hifz_session_counts_v1   → Record<string, number>
```

### Where a spent freeze is recorded

When a freeze is spent, the covered date is written into the **existing**
bridged-dates store (`rafiq_*_streak_freeze_v1`). This means
`streakFromDateSet`, `computeStreakPersistent`, `computeQuizStreak`, and
`computeLongestQuizStreak` all continue to work with **zero changes** — a frozen
day counts toward the streak exactly as a repaired day already does.

`spentOn` in the token store is what distinguishes "this day was frozen" from
"this day was repaired", which the UI needs so it never labels an auto-covered
day as repaired.

### Date convention

All dates are the user's **local** calendar day, via
`src/app/core/utils/local-date.util.ts`.

The original code used `new Date().toISOString().slice(0, 10)`, which rolls the
day over at midnight UTC. For a user in UTC+3 that filed anything done between
00:00 and 03:00 local under the previous day — a session finished at 1am looked
like it belonged to yesterday, and a day genuinely completed could read as
missed. Freezes would make this worse by silently spending a token on a day the
user did not feel they missed.

This was fixed ahead of the freeze work, as its own change, across
`hifz.service.ts`, `quiz-streak.service.ts`, and `Hifz.tsx`. The one remaining
`toISOString` call, the backup filename in `backup.service.ts`, is intentionally
UTC.

**One-time boundary shift:** dates already stored under the UTC convention are
not migrated. A user east of UTC may see a single day at the transition that
reads as a gap or a doubled day. This is a one-off affecting at most one day,
and the freeze feature absorbs exactly this case, so no migration is built.

## Architecture

### New module

`src/app/core/services/storage/streak-freeze.service.ts`

The freeze rules live in one place, parameterised by pool (`"hifz" | "quiz"`),
rather than being duplicated into `hifz.service.ts` (already 1102 lines) and
`quiz-streak.service.ts`. The two existing services call into it.

Public surface:

```ts
type PoolId = "hifz" | "quiz";

/** Current freeze count for a pool. */
function freezeCount(pool: PoolId): number;

/** Full pool state, for UI that needs spentOn. */
function loadFreezePool(pool: PoolId): FreezePool;

/**
 * Award freezes for the activity just recorded. Idempotent per (pool, date):
 * recomputes from that day's activity count rather than incrementing.
 * Returns freezes earned by this call (0 or more) so the caller can toast.
 */
function earnFreezes(pool: PoolId, date: string, activityCount: number,
                     repairedToday: boolean): number;

/**
 * Scan backward from today to the last active day and spend one freeze per
 * missed day, oldest first, stopping at the first miss that cannot be covered.
 * Idempotent — days already bridged are skipped.
 * Returns the dates newly covered, so the caller can toast.
 */
function settleFreezes(pool: PoolId, activeDates: Set<string>): string[];

/** True when the given date was covered by a freeze rather than a repair. */
function wasFrozen(pool: PoolId, date: string): boolean;
```

### Lazy consumption

There is no server and no background job, so freezes cannot be spent at
midnight. `settleFreezes()` is the sole consumption point and runs:

- on app open, and
- after every recorded session or quiz completion.

It is idempotent: a day already present in the bridged-dates store is skipped,
so repeated calls are harmless.

### Hifz session counting

The quiz side already tracks per-day counts via `countQuizzesOnDate`, so the
quiz pool works immediately.

The Hifz side has `countSessionsToday(sessions)`, which reads from the *current
plan*. The plan is reset and replaced over time, and it only counts plan
sessions — so it is not a reliable basis for earning.

This design adds a per-day session-count store (`rafiq_hifz_session_counts_v1`)
written by `recordStreakDay`, mirroring the quiz side. This also makes
repair-day detection accurate.

## UI

All freeze UI lives in the Account → Streaks card. No Hifz-page badge, no
onboarding flow.

### Per streak, three elements

**1. The meter.** Two pips plus an explicit count — `❄ 2/2` — so the state reads
even if the pip styling alone is ambiguous.

**2. A state line that says what to do.** The count alone does not explain the
mechanic or how to recover from an empty meter. The line changes with state and
names the activity that fills *that* pool:

| State | Hifz | Quiz |
|---|---|---|
| 2/2 | Both freezes ready. A missed day won't break your streak. | Both freezes ready. A missed day won't break your streak. |
| 1/2 | 1 of 2 freezes. Do an extra session today to earn another. | 1 of 2 freezes. Do an extra quiz today to earn another. |
| 0/2 | No freezes left. Every extra session today earns one back. | No freezes left. Every extra quiz today earns one back. |

**3. A spend notice.** When `settleFreezes()` covers a day, the card shows
"A freeze covered Thursday" until the user next completes an activity for that
streak. The toast is transient and easily missed; the card is where a user goes
to check, so the information must persist there.

### Suppression

The freeze block is hidden entirely for a streak that has never been started —
no activity ever recorded. Otherwise a user who only does Hifz would see a
permanent 0/2 Quiz meter nagging them to do a quiz they don't want.

### Toast

An `IonToast` fires when a freeze is earned or auto-spent, following the
existing usage in `PageViewer.tsx` and the quiz test pages.

### Copy

Both languages, added to the `t.*` map in `Account.tsx` alongside the existing
streak strings. Arabic copy is written to match the register of the strings
already there — not machine-translated from the English.

### Styling

The `frontend-design` skill is invoked before any CSS is written, per project
convention. Per `CLAUDE.md`: no visible scrollbars, page width capped via
`var(--max-width-mobile, 600px)`, and any scrolling container accounts for
`var(--bottom-nav-height)`.

## Backup

The three new keys are added to `BACKED_UP_KEYS` in `backup.service.ts`:

```
rafiq_hifz_freeze_tokens_v1
rafiq_quiz_freeze_tokens_v1
rafiq_hifz_session_counts_v1
```

Without this, users lose their freezes when migrating devices. `restoreBackup`
needs no other change — the keys are plain localStorage values.

## Testing

Tests run on CRA's bundled Jest — `npx react-scripts test --watchAll=false`.
No test dependency needs installing; plain `.test.ts` files under `src/` are
picked up as-is.

Pure-function tests over `streak-freeze.service.ts` with an injected "today":

- earning caps at 2 and never exceeds it;
- the repair-day double-dip is blocked (threshold 2 on a repair day);
- `earnFreezes` is idempotent for a given (pool, date);
- one missed day consumes one freeze;
- two consecutive missed days consume both;
- three consecutive missed days break the streak;
- `settleFreezes()` is idempotent across repeated calls;
- `wasFrozen` distinguishes a frozen day from a repaired one.

Plus a backup round-trip test asserting the three new keys survive
export/restore.

## Out of scope

- Sharing freezes between the two pools.
- Purchasing or gifting freezes.
- Any first-run explanation of the mechanic beyond the state line.
- Renaming the legacy `*_streak_freeze_v1` keys.

## As built

Two rules changed during implementation, both after a bug the original design
would have shipped.

**Freezes spend all or nothing** (see the Spending section, already updated). The
first implementation spent them oldest-first and stopped when it ran out. That
left the newest missed day uncovered while making the day before it active,
which is exactly what repair looks for — so a user could freeze two days, repair
the third, and carry a 3-day gap that the design says must break the streak. The
test that was supposed to catch this only asserted `settleFreezes`' own return
value, so it passed while the system contradicted the spec. It is now tested end
to end through the quiz streak service.

**`settleFreezes` takes an `asOf` date.** Settling runs before recording, so the
day being recorded is not yet in the store. With a backdated completion, settle
treated that day as missed and spent a freeze on it. `asOf` bounds the scan to
the day being recorded.

Two things the design did not anticipate:

- **Repair was already broken after a plan reset.** `streakRecoveryInfo` counted
  today's sessions from the current plan, which is replaced on reset, so the
  count read 0 and repair was unreachable. It now prefers the new per-day store
  and falls back to the plan. This was a pre-existing bug, surfaced by the
  freeze work rather than caused by it.
- **The Hifz per-day store holds session ids, not a tally.** Completion is
  recorded both by seeding from historical sessions on load and by a
  done/undone/done toggle. A counter would have inflated under both and minted
  free freezes.

### Toasts as built

The toast listener is mounted once at the router outlet, not on the pages that
trigger it: `IonRouterOutlet` keeps visited pages mounted, so a per-page
listener fired once per page the user had already visited.

A freeze spent by settle-on-open produces **no toast** — both open-path callers
drop the return value. The card's spend notice reports it instead, which
persists where a toast at launch would likely be missed. Earning and
spending during an activity both toast as described above.

### Testing as built

80 tests across six files, run with CRA's bundled Jest
(`npx react-scripts test --watchAll=false`). `@testing-library/react` is not a
dependency, so the meter's copy and notice rules are tested as extracted pure
functions rather than by rendering.

### Not done

The app has not been built or run on a device — only tests and `tsc` were used
to verify. The meter's appearance on a real screen is unverified.
