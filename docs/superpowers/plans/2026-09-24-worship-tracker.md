# Worship Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, local-only daily worship tracker (متابعة العبادات) reachable from the More page.

**Architecture:** Pure logic (catalog, Fajr-based day key, unlock rules, fasting occasions, scoring) sits in dependency-free TS files under `src/app/features/tracker/` with Jest tests. A small localStorage store keeps ticked items for the last 7 days plus the section toggles. One Ionic page renders them and reuses the existing `AccountModal` for the Settings and Info sheets.

**Tech Stack:** React 18 + Ionic React, react-router v5, TypeScript 4.9, Jest via `react-scripts test`, `Intl.DateTimeFormat` (`islamic-umalqura`), existing `loadPrayerDay()` from `src/app/core/services/prayer/prayer-times.service.ts`.

**Spec:** `docs/superpowers/specs/2026-09-24-worship-tracker-design.md`

## Global Constraints

- All data local-only (localStorage). No network, no account.
- Page container caps width with `max-width: var(--max-width-mobile, 600px); margin: 0 auto;` — never a hard-coded pixel width.
- Scrolling container has `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`; the page renders `<BottomNavBar active="more" fixed />`.
- No visible scrollbars. No scrollbar styling added (global rule in `src/index.css` covers it).
- No `// eslint-disable` comments of any kind.
- Every user-visible string lives in `src/app/core/i18n/strings.ts` under a new `tracker` key, in both `ar` and `en`.
- No "Other" (أخرى) section, no custom items, no editing past days, no streaks, no notifications.
- Do not run `npm run build`, `cap sync` or gradle. The user builds the app.
- Gate for each task: the named Jest tests pass (`npx react-scripts test --watchAll=false <path>`) and `npx tsc --noEmit --noUnusedLocals` is clean.

## Review Focus

1. **Before Fajr (00:00–Fajr):** the page shows the previous day's key, its ticks, and all its items unlocked. Pinned in Task 2 (`trackingDayKey`, `isUnlocked` with `isPreviousDay`).
2. **No location / web build (`hasLocation:false`) or a missing time key (high latitude):** nothing is locked, and the page doesn't crash. Pinned in Task 2 (`isUnlocked` with `times=null` and with a missing key).
3. **Eid falling on a Monday or Thursday or a White Day:** no fasting section. Pinned in Task 2 (`fastingOccasion`).
4. **Corrupt or foreign localStorage JSON:** the store returns defaults instead of throwing. Pinned in Task 3.
5. **All optional sections turned off:** prayers are worth 100%, and a settings toggle never produces NaN or a percentage over 100. Pinned in Task 2 (`sectionShares`, `dayScore`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/features/tracker/trackerCatalog.ts` (create) | Section and item data and unlock anchors. No logic. |
| `src/app/features/tracker/trackerLogic.ts` (create) | Pure functions: day key, unlock, fasting occasion, shares and score. |
| `src/app/features/tracker/__tests__/trackerLogic.test.ts` (create) | Jest tests for the logic. |
| `src/app/features/tracker/trackerStore.ts` (create) | localStorage read, write and prune for ticks and settings. |
| `src/app/features/tracker/__tests__/trackerStore.test.ts` (create) | Jest tests for the store. |
| `src/app/features/tracker/WorshipTracker.tsx` + `WorshipTracker.css` (create) | The page. |
| `src/app/features/tracker/TrackerSettingsSheet.tsx` (create) | Section toggles sheet. |
| `src/app/features/tracker/TrackerInfoSheet.tsx` (create) | Explainer sheet. |
| `src/app/core/i18n/strings.ts` (modify) | `tracker` strings and `more.tracker` label. |
| `src/App.tsx` (modify) | `/tracker` route. |
| `src/app/features/more/More.tsx` (modify) | New card. |

---

### Task 1: Catalog

**Files:**
- Create: `src/app/features/tracker/trackerCatalog.ts`

**Interfaces:**
- Consumes: `PrayerKey` from `src/app/core/services/prayer/prayer-times.types.ts`
- Produces: `SectionId`, `ItemId`, `Unlock`, `TrackerItem`, `TrackerSection`, `SECTIONS`, `OPTIONAL_SECTIONS`

- [ ] **Step 1: Write the catalog**

```ts
/**
 * WORSHIP TRACKER CATALOG
 * The sections and items the tracker offers, and when each one opens.
 * Pure data: the rules that read it live in trackerLogic.ts.
 *
 * `unlock` names the prayer time that opens an item on the current tracking
 * day; "duha" means the duha time (falling back to sunrise + 15 min) and
 * null means always open.
 */
import type { PrayerKey } from "../../core/services/prayer/prayer-times.types";

export type SectionId =
  | "prayers"
  | "azkar"
  | "quran"
  | "daily"
  | "rawatib"
  | "fasting";

export type ItemId =
  | "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"
  | "azkarMorning" | "azkarEvening" | "azkarSleep"
  | "quranDaily"
  | "duha"
  | "sunnahFajr" | "sunnahDhuhrBefore" | "sunnahDhuhrAfter"
  | "sunnahMaghrib" | "sunnahIsha" | "qiyam" | "witr"
  | "fastToday";

export type Unlock = Extract<PrayerKey, "fajr" | "dhuhr" | "asr" | "maghrib" | "isha" | "duha"> | null;

export interface TrackerItem {
  id: ItemId;
  unlock: Unlock;
  /** Route opened on long-press, if any. "quran" resolves at runtime (Al-Kahf on Fridays). */
  longPress?: "azkarMorningEvening" | "azkarSleep" | "quran";
}

export interface TrackerSection {
  id: SectionId;
  items: TrackerItem[];
}

export const SECTIONS: TrackerSection[] = [
  {
    id: "prayers",
    items: [
      { id: "fajr", unlock: "fajr" },
      { id: "dhuhr", unlock: "dhuhr" },
      { id: "asr", unlock: "asr" },
      { id: "maghrib", unlock: "maghrib" },
      { id: "isha", unlock: "isha" },
    ],
  },
  {
    id: "azkar",
    items: [
      { id: "azkarMorning", unlock: "fajr", longPress: "azkarMorningEvening" },
      { id: "azkarEvening", unlock: "asr", longPress: "azkarMorningEvening" },
      { id: "azkarSleep", unlock: "isha", longPress: "azkarSleep" },
    ],
  },
  { id: "quran", items: [{ id: "quranDaily", unlock: null, longPress: "quran" }] },
  { id: "daily", items: [{ id: "duha", unlock: "duha" }] },
  {
    id: "rawatib",
    items: [
      { id: "sunnahFajr", unlock: "fajr" },
      { id: "sunnahDhuhrBefore", unlock: "dhuhr" },
      { id: "sunnahDhuhrAfter", unlock: "dhuhr" },
      { id: "sunnahMaghrib", unlock: "maghrib" },
      { id: "sunnahIsha", unlock: "isha" },
      { id: "qiyam", unlock: "isha" },
      { id: "witr", unlock: "isha" },
    ],
  },
  { id: "fasting", items: [{ id: "fastToday", unlock: null }] },
];

/** Every section the user may switch off; prayers are always counted. */
export const OPTIONAL_SECTIONS: SectionId[] = ["azkar", "quran", "rawatib", "daily", "fasting"];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --noUnusedLocals`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/tracker/trackerCatalog.ts
git commit -m "add the worship tracker catalog"
```

---

### Task 2: Pure logic

**Files:**
- Create: `src/app/features/tracker/trackerLogic.ts`
- Test: `src/app/features/tracker/__tests__/trackerLogic.test.ts`

**Interfaces:**
- Consumes: `SECTIONS`, `SectionId`, `ItemId`, `TrackerItem` (Task 1); `PrayerKey`
- Produces:
  - `toDayKey(d: Date): string` returns local `YYYY-MM-DD`.
  - `trackingDate(now: Date, fajrToday?: Date): Date` returns local midnight of the tracking day.
  - `trackingDayKey(now: Date, fajrToday?: Date): string`
  - `isUnlocked(item: TrackerItem, now: Date, times: Partial<Record<PrayerKey, Date>> | null, isPreviousDay: boolean): boolean`
  - `type FastingOccasion = "ramadan" | "arafah" | "ashura" | "tasua" | "shawwal" | "whiteDays" | "monday" | "thursday"`
  - `hijriParts(d: Date): { day: number; month: number }`
  - `fastingOccasion(d: Date): FastingOccasion | null`
  - `visibleSections(d: Date, enabled: Record<SectionId, boolean>): SectionId[]`
  - `sectionShares(visible: SectionId[]): Partial<Record<SectionId, number>>` (fractions summing to 1)
  - `dayScore(ticked: ItemId[], visible: SectionId[]): number` (integer 0–100)

- [ ] **Step 1: Write the failing tests**

```ts
import {
  toDayKey, trackingDayKey, isUnlocked, hijriParts, fastingOccasion,
  visibleSections, sectionShares, dayScore,
} from "../trackerLogic";
import { SECTIONS, SectionId } from "../trackerCatalog";

const item = (id: string) =>
  SECTIONS.flatMap((s) => s.items).find((i) => i.id === id)!;
const allOn: Record<SectionId, boolean> = {
  prayers: true, azkar: true, quran: true, daily: true, rawatib: true, fasting: true,
};

describe("trackingDayKey", () => {
  const fajr = new Date(2026, 8, 24, 4, 30);
  it("is today after Fajr", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 10, 0), fajr)).toBe("2026-09-24");
  });
  it("is yesterday between midnight and Fajr", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 2, 0), fajr)).toBe("2026-09-23");
  });
  it("falls back to the calendar day without a Fajr time", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 2, 0))).toBe("2026-09-24");
  });
  it("pads months and days", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isUnlocked", () => {
  const times = {
    fajr: new Date(2026, 8, 24, 4, 30),
    sunrise: new Date(2026, 8, 24, 5, 50),
    dhuhr: new Date(2026, 8, 24, 11, 50),
    isha: new Date(2026, 8, 24, 19, 10),
  };
  const noon = new Date(2026, 8, 24, 12, 0);
  it("opens once the anchor time passes", () => {
    expect(isUnlocked(item("dhuhr"), noon, times, false)).toBe(true);
    expect(isUnlocked(item("witr"), noon, times, false)).toBe(false);
  });
  it("uses sunrise + 15 min for duha when no duha time exists", () => {
    expect(isUnlocked(item("duha"), new Date(2026, 8, 24, 6, 0), times, false)).toBe(false);
    expect(isUnlocked(item("duha"), new Date(2026, 8, 24, 6, 5), times, false)).toBe(true);
  });
  it("always opens items with no anchor", () => {
    expect(isUnlocked(item("quranDaily"), new Date(2026, 8, 24, 5, 0), times, false)).toBe(true);
  });
  it("opens everything when there are no times", () => {
    expect(isUnlocked(item("witr"), noon, null, false)).toBe(true);
  });
  it("opens an item whose anchor key is missing", () => {
    expect(isUnlocked(item("asr"), noon, times, false)).toBe(true);
  });
  it("opens everything on the previous day (before Fajr)", () => {
    expect(isUnlocked(item("witr"), new Date(2026, 8, 24, 2, 0), times, true)).toBe(true);
  });
});

describe("fastingOccasion", () => {
  // Find a Gregorian date with the given Hijri month/day by scanning, so the
  // test doesn't hard-code a calendar conversion.
  const findHijri = (month: number, day: number): Date => {
    const d = new Date(2026, 0, 1);
    for (let i = 0; i < 800; i++) {
      const p = hijriParts(d);
      if (p.month === month && p.day === day) return new Date(d);
      d.setDate(d.getDate() + 1);
    }
    throw new Error("not found");
  };
  it("names Ramadan", () => expect(fastingOccasion(findHijri(9, 5))).toBe("ramadan"));
  it("names Arafah", () => expect(fastingOccasion(findHijri(12, 9))).toBe("arafah"));
  it("names Ashura and Tasu'a", () => {
    expect(fastingOccasion(findHijri(1, 10))).toBe("ashura");
    expect(fastingOccasion(findHijri(1, 9))).toBe("tasua");
  });
  it("names Shawwal but never Eid al-Fitr", () => {
    expect(fastingOccasion(findHijri(10, 2))).toBe("shawwal");
    expect(fastingOccasion(findHijri(10, 1))).toBeNull();
  });
  it("never offers Eid al-Adha or the Tashreeq days, even on a White Day", () => {
    [10, 11, 12, 13].forEach((d) => expect(fastingOccasion(findHijri(12, d))).toBeNull());
  });
  it("names the White Days in an ordinary month", () => {
    expect(fastingOccasion(findHijri(4, 13))).toBe("whiteDays");
  });
  it("names Monday and Thursday otherwise, and null for other days", () => {
    const d = findHijri(4, 20);
    for (let i = 0; i < 7; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      const dow = day.getDay();
      const expected = dow === 1 ? "monday" : dow === 4 ? "thursday" : null;
      const h = hijriParts(day).day;
      if (h >= 13 && h <= 15) continue;
      expect(fastingOccasion(day)).toBe(expected);
    }
  });
});

describe("scoring", () => {
  const ordinaryTuesday = (() => {
    const d = new Date(2026, 0, 1);
    while (!(d.getDay() === 2 && fastingOccasion(d) === null)) d.setDate(d.getDate() + 1);
    return d;
  })();

  it("hides fasting on a non-occasion day", () => {
    expect(visibleSections(ordinaryTuesday, allOn)).not.toContain("fasting");
  });
  it("hides switched-off sections but always keeps prayers", () => {
    const off = { ...allOn, azkar: false, prayers: false };
    const v = visibleSections(ordinaryTuesday, off);
    expect(v).toContain("prayers");
    expect(v).not.toContain("azkar");
  });
  it("gives prayers 50% and splits the rest equally", () => {
    const s = sectionShares(["prayers", "azkar", "quran", "daily", "rawatib"]);
    expect(s.prayers).toBe(0.5);
    expect(s.azkar).toBeCloseTo(0.125);
  });
  it("gives prayers 100% when nothing else is on", () => {
    expect(sectionShares(["prayers"])).toEqual({ prayers: 1 });
    expect(dayScore(["fajr", "dhuhr"], ["prayers"])).toBe(40);
  });
  it("scores within each section by ticked/total", () => {
    // prayers 5/5 → 50, quran 1/1 → 25, azkar 0/3 → 0
    expect(dayScore(["fajr", "dhuhr", "asr", "maghrib", "isha", "quranDaily"],
      ["prayers", "quran", "azkar"])).toBe(75);
  });
  it("ignores ticks for sections that aren't visible and never exceeds 100", () => {
    expect(dayScore(["fajr", "dhuhr", "asr", "maghrib", "isha", "fastToday"], ["prayers"])).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx react-scripts test --watchAll=false src/app/features/tracker/__tests__/trackerLogic.test.ts`
Expected: FAIL with "Cannot find module '../trackerLogic'".

- [ ] **Step 3: Implement**

```ts
/**
 * WORSHIP TRACKER LOGIC
 * Pure rules over the catalog: which day is being tracked, what is open,
 * whether today is a recommended fast, and how the day is scored.
 *
 * A tracking day starts at Fajr, not midnight, so Qiyam and Witr prayed
 * after midnight still land on the night they belong to.
 */
import type { PrayerKey } from "../../core/services/prayer/prayer-times.types";
import { SECTIONS, SectionId, ItemId, TrackerItem } from "./trackerCatalog";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function trackingDate(now: Date, fajrToday?: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (fajrToday && now < fajrToday) d.setDate(d.getDate() - 1);
  return d;
}

export function trackingDayKey(now: Date, fajrToday?: Date): string {
  return toDayKey(trackingDate(now, fajrToday));
}

const DUHA_AFTER_SUNRISE_MS = 15 * 60 * 1000;

export function isUnlocked(
  item: TrackerItem,
  now: Date,
  times: Partial<Record<PrayerKey, Date>> | null,
  isPreviousDay: boolean,
): boolean {
  // Before Fajr every anchor of the tracked (previous) day has already passed.
  if (!item.unlock || !times || isPreviousDay) return true;
  let at = times[item.unlock];
  if (item.unlock === "duha" && !at && times.sunrise) {
    at = new Date(times.sunrise.getTime() + DUHA_AFTER_SUNRISE_MS);
  }
  // A missing time (high latitude, web) must not lock the user out.
  return !at || now >= at;
}

export type FastingOccasion =
  | "ramadan" | "arafah" | "ashura" | "tasua"
  | "shawwal" | "whiteDays" | "monday" | "thursday";

const hijriFormat = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric",
  month: "numeric",
});

export function hijriParts(d: Date): { day: number; month: number } {
  const parts = hijriFormat.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: get("day"), month: get("month") };
}

export function fastingOccasion(d: Date): FastingOccasion | null {
  const { day, month } = hijriParts(d);
  // Fasting is prohibited on both Eids and the days of Tashreeq.
  if (month === 10 && day === 1) return null;
  if (month === 12 && day >= 10 && day <= 13) return null;

  if (month === 9) return "ramadan";
  if (month === 12 && day === 9) return "arafah";
  if (month === 1 && day === 10) return "ashura";
  if (month === 1 && day === 9) return "tasua";
  if (month === 10) return "shawwal";
  if (day >= 13 && day <= 15) return "whiteDays";
  if (d.getDay() === 1) return "monday";
  if (d.getDay() === 4) return "thursday";
  return null;
}

export function visibleSections(d: Date, enabled: Record<SectionId, boolean>): SectionId[] {
  return SECTIONS.map((s) => s.id).filter((id) => {
    if (id === "prayers") return true;
    if (!enabled[id]) return false;
    return id !== "fasting" || fastingOccasion(d) !== null;
  });
}

export function sectionShares(visible: SectionId[]): Partial<Record<SectionId, number>> {
  const others = visible.filter((id) => id !== "prayers");
  if (others.length === 0) return { prayers: 1 };
  const shares: Partial<Record<SectionId, number>> = { prayers: 0.5 };
  others.forEach((id) => (shares[id] = 0.5 / others.length));
  return shares;
}

export function dayScore(ticked: ItemId[], visible: SectionId[]): number {
  const shares = sectionShares(visible);
  const done = new Set(ticked);
  const total = SECTIONS.reduce((sum, s) => {
    const share = shares[s.id];
    if (!share) return sum;
    const n = s.items.filter((i) => done.has(i.id)).length;
    return sum + (n / s.items.length) * share;
  }, 0);
  return Math.min(100, Math.round(total * 100));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx react-scripts test --watchAll=false src/app/features/tracker/__tests__/trackerLogic.test.ts`
Expected: all PASS. Then run `npx tsc --noEmit --noUnusedLocals`, which should be clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/tracker/trackerLogic.ts src/app/features/tracker/__tests__/trackerLogic.test.ts
git commit -m "add the worship tracker's day, unlock, fasting and scoring rules"
```

---

### Task 3: Local store

**Files:**
- Create: `src/app/features/tracker/trackerStore.ts`
- Test: `src/app/features/tracker/__tests__/trackerStore.test.ts`

**Interfaces:**
- Consumes: `ItemId`, `SectionId`, `OPTIONAL_SECTIONS` (Task 1)
- Produces:
  - `loadDays(): Record<string, ItemId[]>`
  - `toggleItem(dayKey: string, id: ItemId): Record<string, ItemId[]>` (returns the new map, pruned to the 7 newest keys)
  - `loadSettings(): Record<SectionId, boolean>` (defaults: all true)
  - `saveSettings(s: Record<SectionId, boolean>): void`

- [ ] **Step 1: Write the failing tests**

```ts
import { loadDays, toggleItem, loadSettings, saveSettings } from "../trackerStore";

beforeEach(() => localStorage.clear());

describe("days", () => {
  it("starts empty", () => expect(loadDays()).toEqual({}));
  it("toggles an item on and off", () => {
    expect(toggleItem("2026-09-24", "fajr")["2026-09-24"]).toEqual(["fajr"]);
    expect(toggleItem("2026-09-24", "fajr")["2026-09-24"]).toEqual([]);
    expect(loadDays()["2026-09-24"]).toEqual([]);
  });
  it("keeps only the 7 newest days", () => {
    for (let d = 10; d <= 18; d++) toggleItem(`2026-09-${d}`, "fajr");
    const keys = Object.keys(loadDays()).sort();
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-09-12");
  });
  it("survives corrupt JSON", () => {
    localStorage.setItem("rafeeq.tracker.days", "{not json");
    expect(loadDays()).toEqual({});
    localStorage.setItem("rafeeq.tracker.days", "[1,2]");
    expect(loadDays()).toEqual({});
  });
});

describe("settings", () => {
  it("defaults every section on", () => {
    expect(loadSettings()).toEqual({
      prayers: true, azkar: true, quran: true, daily: true, rawatib: true, fasting: true,
    });
  });
  it("round-trips and always keeps prayers on", () => {
    saveSettings({ ...loadSettings(), azkar: false, prayers: false });
    expect(loadSettings().azkar).toBe(false);
    expect(loadSettings().prayers).toBe(true);
  });
  it("survives corrupt JSON", () => {
    localStorage.setItem("rafeeq.tracker.settings", "nope");
    expect(loadSettings().quran).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx react-scripts test --watchAll=false src/app/features/tracker/__tests__/trackerStore.test.ts`
Expected: FAIL with "Cannot find module '../trackerStore'".

- [ ] **Step 3: Implement**

```ts
/**
 * WORSHIP TRACKER STORE
 * Local-only persistence: which items were ticked on each tracking day, and
 * which sections count. Only the last 7 days are kept, which is all the
 * header strip ever shows.
 */
import { ItemId, SectionId, OPTIONAL_SECTIONS } from "./trackerCatalog";

const DAYS_KEY = "rafeeq.tracker.days";
const SETTINGS_KEY = "rafeeq.tracker.settings";
const KEEP_DAYS = 7;

function readObject(key: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadDays(): Record<string, ItemId[]> {
  const raw = readObject(DAYS_KEY);
  const days: Record<string, ItemId[]> = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (Array.isArray(v)) days[k] = v.filter((x): x is ItemId => typeof x === "string");
  });
  return days;
}

export function toggleItem(dayKey: string, id: ItemId): Record<string, ItemId[]> {
  const days = loadDays();
  const current = days[dayKey] ?? [];
  days[dayKey] = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  const kept: Record<string, ItemId[]> = {};
  Object.keys(days).sort().slice(-KEEP_DAYS).forEach((k) => (kept[k] = days[k]));
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(kept));
  } catch {
    // Storage full or blocked: the tick still shows for this session.
  }
  return kept;
}

export function loadSettings(): Record<SectionId, boolean> {
  const raw = readObject(SETTINGS_KEY);
  const settings = { prayers: true } as Record<SectionId, boolean>;
  OPTIONAL_SECTIONS.forEach((id) => (settings[id] = raw[id] !== false));
  return settings;
}

export function saveSettings(s: Record<SectionId, boolean>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, prayers: true }));
  } catch {
    // Non-fatal: settings fall back to defaults next launch.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx react-scripts test --watchAll=false src/app/features/tracker/__tests__/trackerStore.test.ts`
Expected: all PASS. Then run `npx tsc --noEmit --noUnusedLocals`, which should be clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/tracker/trackerStore.ts src/app/features/tracker/__tests__/trackerStore.test.ts
git commit -m "persist worship tracker ticks and section toggles locally"
```

---

### Task 4: Strings

**Files:**
- Modify: `src/app/core/i18n/strings.ts`: the `AppStrings` interface (after `more:` near line 33), the `ar` object (`more:` near line 589) and the `en` object (`more:` near line 1136).

**Interfaces:**
- Produces: `t.more.tracker: string` and `t.tracker` with the shape below. Item and section labels are keyed by `ItemId` and `SectionId`, and chips by `FastingOccasion`.

- [ ] **Step 1: Add to the `AppStrings` interface**

In `more: { ... }`, add `tracker: string;`. Then add a new top-level key:

```ts
  tracker: {
    title: string;
    menuSettings: string;
    menuInfo: string;
    noLocation: string;
    sections: Record<"prayers" | "azkar" | "quran" | "daily" | "rawatib" | "fasting", string>;
    items: Record<string, { title: string; subtitle?: string }>;
    fasting: Record<"ramadan" | "arafah" | "ashura" | "tasua" | "shawwal" | "whiteDays" | "monday" | "thursday", { chip: string; subtitle: string }>;
    fastTodayTitle: string;
    settings: { title: string; question: string; obligatory: string; footnote: string };
    info: {
      subtitle: string;
      purposeTitle: string; purpose: string;
      howTitle: string; how: string[];
      lockedTitle: string; locked: string[];
    };
  };
```

- [ ] **Step 2: Add the Arabic values** (in `ar`: `more.tracker: "متابعة العبادات"`, then:)

```ts
  tracker: {
    title: "متابعة العبادات",
    menuSettings: "إعدادات متابعة العبادات",
    menuInfo: "كيف تعمل؟",
    noLocation: "حدّد موقعك في المواقيت لتُفتح العبادات في أوقاتها",
    sections: {
      prayers: "الصلوات", azkar: "الأذكار", quran: "القرآن الكريم",
      daily: "عبادات يومية", rawatib: "سنن رواتب", fasting: "الصيام",
    },
    items: {
      fajr: { title: "الفجر" }, dhuhr: { title: "الظهر" }, asr: { title: "العصر" },
      maghrib: { title: "المغرب" }, isha: { title: "العشاء" },
      azkarMorning: { title: "أذكار الصباح" },
      azkarEvening: { title: "أذكار المساء" },
      azkarSleep: { title: "أذكار النوم" },
      quranDaily: { title: "قراءة القرآن", subtitle: "ورد يومي من القرآن الكريم" },
      duha: { title: "صلاة الضحى", subtitle: "من 2 إلى 8 ركعات بعد شروق الشمس" },
      sunnahFajr: { title: "سنة الفجر", subtitle: "ركعتان قبل صلاة الفجر" },
      sunnahDhuhrBefore: { title: "سنة الظهر القبلية", subtitle: "4 ركعات قبل صلاة الظهر" },
      sunnahDhuhrAfter: { title: "سنة الظهر البعدية", subtitle: "ركعتان بعد صلاة الظهر" },
      sunnahMaghrib: { title: "سنة المغرب", subtitle: "ركعتان بعد صلاة المغرب" },
      sunnahIsha: { title: "سنة العشاء", subtitle: "ركعتان بعد صلاة العشاء" },
      qiyam: { title: "قيام الليل", subtitle: "من بعد صلاة العشاء حتى طلوع الفجر" },
      witr: { title: "صلاة الوتر", subtitle: "ركعة أو ثلاث أو خمس أو سبع أو إحدى عشرة" },
    },
    fastTodayTitle: "صمت اليوم",
    fasting: {
      ramadan: { chip: "رمضان", subtitle: "صيام شهر رمضان" },
      arafah: { chip: "يوم عرفة", subtitle: "صيام يوم عرفة" },
      ashura: { chip: "عاشوراء", subtitle: "صيام يوم عاشوراء" },
      tasua: { chip: "تاسوعاء", subtitle: "صيام اليوم التاسع من محرم" },
      shawwal: { chip: "ست من شوال", subtitle: "صيام الست من شوال" },
      whiteDays: { chip: "الأيام البيض", subtitle: "صيام الأيام البيض" },
      monday: { chip: "الاثنين", subtitle: "صيام يوم الاثنين" },
      thursday: { chip: "الخميس", subtitle: "صيام يوم الخميس" },
    },
    settings: {
      title: "إعدادات متابعة العبادات",
      question: "ما الذي يُحتسب في نسبة الإنجاز؟",
      obligatory: "إلزامي",
      footnote: "الصلوات الخمس تُحتسب دائماً بنسبة 50٪، والأقسام المفعّلة تتقاسم الـ 50٪ المتبقية بالتساوي.",
    },
    info: {
      subtitle: "تابع عباداتك اليومية وحافظ على استمرارك",
      purposeTitle: "وسيلة تنظيمية",
      purpose: "خاصية المتابعة وسيلة تنظيمية تساعدك على الالتزام بالفرائض والسنن، وليست عبادة بذاتها ولا سنة عن النبي ﷺ؛ فاجعلها سراً بينك وبين الله، لا لجمع «الدرجات» ولا للمفاخرة أو الرياء.",
      howTitle: "كيف تستخدمها؟",
      how: [
        "اضغط على أي عبادة لتسجيل إتمامها، واضغط مرة أخرى للتراجع",
        "اضغط مطولاً على الأذكار لفتح صفحة القراءة، وعلى القرآن أو سورة الكهف لفتحها مباشرة",
        "يتم إعادة التعيين تلقائياً كل يوم عند الفجر",
      ],
      lockedTitle: "العبادات المقيّدة بالوقت",
      locked: [
        "لا يمكن تسجيل الصلاة أو سنتها الراتبة قبل دخول وقتها",
        "الأذكار والنوافل تُفتح بعد وقتها المسنون",
      ],
    },
  },
```

- [ ] **Step 3: Add the English values** (in `en`: `more.tracker: "Worship Tracker"`, then:)

```ts
  tracker: {
    title: "Worship Tracker",
    menuSettings: "Tracker settings",
    menuInfo: "How it works",
    noLocation: "Set your location in Prayer Times so acts unlock at their times",
    sections: {
      prayers: "Prayers", azkar: "Azkar", quran: "The Quran",
      daily: "Daily worship", rawatib: "Sunnah prayers", fasting: "Fasting",
    },
    items: {
      fajr: { title: "Fajr" }, dhuhr: { title: "Dhuhr" }, asr: { title: "Asr" },
      maghrib: { title: "Maghrib" }, isha: { title: "Isha" },
      azkarMorning: { title: "Morning azkar" },
      azkarEvening: { title: "Evening azkar" },
      azkarSleep: { title: "Sleep azkar" },
      quranDaily: { title: "Quran reading", subtitle: "A daily portion of the Quran" },
      duha: { title: "Duha prayer", subtitle: "2 to 8 rak'ahs after sunrise" },
      sunnahFajr: { title: "Fajr sunnah", subtitle: "2 rak'ahs before Fajr" },
      sunnahDhuhrBefore: { title: "Dhuhr sunnah (before)", subtitle: "4 rak'ahs before Dhuhr" },
      sunnahDhuhrAfter: { title: "Dhuhr sunnah (after)", subtitle: "2 rak'ahs after Dhuhr" },
      sunnahMaghrib: { title: "Maghrib sunnah", subtitle: "2 rak'ahs after Maghrib" },
      sunnahIsha: { title: "Isha sunnah", subtitle: "2 rak'ahs after Isha" },
      qiyam: { title: "Qiyam al-Layl", subtitle: "From after Isha until Fajr" },
      witr: { title: "Witr", subtitle: "1, 3, 5, 7 or 11 rak'ahs" },
    },
    fastTodayTitle: "I fasted today",
    fasting: {
      ramadan: { chip: "Ramadan", subtitle: "Fasting the month of Ramadan" },
      arafah: { chip: "Day of Arafah", subtitle: "Fasting the Day of Arafah" },
      ashura: { chip: "Ashura", subtitle: "Fasting the Day of Ashura" },
      tasua: { chip: "Tasu'a", subtitle: "Fasting the 9th of Muharram" },
      shawwal: { chip: "Six of Shawwal", subtitle: "Fasting six days of Shawwal" },
      whiteDays: { chip: "White Days", subtitle: "Fasting the White Days" },
      monday: { chip: "Monday", subtitle: "Fasting on Monday" },
      thursday: { chip: "Thursday", subtitle: "Fasting on Thursday" },
    },
    settings: {
      title: "Tracker settings",
      question: "What counts toward completion?",
      obligatory: "Required",
      footnote: "The five prayers always count for 50%. Enabled sections share the remaining 50% equally.",
    },
    info: {
      subtitle: "Track your daily worship and stay consistent",
      purposeTitle: "An organising aid",
      purpose: "Tracking is an aid to help you keep up with obligatory and sunnah acts. It is not an act of worship in itself, nor a sunnah of the Prophet ﷺ. Keep it between you and Allah, not for collecting points, boasting or showing off.",
      howTitle: "How to use it",
      how: [
        "Tap any act to mark it done, and tap again to undo",
        "Long-press azkar to open them, or the Quran to open it (Surah Al-Kahf on Fridays)",
        "Everything resets automatically each day at Fajr",
      ],
      lockedTitle: "Time-bound acts",
      locked: [
        "A prayer or its sunnah can't be logged before its time begins",
        "Azkar and voluntary prayers open at their recommended times",
      ],
    },
  },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit --noUnusedLocals`
Expected: no errors. `ar` and `en` both satisfy `AppStrings`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/i18n/strings.ts
git commit -m "add Arabic and English strings for the worship tracker"
```

---

### Task 5: Settings and Info sheets

**Files:**
- Create: `src/app/features/tracker/TrackerSettingsSheet.tsx`
- Create: `src/app/features/tracker/TrackerInfoSheet.tsx`
- Styles go in `WorshipTracker.css` (Task 6). Class prefix: `wt-`.

**Interfaces:**
- Consumes: `AccountModal` (`src/app/features/account/AccountModal.tsx`, props `{ title: string; onClose: () => void; children: React.ReactNode }`), `useLang()` → `{ t, isRTL }`, `sectionShares`, `OPTIONAL_SECTIONS`, `SectionId`
- Produces:
  - `<TrackerSettingsSheet settings={Record<SectionId, boolean>} onChange={(s) => void} onClose={() => void} />`
  - `<TrackerInfoSheet onClose={() => void} />`

- [ ] **Step 1: Settings sheet.** Percentages are previewed live from the settings, ignoring fasting-day visibility, which matches the screenshot.

```tsx
/**
 * Section toggles for the worship tracker. Prayers are fixed at 50% and
 * can't be switched off; the chips preview each section's share live.
 */
import React from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";
import { OPTIONAL_SECTIONS, SectionId } from "./trackerCatalog";
import { sectionShares } from "./trackerLogic";

interface Props {
  settings: Record<SectionId, boolean>;
  onChange: (s: Record<SectionId, boolean>) => void;
  onClose: () => void;
}

const pct = (n = 0) => `${Math.round(n * 100)}%`;

const TrackerSettingsSheet: React.FC<Props> = ({ settings, onChange, onClose }) => {
  const { t, isRTL } = useLang();
  const tt = t.tracker;
  const shares = sectionShares(["prayers", ...OPTIONAL_SECTIONS.filter((id) => settings[id])]);

  return (
    <AccountModal title={tt.settings.title} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <p className="wt-sheet-question">{tt.settings.question}</p>
        <div className="wt-settings-list">
          <div className="wt-settings-row">
            <span className="wt-settings-name">{tt.sections.prayers}</span>
            <span className="wt-chip">{pct(shares.prayers)}</span>
            <span className="wt-settings-fixed">{tt.settings.obligatory}</span>
          </div>
          {OPTIONAL_SECTIONS.map((id) => (
            <label key={id} className="wt-settings-row">
              <span className="wt-settings-name">{tt.sections[id]}</span>
              <span className="wt-chip">{pct(shares[id])}</span>
              <input
                type="checkbox"
                role="switch"
                className="wt-switch"
                checked={settings[id]}
                onChange={() => onChange({ ...settings, [id]: !settings[id] })}
              />
            </label>
          ))}
        </div>
        <p className="wt-sheet-footnote">{tt.settings.footnote}</p>
      </div>
    </AccountModal>
  );
};

export default TrackerSettingsSheet;
```

- [ ] **Step 2: Info sheet**

```tsx
/**
 * What the worship tracker is for and how its time locks work. The first
 * card says plainly that tracking is an aid, not an act of worship.
 */
import React from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";

const TrackerInfoSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, isRTL } = useLang();
  const ti = t.tracker.info;

  return (
    <AccountModal title={t.tracker.title} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <p className="wt-sheet-question">{ti.subtitle}</p>
        <section className="wt-info-card">
          <h3>{ti.purposeTitle}</h3>
          <p>{ti.purpose}</p>
        </section>
        <section className="wt-info-card">
          <h3>{ti.howTitle}</h3>
          <ul>{ti.how.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <section className="wt-info-card">
          <h3>{ti.lockedTitle}</h3>
          <ul>{ti.locked.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
      </div>
    </AccountModal>
  );
};

export default TrackerInfoSheet;
```

- [ ] **Step 3: Type-check.** Run `npx tsc --noEmit --noUnusedLocals`. It should be clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/tracker/TrackerSettingsSheet.tsx src/app/features/tracker/TrackerInfoSheet.tsx
git commit -m "add the worship tracker's settings and info sheets"
```

---

### Task 6: Page, route and More card

**Files:**
- Create: `src/app/features/tracker/WorshipTracker.tsx`, `src/app/features/tracker/WorshipTracker.css`
- Modify: `src/App.tsx` (import, plus `<Route exact path="/tracker" component={WorshipTracker} />` after the `/prayer-times` route at line 192)
- Modify: `src/app/features/more/More.tsx`: widen `id` to `"account" | "settings" | "prayerTimes" | "tracker"`, add an entry after `prayerTimes` with a checklist icon and `route: "/tracker"`, and add `tracker: tm.tracker` to `labels`.

**Interfaces:**
- Consumes: everything from Tasks 1–5; `loadPrayerDay()`, which returns `{ hasLocation, times, next }`
- Produces: the `/tracker` screen

- [ ] **Step 1: Page component**

```tsx
/**
 * WORSHIP TRACKER PAGE
 * Today's acts, grouped into sections, with a completion ring and a
 * display-only 7-day strip. Only the current tracking day (which starts at
 * Fajr) can be edited; items open at their prayer times.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import { loadPrayerDay } from "../../core/services/prayer/prayer-times.service";
import type { PrayerDay } from "../../core/services/prayer/prayer-times.types";
import { SECTIONS, ItemId, TrackerItem } from "./trackerCatalog";
import {
  trackingDate, toDayKey, isUnlocked, fastingOccasion, visibleSections, dayScore,
} from "./trackerLogic";
import { loadDays, toggleItem, loadSettings, saveSettings } from "./trackerStore";
import TrackerSettingsSheet from "./TrackerSettingsSheet";
import TrackerInfoSheet from "./TrackerInfoSheet";
import "./WorshipTracker.css";

const LONG_PRESS_MS = 500;
const KAHF_PAGE = 293;

const WorshipTracker: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const tt = t.tracker;

  const [now, setNow] = useState(() => new Date());
  const [prayer, setPrayer] = useState<PrayerDay | null>(null);
  const [days, setDays] = useState(loadDays);
  const [settings, setSettings] = useState(loadSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<"settings" | "info" | null>(null);
  const pressTimer = useRef<number>();
  const longPressed = useRef(false);

  useEffect(() => {
    loadPrayerDay().then(setPrayer).catch(() => setPrayer({ hasLocation: false, times: null, next: null }));
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const times = prayer?.times ?? null;
  const today = trackingDate(now, times?.fajr);
  const dayKey = toDayKey(today);
  const isPreviousDay = dayKey !== toDayKey(now);
  const ticked = days[dayKey] ?? [];
  const visible = visibleSections(today, settings);
  const occasion = fastingOccasion(today);

  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = toDayKey(d);
    return { d, key, score: dayScore(days[key] ?? [], visibleSections(d, settings)) };
  }), [today.getTime(), days, settings]);

  const tap = (item: TrackerItem) => {
    if (longPressed.current) return;
    if (!isUnlocked(item, now, times, isPreviousDay)) return;
    setDays(toggleItem(dayKey, item.id));
  };

  const openLongPress = (item: TrackerItem) => {
    if (item.longPress === "azkarMorningEvening") history.push("/azkar/morning-evening");
    else if (item.longPress === "azkarSleep") history.push("/azkar/sleep");
    else if (item.longPress === "quran") {
      history.push(today.getDay() === 5 ? `/viewer?page=${KAHF_PAGE}` : "/viewer");
    }
  };

  const pressHandlers = (item: TrackerItem) => ({
    onPointerDown: () => {
      longPressed.current = false;
      if (!item.longPress) return;
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        openLongPress(item);
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => window.clearTimeout(pressTimer.current),
    onPointerLeave: () => window.clearTimeout(pressTimer.current),
    onClick: () => tap(item),
  });

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(today);
  const hijri = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-GB-u-ca-islamic-umalqura",
    { day: "numeric", month: "long" },
  ).format(today);
  const greg = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(today);
  const score = dayScore(ticked, visible);

  const done = (id: ItemId) => ticked.includes(id);
  const lockIcon = (
    <svg className="wt-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
  const checkIcon = (
    <svg className="wt-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const renderSection = (sectionId: typeof visible[number]) => {
    const section = SECTIONS.find((s) => s.id === sectionId)!;
    const count = section.items.filter((i) => done(i.id)).length;
    return (
      <section key={section.id} className="wt-section">
        <div className="wt-section-head">
          <h2>{tt.sections[section.id]}</h2>
          {section.id === "fasting" && occasion
            ? <span className="wt-chip wt-chip--accent">{tt.fasting[occasion].chip}</span>
            : <span className="wt-count">{count}/{section.items.length}</span>}
        </div>
        <div className={section.id === "prayers" ? "wt-prayer-row" : "wt-item-list"}>
          {section.items.map((item) => {
            const open = isUnlocked(item, now, times, isPreviousDay);
            const isFast = item.id === "fastToday";
            const title = isFast ? tt.fastTodayTitle : tt.items[item.id].title;
            const subtitle = isFast && occasion ? tt.fasting[occasion].subtitle : tt.items[item.id]?.subtitle;
            return (
              <button
                key={item.id}
                className={
                  (section.id === "prayers" ? "wt-prayer" : "wt-item") +
                  (done(item.id) ? " is-done" : "") + (open ? "" : " is-locked")
                }
                aria-pressed={done(item.id)}
                aria-disabled={!open}
                {...pressHandlers(item)}
              >
                <span className="wt-item-text">
                  <span className="wt-item-title">{title}</span>
                  {subtitle && section.id !== "prayers" && <span className="wt-item-sub">{subtitle}</span>}
                </span>
                <span className="wt-item-state">{done(item.id) ? checkIcon : open ? null : lockIcon}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="wt-page" dir={isRTL ? "rtl" : "ltr"}>
          <header className="wt-header">
            <button className="wt-round-btn" onClick={() => history.goBack()} aria-label="back">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={isRTL ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <h1>{tt.title}</h1>
            <div className="wt-menu-wrap">
              <button className="wt-round-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="menu" aria-expanded={menuOpen}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
              {menuOpen && (
                <div className="wt-menu" role="menu">
                  <button role="menuitem" onClick={() => { setMenuOpen(false); setSheet("settings"); }}>{tt.menuSettings}</button>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); setSheet("info"); }}>{tt.menuInfo}</button>
                </div>
              )}
            </div>
          </header>

          <div className="wt-summary">
            <div className="wt-summary-top">
              <div>
                <div className="wt-weekday">{weekday}</div>
                <div className="wt-dates">{hijri} — {greg}</div>
              </div>
              <div className="wt-ring" style={{ "--wt-p": score } as React.CSSProperties}>
                <span>{score}</span>
              </div>
            </div>
            <div className="wt-strip">
              {strip.map(({ d, key, score: s }) => (
                <div key={key} className={"wt-strip-day" + (key === dayKey ? " is-today" : "")}>
                  <span className="wt-strip-name">{new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d)}</span>
                  <span className="wt-strip-dot" style={{ "--wt-p": s } as React.CSSProperties} />
                  <span className="wt-strip-num">{d.getDate()}</span>
                </div>
              ))}
            </div>
          </div>

          {prayer && !prayer.hasLocation && (
            <button className="wt-hint" onClick={() => history.push("/prayer-times")}>{tt.noLocation}</button>
          )}

          {visible.map(renderSection)}
        </div>
      </IonContent>
      <BottomNavBar active="more" fixed />

      {sheet === "settings" && (
        <TrackerSettingsSheet
          settings={settings}
          onChange={(s) => { setSettings(s); saveSettings(s); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "info" && <TrackerInfoSheet onClose={() => setSheet(null)} />}
    </IonPage>
  );
};

export default WorshipTracker;
```

Before writing, confirm that `useLang()` exposes `lang`. Grep `src/app/core/context/LanguageContext.tsx` for its return value. If it doesn't, use `t === STRINGS.ar` or whatever field it does expose.

- [ ] **Step 2: Styles.** Invoke the `frontend-design:frontend-design` skill first (project preference). Base the styles on the screenshots and existing tokens:

```css
.wt-page {
  max-width: var(--max-width-mobile, 600px);
  margin: 0 auto;
  padding: var(--space-4) var(--space-4) calc(var(--bottom-nav-height) + var(--space-6));
}
.wt-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.wt-header h1 { font-size: 1.25rem; font-weight: 700; margin: 0; }
.wt-round-btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border-color, rgba(0,0,0,.15)); background: var(--surface-color, #fff); color: inherit; display: grid; place-items: center; }
.wt-round-btn svg { width: 20px; height: 20px; fill: currentColor; }
.wt-menu-wrap { position: relative; }
.wt-menu { position: absolute; top: 46px; inset-inline-end: 0; z-index: 10; min-width: 200px; background: var(--surface-color, #fff); border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.15); overflow: hidden; }
.wt-menu button { display: block; width: 100%; padding: 14px 16px; text-align: start; background: none; border: 0; color: inherit; font-size: .95rem; }
.wt-summary { border: 1px solid var(--border-color, rgba(0,0,0,.12)); border-radius: 20px; padding: var(--space-4); margin-bottom: var(--space-5); }
.wt-summary-top { display: flex; justify-content: space-between; align-items: center; }
.wt-weekday { font-weight: 700; font-size: 1.1rem; }
.wt-dates { opacity: .75; font-size: .9rem; }
.wt-ring { --wt-p: 0; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
  background: conic-gradient(var(--ion-color-primary) calc(var(--wt-p) * 1%), var(--border-color, rgba(0,0,0,.12)) 0);
  -webkit-mask: radial-gradient(circle, transparent 20px, #000 21px); mask: radial-gradient(circle, transparent 20px, #000 21px); position: relative; }
.wt-ring span { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 600; }
.wt-strip { display: grid; grid-template-columns: repeat(7, 1fr); margin-top: var(--space-4); text-align: center; }
.wt-strip-day { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: .75rem; opacity: .8; }
.wt-strip-day.is-today { color: var(--ion-color-primary); opacity: 1; font-weight: 700; }
.wt-strip-dot { --wt-p: 0; width: 18px; height: 18px; border-radius: 50%;
  background: conic-gradient(var(--ion-color-primary) calc(var(--wt-p) * 1%), var(--border-color, rgba(0,0,0,.15)) 0); }
.wt-strip-num { font-size: .95rem; }
.wt-hint { width: 100%; margin-bottom: var(--space-4); padding: 10px 14px; border-radius: 12px; border: 0; background: var(--ion-color-primary-tint, #e6f0ff); color: inherit; font-size: .85rem; }
.wt-section { margin-bottom: var(--space-5); }
.wt-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.wt-section-head h2 { font-size: 1.2rem; font-weight: 700; margin: 0; }
.wt-count { opacity: .6; font-size: .85rem; }
.wt-chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .75rem; background: var(--ion-color-primary-tint, #e6f0ff); color: var(--ion-color-primary); }
.wt-prayer-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.wt-prayer, .wt-item { border: 1px solid var(--border-color, rgba(0,0,0,.15)); background: var(--surface-color, #fff); color: inherit; border-radius: 16px; transition: background .15s, border-color .15s; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.wt-prayer { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 4px; font-size: .85rem; }
.wt-item-list { display: flex; flex-direction: column; gap: 10px; }
.wt-item { display: flex; align-items: center; justify-content: space-between; padding: 16px; text-align: start; }
.wt-item-text { display: flex; flex-direction: column; gap: 2px; }
.wt-item-title { font-size: 1rem; }
.wt-item-sub { font-size: .8rem; opacity: .65; }
.wt-prayer.is-done, .wt-item.is-done { border-color: var(--ion-color-primary); background: color-mix(in srgb, var(--ion-color-primary) 10%, transparent); }
.is-locked { opacity: .55; }
.wt-lock, .wt-check { width: 18px; height: 18px; }
.wt-check { color: var(--ion-color-primary); }
.wt-sheet { display: flex; flex-direction: column; gap: var(--space-3); }
.wt-sheet-question { opacity: .75; margin: 0; }
.wt-settings-list { border: 1px solid var(--border-color, rgba(0,0,0,.12)); border-radius: 18px; padding: 4px 14px; }
.wt-settings-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; }
.wt-settings-name { flex: 1; }
.wt-settings-fixed { font-size: .8rem; opacity: .6; }
.wt-switch { appearance: none; width: 46px; height: 26px; border-radius: 13px; background: var(--border-color, #ccc); position: relative; transition: background .15s; }
.wt-switch::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: inset-inline-start .15s; }
.wt-switch:checked { background: var(--ion-color-primary); }
.wt-switch:checked::after { inset-inline-start: 23px; }
.wt-sheet-footnote { font-size: .8rem; opacity: .65; margin: 0; }
.wt-info-card { border: 1px solid var(--border-color, rgba(0,0,0,.12)); border-radius: 18px; padding: 14px 16px; }
.wt-info-card h3 { margin: 0 0 8px; font-size: 1rem; }
.wt-info-card p, .wt-info-card li { font-size: .9rem; line-height: 1.6; }
.wt-info-card ul { margin: 0; padding-inline-start: 18px; }
```

- [ ] **Step 3: Wire up the route and More card.** In `src/App.tsx`, add `import WorshipTracker from "./app/features/tracker/WorshipTracker";` and `<Route exact path="/tracker" component={WorshipTracker} />`. In `More.tsx`, add this entry after `prayerTimes`:

```tsx
  {
    id: "tracker",
    // A checklist: ticked acts down the day.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6l1.5 1.5L8 5" />
        <path d="M4 12l1.5 1.5L8 11" />
        <path d="M4 18l1.5 1.5L8 17" />
        <path d="M11 6h9M11 12h9M11 18h9" />
      </svg>
    ),
    route: "/tracker",
  },
```

Add `tracker: tm.tracker` to `labels`, and update the header comment to list the tracker.

- [ ] **Step 4: Verify.** Run `npx tsc --noEmit --noUnusedLocals`. It should be clean. Also run both tracker Jest files again, and they should still pass. Then run `npm start` and check in the browser:
  - More → Worship Tracker opens.
  - The web build has no location, so everything is unlocked and the hint shows.
  - Tapping ticks and unticks, and the ring and today's dot update.
  - Long-pressing morning azkar opens `/azkar/morning-evening`.
  - The ⋯ menu opens both sheets, and toggling a section updates the chips and the ring.
  - The fasting section only appears on an occasion day.
  - The last card clears the bottom nav bar, and there's no horizontal scroll at 360px.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/tracker/WorshipTracker.tsx src/app/features/tracker/WorshipTracker.css src/App.tsx src/app/features/more/More.tsx
git commit -m "add the worship tracker page and its entry on More"
```

---

## Notes for the executor

- `src/App.tsx` and `strings.ts` already have **uncommitted Azkar changes** from the user. Stage with `git add -p`, or check `git diff --cached` before committing, so you commit only the tracker hunks.
- The Al-Kahf start page (293) assumes the standard Madani mushaf the viewer uses. Check it against `src/data` page mappings before relying on it.
