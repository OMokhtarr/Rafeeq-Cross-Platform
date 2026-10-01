# Onboarding Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship welcome slides (first install), per-page spotlight tours (first visit to each page or state), a "What's new" deck for future releases, and a "Tours & tips" replay section in Settings.

**Architecture:** All new code lives in `src/app/features/onboarding/` and has three layers:
- **Pure, unit-tested core:** the store, the catalog, the copy and the logic.
- **Presentational components:** `SlideDeck`, `SpotlightOverlay` and the illustrations.
- **A `TourProvider`:** a context mounted inside `IonReactRouter` that owns the single run queue.

Pages opt in with `usePageTour([...ids], { ready })` and mark targets with `{...tourAttr("tour.step")}` (a `data-tour` attribute). `App.tsx` initialises the store synchronously, before the tracker's launch-time write.

**Tech Stack:** React 18, Ionic React 7/8 (`useIonViewDidEnter` / `useIonViewWillLeave`), react-router 5, TypeScript 4.9, Jest via `react-scripts test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-onboarding-tours-design.md`

## Global Constraints

**CSS and copy**
- No visible scrollbars. The global rule in `src/index.css` hides them; never add scrollbar styling.
- Never add `// eslint-disable` comments of any kind.
- Any max-width cap uses `var(--max-width-mobile, 600px)`. Never hard-code a pixel max-width.
- Colours only via theme tokens (`--color-gold`, `--color-bg-app`, `--color-bg-card`, `--color-text-*`, `--color-gold-subtle`, `--color-gold-faint`). They're defined for both `day` and `night`.
- Every user-visible string exists in **Arabic and English** in `src/app/features/onboarding/onboardingCopy.ts`.
- **Do not edit `src/app/core/i18n/strings.ts`.** Another session has uncommitted edits there. This is a deliberate change from the spec's "strings.ts `onboarding` group".
- **"Replay page tips" confirmation:** an inline `settings-sync-note`, not a toast. Settings has no toast component, and the inline note matches the Sync section. This is a deliberate change from the spec.
- **No per-step `optional` flag.** The spec marks some steps optional, but the engine skips *every* step whose target is missing, so the flag would add nothing.

**Tooling**
- No new npm dependencies.
- Do **not** run `npm run build`, `npx cap sync`, or Gradle. The user builds the app.
- **Unit tests** run with Jest via react-scripts (Vitest is broken repo-wide):
  `CI=true npx react-scripts test --watchAll=false --testPathPattern <pattern>`
  Run it from the repo root with the **Bash** tool, not PowerShell.
- **Type gate:** `npx tsc --noEmit -p tsconfig.json`. The repo has pre-existing errors elsewhere, so grep the output for `features/onboarding` and the files you touched.

**Commits**
- Messages are a plain sentence (repo style, no `feat:` prefix) and end with:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Work on branch `onboarding-tours`.
- Stage only the files the task names; never `git add -A`.
- The working tree contains another session's uncommitted edits in `strings.ts`, `Azkar.css`, `AzkarReference.tsx`, `WorshipTracker.tsx`, `trackerCatalog.ts`, `azkarData.ts` and `azkarReferences.ts`.
- **`WorshipTracker.tsx` is the only overlap.** See Task 10, Step 1.

**Copy and storage**
- Storage key: `rafiq_onboarding_v1`.
- Tour ids, step keys and copy are exactly as listed in Tasks 2–3. The source-scan test in Task 11 enforces that pages use only these.

## Review Focus

1. **Stored state must beat legacy-key detection.**
   - `rafiq_lang_v1`, `rafiq_theme_v1` and `rafeeq.tracker.since` are rewritten on *every* launch.
   - So a brand-new user who quits mid-welcome must see the welcome again on the next launch, not be reclassified as an existing user.
   - Pinned in Task 1 ("stored state wins over legacy keys") and by the StrictMode double-call test.
2. **Ionic keeps earlier pages mounted with identical `data-tour` attributes.**
   - The BottomNavBar is on every page, so `home.tabs` exists many times.
   - Resolution must pick the visible page's copy and ignore `.ion-page-hidden` ones.
   - Pinned in Task 3 (`resolveTarget` tests).
3. **A tour whose targets never render must stay unseen.** Examples are Prayer Times without a location, an empty "My Azkar", or a Hifz plan with no sessions.
   - Such a tour must **not** be marked seen; one that showed at least one step must be.
   - Pinned in Task 3 (`shouldMarkSeen`, `previousShown`).
4. **Swipe direction in the welcome deck must mirror in RTL.** In Arabic, swiping right moves forward.
   - Pinned in Task 3 (`swipeStep`).
5. **Blocked or corrupt storage must never mean "onboarding every launch".**
   - Pinned in Task 1 (corrupt JSON, non-object JSON, throwing storage).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/app/features/onboarding/onboardingStore.ts` | create | localStorage state, existing-user detection, mutators |
| `src/app/features/onboarding/tourCatalog.ts` | create | `TourId`, `TOURS`, `WELCOME_SLIDES`, `RELEASES`, `tourAttr()` |
| `src/app/features/onboarding/onboardingCopy.ts` | create | ar/en copy for controls, slides, tours, releases, settings |
| `src/app/features/onboarding/tourLogic.ts` | create | pure rules: deck choice, queue picking, placement, swipe, target resolution |
| `src/app/features/onboarding/illustrations.tsx` | create | 6 gold line-art SVGs |
| `src/app/features/onboarding/onboarding.css` | create | all onboarding styles |
| `src/app/features/onboarding/SlideDeck.tsx` | create | shared full-screen deck + `Dots` |
| `src/app/features/onboarding/WelcomeSlides.tsx` | create | welcome deck with language pick |
| `src/app/features/onboarding/WhatsNew.tsx` | create | release deck with "Show me" |
| `src/app/features/onboarding/SpotlightOverlay.tsx` | create | ring cutout, card, gesture glyph |
| `src/app/features/onboarding/TourProvider.tsx` | create | context, queue, decks, persistence |
| `src/app/features/onboarding/usePageTour.ts` | create | page hook |
| `src/app/features/onboarding/__tests__/*.test.ts` | create | store, logic, copy, source-scan tests |
| `src/App.tsx` | modify | `initOnboarding` before `ensureSince`; mount `TourProvider` |
| `src/app/features/settings/Settings.tsx` | modify | "Tours & tips" section + settings tour |
| viewer, quiz, azkar, hifz, prayer, tracker, bookmarks, tafsir, account, more, home, search, surah-juz pages and `BottomNavBar` | modify | `data-tour` attributes + `usePageTour` |

---

### Task 1: Onboarding store

**Files:**
- Create: `src/app/features/onboarding/onboardingStore.ts`
- Test: `src/app/features/onboarding/__tests__/onboardingStore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ONBOARDING_KEY: string`, `LEGACY_KEYS: string[]`
  - `interface OnboardingState { welcomeDone: boolean; seenTours: string[]; seenReleases: string[] }`
  - `detectExistingUser(): boolean`
  - `initOnboarding(releaseIds: string[]): OnboardingState | null`. It returns `null` when storage is unusable.
  - These all persist and return the new state:
    - `markTourSeen(s: OnboardingState, id: string): OnboardingState`
    - `markReleasesSeen(s: OnboardingState, ids: string[]): OnboardingState`
    - `completeWelcome(s: OnboardingState, releaseIds: string[]): OnboardingState`
    - `resetTours(s: OnboardingState): OnboardingState`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/onboarding/__tests__/onboardingStore.test.ts
import {
  ONBOARDING_KEY,
  LEGACY_KEYS,
  initOnboarding,
  markTourSeen,
  markReleasesSeen,
  completeWelcome,
  resetTours,
} from "../onboardingStore";

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

const stored = () => JSON.parse(localStorage.getItem(ONBOARDING_KEY) as string);

describe("initOnboarding", () => {
  it("treats an empty device as a new user and persists that", () => {
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: false, seenTours: [], seenReleases: [] });
    expect(stored().welcomeDone).toBe(false);
  });

  it.each(LEGACY_KEYS)("treats a device with %s as an existing user", (key) => {
    localStorage.setItem(key, "x");
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("lets stored state win over legacy keys written on every launch", () => {
    initOnboarding([]); // first launch: new user
    localStorage.setItem("rafiq_lang_v1", "ar"); // LanguageProvider writes this each launch
    localStorage.setItem("rafeeq.tracker.since", "2026-10-01");
    expect(initOnboarding([]).welcomeDone).toBe(false);
  });

  it("is stable when called twice (StrictMode double-invokes initialisers)", () => {
    initOnboarding([]);
    expect(initOnboarding([]).welcomeDone).toBe(false);
  });

  it("never re-runs the welcome after corrupt JSON", () => {
    localStorage.setItem(ONBOARDING_KEY, "{nope");
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("never re-runs the welcome after non-object JSON", () => {
    localStorage.setItem(ONBOARDING_KEY, "[1,2]");
    expect(initOnboarding([]).welcomeDone).toBe(true);
  });

  it("drops non-string entries from stored lists", () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ welcomeDone: true, seenTours: ["home", 3], seenReleases: null }));
    expect(initOnboarding([])).toEqual({ welcomeDone: true, seenTours: ["home"], seenReleases: [] });
  });

  it("returns null when storage throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(initOnboarding([])).toBeNull();
  });
});

describe("mutators", () => {
  const base = { welcomeDone: false, seenTours: [], seenReleases: [] };

  it("marks a tour seen once and persists it", () => {
    const s = markTourSeen(markTourSeen(base, "home"), "home");
    expect(s.seenTours).toEqual(["home"]);
    expect(stored().seenTours).toEqual(["home"]);
  });

  it("marks releases seen without duplicates", () => {
    expect(markReleasesSeen({ ...base, seenReleases: ["1.2.0"] }, ["1.2.0", "1.3.0"]).seenReleases).toEqual(["1.2.0", "1.3.0"]);
  });

  it("completing the welcome also marks every current release seen", () => {
    expect(completeWelcome(base, ["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("resetTours clears only the tours", () => {
    const s = resetTours({ welcomeDone: true, seenTours: ["home"], seenReleases: ["1.2.0"] });
    expect(s).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
    expect(stored().seenTours).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern onboardingStore`
Expected: FAIL, "Cannot find module '../onboardingStore'".

- [ ] **Step 3: Write the implementation**

```ts
// src/app/features/onboarding/onboardingStore.ts
/**
 * Onboarding persistence: whether the welcome deck ran, which page tours and
 * "What's new" releases the user has been through. One localStorage key, pure
 * functions, no React.
 */

export const ONBOARDING_KEY = "rafiq_onboarding_v1";

export interface OnboardingState {
  welcomeDone: boolean;
  seenTours: string[];
  seenReleases: string[];
}

/**
 * Keys only a device that has already run Rafeeq would have. Several are
 * rewritten on every launch (language, theme, tracker start date), so this is
 * consulted only when no onboarding state is stored yet, and App.tsx calls
 * initOnboarding before the tracker's launch-time write.
 */
export const LEGACY_KEYS = [
  "rafiq_settings_v1",
  "rafiq_last_page_v1",
  "rafeeq.tracker.since",
  "rafiq_lang_v1",
  "rafiq_theme_v1",
  "rafiq_bookmarks_v1",
  "rafiq_hifz_v2",
  "rafiq_notes_v1",
];

export function detectExistingUser(): boolean {
  return LEGACY_KEYS.some((k) => localStorage.getItem(k) !== null);
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function parse(raw: string): OnboardingState | null {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return {
      welcomeDone: v.welcomeDone === true,
      seenTours: stringList(v.seenTours),
      seenReleases: stringList(v.seenReleases),
    };
  } catch {
    return null;
  }
}

function save(s: OnboardingState): OnboardingState {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: the in-memory state still drives this session.
  }
  return s;
}

/**
 * Loads the state, creating it on the first launch of an onboarding-aware
 * build. Returns null when storage is unusable, so callers show nothing rather
 * than onboarding on every launch.
 */
export function initOnboarding(releaseIds: string[]): OnboardingState | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (raw !== null) {
      // Corrupt state is treated as an existing user: never re-run the welcome.
      return parse(raw) ?? save({ welcomeDone: true, seenTours: [], seenReleases: [...releaseIds] });
    }
    const state: OnboardingState = detectExistingUser()
      ? { welcomeDone: true, seenTours: [], seenReleases: [...releaseIds] }
      : { welcomeDone: false, seenTours: [], seenReleases: [] };
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

const withItems = (list: string[], items: string[]) => [...list, ...items.filter((i) => !list.includes(i))];

export const markTourSeen = (s: OnboardingState, id: string) =>
  save({ ...s, seenTours: withItems(s.seenTours, [id]) });

export const markReleasesSeen = (s: OnboardingState, ids: string[]) =>
  save({ ...s, seenReleases: withItems(s.seenReleases, ids) });

export const completeWelcome = (s: OnboardingState, releaseIds: string[]) =>
  save({ ...s, welcomeDone: true, seenReleases: withItems(s.seenReleases, releaseIds) });

export const resetTours = (s: OnboardingState) => save({ ...s, seenTours: [] });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern onboardingStore`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/onboarding/onboardingStore.ts src/app/features/onboarding/__tests__/onboardingStore.test.ts
git commit -m "Add onboarding store with existing-user detection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tour catalog

**Files:**
- Create: `src/app/features/onboarding/tourCatalog.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TourId` (the 23 ids below)
  - `type Gesture = "swipe" | "longPress" | "doubleTap"`
  - `interface TourStep { key: string; gesture?: Gesture; union?: boolean }`
  - `TOURS: Record<TourId, TourStep[]>`
  - `type TourRef = \`${TourId}.${string}\``
  - `tourAttr(...refs: TourRef[]): { "data-tour": string }`
  - `type IllustrationId = "brand" | "mushaf" | "recite" | "quiz" | "worship" | "qibla"`
  - `type WelcomeSlideId = "welcome" | "read" | "recite" | "quiz" | "worship" | "prayer"`
  - `WELCOME_SLIDES: { id: WelcomeSlideId; art: IllustrationId }[]`
  - `interface ReleaseFeature { key: string; art: IllustrationId; route: string; tourId: TourId }`
  - `interface Release { id: string; features: ReleaseFeature[] }`
  - `RELEASES: Release[]` (empty today), `RELEASE_IDS: string[]`

This is a data-only file. It's tested through Task 3's copy-completeness test and Task 11's source scan.

- [ ] **Step 1: Write the catalog**

```ts
// src/app/features/onboarding/tourCatalog.ts
/**
 * What the onboarding shows: the welcome slides, every page tour's steps, and
 * the "What's new" releases. Content only. The words live in onboardingCopy.ts
 * and the rules in tourLogic.ts.
 *
 * A step's target is the element carrying `data-tour="<tourId>.<key>"`
 * (spread `tourAttr(...)` onto it). A step whose target is not on screen is
 * skipped, so steps for conditional UI are safe.
 *
 * Shipping a feature later:
 *  1. Add a tour with a NEW id here (+ copy, + data-tour targets, + the page's
 *     usePageTour list).
 *  2. Add a Release whose feature points at that route and tour id.
 */

export type Gesture = "swipe" | "longPress" | "doubleTap";

export interface TourStep {
  key: string;
  gesture?: Gesture;
  /** Ring every matching element together instead of only the first. */
  union?: boolean;
}

export type TourId =
  | "home"
  | "viewer"
  | "viewer.verseSheet"
  | "viewer.playbackSheet"
  | "viewer.playbackBar"
  | "viewer.reciteBar"
  | "viewer.reveal"
  | "surahJuz"
  | "search"
  | "quizList"
  | "quizSetup"
  | "azkar"
  | "azkarCategory"
  | "hifzSetup"
  | "hifzDashboard"
  | "hifzSessions"
  | "more"
  | "prayerTimes"
  | "tracker"
  | "bookmarks"
  | "settings"
  | "tafsirLibrary"
  | "account";

export const TOURS: Record<TourId, TourStep[]> = {
  home: [{ key: "tabs" }, { key: "more" }],
  viewer: [
    { key: "swipe", gesture: "swipe" },
    { key: "pill" },
    { key: "play", gesture: "longPress" },
    { key: "hide" },
    { key: "verse", gesture: "longPress" },
    { key: "nav", union: true },
    { key: "immersive", gesture: "doubleTap" },
  ],
  "viewer.verseSheet": [{ key: "actions" }, { key: "tafsir" }, { key: "swipe", gesture: "swipe" }],
  "viewer.playbackSheet": [{ key: "range" }, { key: "quick" }, { key: "reciter" }, { key: "speed" }],
  "viewer.playbackBar": [{ key: "controls" }],
  "viewer.reciteBar": [{ key: "transcript" }, { key: "reveal", union: true }, { key: "stop" }],
  "viewer.reveal": [{ key: "word" }, { key: "verse" }],
  surahJuz: [{ key: "tabs" }],
  search: [{ key: "input" }, { key: "recents" }],
  quizList: [{ key: "ayah" }, { key: "mutashabihat" }, { key: "nehayat" }],
  quizSetup: [{ key: "mode" }, { key: "scope" }, { key: "count" }, { key: "start" }],
  azkar: [{ key: "mine" }, { key: "progress" }],
  azkarCategory: [{ key: "counter" }, { key: "star" }, { key: "swipe", gesture: "swipe" }, { key: "ref" }],
  hifzSetup: [{ key: "add" }, { key: "goal" }, { key: "generate" }],
  hifzDashboard: [{ key: "hero", gesture: "swipe" }, { key: "streak" }, { key: "sessions" }],
  hifzSessions: [{ key: "done" }, { key: "open" }],
  more: [{ key: "cards" }],
  prayerTimes: [{ key: "grant" }, { key: "next" }, { key: "qibla" }, { key: "menu" }],
  tracker: [
    { key: "item" },
    { key: "locked" },
    { key: "shortcut", gesture: "longPress" },
    { key: "strip", union: true },
    { key: "header" },
  ],
  bookmarks: [{ key: "tabs" }],
  settings: [{ key: "look", union: true }, { key: "sync" }, { key: "reminders" }, { key: "tours" }],
  tafsirLibrary: [{ key: "library" }, { key: "downloaded" }],
  account: [{ key: "notes" }, { key: "backup" }, { key: "streak" }],
};

export type TourRef = `${TourId}.${string}`;

/** Spread onto a DOM element to make it the target of one or more steps. */
export function tourAttr(...refs: TourRef[]): { "data-tour": string } {
  return { "data-tour": refs.join(" ") };
}

export type IllustrationId = "brand" | "mushaf" | "recite" | "quiz" | "worship" | "qibla";

export type WelcomeSlideId = "welcome" | "read" | "recite" | "quiz" | "worship" | "prayer";

export const WELCOME_SLIDES: { id: WelcomeSlideId; art: IllustrationId }[] = [
  { id: "welcome", art: "brand" },
  { id: "read", art: "mushaf" },
  { id: "recite", art: "recite" },
  { id: "quiz", art: "quiz" },
  { id: "worship", art: "worship" },
  { id: "prayer", art: "qibla" },
];

export interface ReleaseFeature {
  /** Copy lives at onboardingCopy releases[`${release.id}.${key}`]. */
  key: string;
  art: IllustrationId;
  /** Where "Show me" navigates. */
  route: string;
  /** Played on arrival; must be in that page's usePageTour list. */
  tourId: TourId;
}

export interface Release {
  /** A label, e.g. "1.2.0". Nothing reads the app's versionName. */
  id: string;
  features: ReleaseFeature[];
}

/** Oldest first. Everything shipped so far is covered by the welcome slides. */
export const RELEASES: Release[] = [];

export const RELEASE_IDS = RELEASES.map((r) => r.id);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep features/onboarding`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/onboarding/tourCatalog.ts
git commit -m "Add onboarding tour catalog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Copy and tour logic

**Files:**
- Create: `src/app/features/onboarding/onboardingCopy.ts`
- Create: `src/app/features/onboarding/tourLogic.ts`
- Test: `src/app/features/onboarding/__tests__/onboardingCopy.test.ts`
- Test: `src/app/features/onboarding/__tests__/tourLogic.test.ts`

**Interfaces:**
- Consumes: `OnboardingState` (Task 1); `TourId`, `TOURS`, `Release`, `WELCOME_SLIDES`, `RELEASES`, `WelcomeSlideId` (Task 2).
- Produces:
  - `interface StepCopy { title: string; body: string }`
  - `interface OnboardingCopy { controls; slides; tours; releases; settings }` (shape below)
  - `ONBOARDING_COPY: Record<Lang, OnboardingCopy>`
  - `type Deck = { kind: "welcome" } | { kind: "whatsNew"; releases: Release[] } | null`
  - `unseenReleases(state, releases): Release[]`
  - `launchDeck(state: OnboardingState | null, releases: Release[]): Deck`
  - `pendingTours(state: OnboardingState | null, ids: TourId[]): TourId[]`
  - `interface TourRequest { tourId: TourId; overOverlay: boolean; onBeforeStart?: () => void }`
  - `pickNext(queue: TourRequest[], overlayOpen: boolean): number`
  - `interface Box { top: number; left: number; width: number; height: number }`
  - `cardPlacement(target: Box, viewportHeight: number): "top" | "bottom"`
  - `unionBox(boxes: Box[]): Box | null`
  - `resolveTarget(root: ParentNode, ref: string, union: boolean): { box: Box; element: Element } | null`
  - `swipeStep(dx: number, isRTL: boolean, threshold?: number): -1 | 0 | 1`
  - `shouldMarkSeen(reason: "done" | "skip" | "cancel", shownSteps: number): boolean`
  - `previousShown(shown: number[], index: number): number | null`

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/features/onboarding/__tests__/onboardingCopy.test.ts
import { ONBOARDING_COPY } from "../onboardingCopy";
import { TOURS, TourId, WELCOME_SLIDES, RELEASES } from "../tourCatalog";

describe.each(["ar", "en"] as const)("%s copy", (lang) => {
  const copy = ONBOARDING_COPY[lang];

  it("has a title and body for every tour step", () => {
    for (const id of Object.keys(TOURS) as TourId[]) {
      for (const step of TOURS[id]) {
        const c = copy.tours[id]?.[step.key];
        // Shaped so a failure names the missing step.
        expect({ step: `${id}.${step.key}`, ok: Boolean(c?.title && c?.body) }).toEqual({ step: `${id}.${step.key}`, ok: true });
      }
    }
  });

  it("has no copy for steps that do not exist", () => {
    for (const id of Object.keys(copy.tours) as TourId[]) {
      const keys = TOURS[id].map((s) => s.key);
      for (const key of Object.keys(copy.tours[id])) expect(keys).toContain(key);
    }
  });

  it("covers every welcome slide", () => {
    for (const s of WELCOME_SLIDES) {
      expect(copy.slides[s.id].title).toBeTruthy();
      expect(copy.slides[s.id].body).toBeTruthy();
    }
  });

  it("covers every release feature", () => {
    for (const r of RELEASES) for (const f of r.features) expect(copy.releases[`${r.id}.${f.key}`]?.title).toBeTruthy();
  });
});

it("every release has a unique id and at least one feature", () => {
  const ids = RELEASES.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const r of RELEASES) expect(r.features.length).toBeGreaterThan(0);
});
```

```ts
// src/app/features/onboarding/__tests__/tourLogic.test.ts
import {
  launchDeck,
  pendingTours,
  pickNext,
  cardPlacement,
  unionBox,
  resolveTarget,
  swipeStep,
  shouldMarkSeen,
  previousShown,
} from "../tourLogic";
import type { Release } from "../tourCatalog";

const rel = (id: string): Release => ({ id, features: [{ key: "x", art: "brand", route: "/", tourId: "home" }] });
const state = (over = {}) => ({ welcomeDone: true, seenTours: [] as string[], seenReleases: [] as string[], ...over });

describe("launchDeck", () => {
  it("shows nothing when storage is unusable", () => expect(launchDeck(null, [rel("1")])).toBeNull());
  it("shows the welcome until it is done", () =>
    expect(launchDeck(state({ welcomeDone: false }), [rel("1")])).toEqual({ kind: "welcome" }));
  it("shows unseen releases oldest first", () =>
    expect(launchDeck(state({ seenReleases: ["1"] }), [rel("1"), rel("2"), rel("3")])).toEqual({
      kind: "whatsNew",
      releases: [rel("2"), rel("3")],
    }));
  it("shows nothing when everything is seen", () => expect(launchDeck(state({ seenReleases: ["1"] }), [rel("1")])).toBeNull());
});

describe("pendingTours", () => {
  it("keeps unseen tours in the order given", () =>
    expect(pendingTours(state({ seenTours: ["viewer"] }), ["viewer.reveal", "viewer", "home"])).toEqual(["viewer.reveal", "home"]));
  it("returns nothing when storage is unusable", () => expect(pendingTours(null, ["home"])).toEqual([]));
});

describe("pickNext", () => {
  const q = [
    { tourId: "home" as const, overOverlay: false },
    { tourId: "viewer.verseSheet" as const, overOverlay: true },
  ];
  it("takes the first request when nothing is open", () => expect(pickNext(q, false)).toBe(0));
  it("only takes over-overlay requests while a sheet is open", () => expect(pickNext(q, true)).toBe(1));
  it("returns -1 when nothing may run", () => expect(pickNext([q[0]], true)).toBe(-1));
});

describe("cardPlacement", () => {
  it("puts the card at the bottom for targets in the upper part", () =>
    expect(cardPlacement({ top: 10, left: 0, width: 40, height: 40 }, 800)).toBe("bottom"));
  it("moves the card to the top for targets in the lower 40%", () =>
    expect(cardPlacement({ top: 740, left: 0, width: 40, height: 40 }, 800)).toBe("top"));
});

describe("unionBox", () => {
  it("returns null for no boxes", () => expect(unionBox([])).toBeNull());
  it("covers every box", () =>
    expect(
      unionBox([
        { top: 10, left: 10, width: 20, height: 20 },
        { top: 5, left: 50, width: 10, height: 40 },
      ]),
    ).toEqual({ top: 5, left: 10, width: 50, height: 40 }));
});

describe("resolveTarget", () => {
  const rect = (top: number, h = 20) => () => ({ top, left: 0, width: 50, height: h, right: 50, bottom: top + h, x: 0, y: top, toJSON() {} }) as DOMRect;

  function mount(html: string, rects: Record<string, () => DOMRect>) {
    document.body.innerHTML = html;
    for (const [id, fn] of Object.entries(rects)) (document.getElementById(id) as HTMLElement).getBoundingClientRect = fn;
  }

  it("ignores copies inside hidden Ionic pages", () => {
    mount(
      `<div class="ion-page ion-page-hidden"><nav id="a" data-tour="home.tabs"></nav></div>
       <div class="ion-page"><nav id="b" data-tour="home.tabs"></nav></div>`,
      { a: rect(1), b: rect(700) },
    );
    expect(resolveTarget(document, "home.tabs", false)?.element.id).toBe("b");
  });

  it("matches one ref among several on an element", () => {
    mount(`<div id="m" data-tour="viewer.swipe viewer.verse"></div>`, { m: rect(100) });
    expect(resolveTarget(document, "viewer.verse", false)?.box.top).toBe(100);
  });

  it("skips zero-size elements", () => {
    mount(`<div id="z" data-tour="search.recents"></div>`, { z: rect(10, 0) });
    expect(resolveTarget(document, "search.recents", false)).toBeNull();
  });

  it("unions every visible match when asked", () => {
    mount(`<i id="x" data-tour="viewer.nav"></i><i id="y" data-tour="viewer.nav"></i>`, { x: rect(10), y: rect(40) });
    expect(resolveTarget(document, "viewer.nav", true)?.box).toEqual({ top: 10, left: 0, width: 50, height: 50 });
  });
});

describe("swipeStep", () => {
  it("ignores short drags", () => expect(swipeStep(20, false)).toBe(0));
  it("LTR: swiping left goes forward", () => expect(swipeStep(-80, false)).toBe(1));
  it("LTR: swiping right goes back", () => expect(swipeStep(80, false)).toBe(-1));
  it("RTL: swiping right goes forward", () => expect(swipeStep(80, true)).toBe(1));
  it("RTL: swiping left goes back", () => expect(swipeStep(-80, true)).toBe(-1));
});

describe("shouldMarkSeen", () => {
  it("marks a finished tour that showed something", () => expect(shouldMarkSeen("done", 2)).toBe(true));
  it("marks a skipped tour", () => expect(shouldMarkSeen("skip", 1)).toBe(true));
  it("leaves a tour whose targets never appeared unseen", () => expect(shouldMarkSeen("done", 0)).toBe(false));
  it("leaves a tour cut short by navigation unseen", () => expect(shouldMarkSeen("cancel", 3)).toBe(false));
});

describe("previousShown", () => {
  it("returns the latest shown step before the current one", () => expect(previousShown([0, 2, 3], 3)).toBe(2));
  it("returns null on the first shown step", () => expect(previousShown([1], 1)).toBeNull());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern "onboardingCopy|tourLogic"`
Expected: FAIL, "Cannot find module '../onboardingCopy'" and "Cannot find module '../tourLogic'".

- [ ] **Step 3: Write `onboardingCopy.ts`**

```ts
// src/app/features/onboarding/onboardingCopy.ts
/**
 * Every onboarding string, Arabic and English. Kept apart from strings.ts so
 * the tour copy can be read and edited as one piece; onboardingCopy.test.ts
 * checks it covers the catalog exactly.
 */
import type { Lang } from "../../core/i18n/strings";
import type { TourId, WelcomeSlideId } from "./tourCatalog";

export interface StepCopy {
  title: string;
  body: string;
}

export interface OnboardingCopy {
  controls: {
    next: string;
    prev: string;
    skip: string;
    done: string;
    getStarted: string;
    showMe: string;
    whatsNew: string;
    chooseLanguage: string;
    arabic: string;
    english: string;
    dialogLabel: string;
    stepOf: (n: number, total: number) => string;
  };
  slides: Record<WelcomeSlideId, StepCopy>;
  tours: Record<TourId, Record<string, StepCopy>>;
  /** Keyed `${release.id}.${feature.key}`. */
  releases: Record<string, StepCopy>;
  settings: {
    section: string;
    welcome: string;
    welcomeDesc: string;
    tips: string;
    tipsDesc: string;
    tipsDone: string;
    whatsNew: string;
    whatsNewDesc: string;
    show: string;
    replay: string;
  };
}

const ar: OnboardingCopy = {
  controls: {
    next: "التالي",
    prev: "السابق",
    skip: "تخطي",
    done: "تم",
    getStarted: "ابدأ الآن",
    showMe: "أرني",
    whatsNew: "ما الجديد",
    chooseLanguage: "اختر اللغة",
    arabic: "العربية",
    english: "English",
    dialogLabel: "جولة تعريفية",
    stepOf: (n, total) => `الخطوة ${n} من ${total}`,
  },
  slides: {
    welcome: { title: "أهلًا بك في رفيق", body: "بسم الله الرحمن الرحيم — رفيقك اليومي مع القرآن والأذكار والصلاة." },
    read: { title: "اقرأ واستمع", body: "مصحف بألوان التجويد، وتفاسير، ونخبة من القرّاء — ويعمل دون اتصال." },
    recite: { title: "سمّع واحفظ", body: "سمّع من حفظك فتظهر الآيات كلمة بكلمة، وأخفِ الآيات لتراجع، وسِر على خطة حفظ." },
    quiz: { title: "اختبر حفظك", body: "ثلاثة اختبارات: أكمل الآية، والمتشابهات، وأكمل النهايات." },
    worship: { title: "عبادتك اليومية", body: "أذكار الصباح والمساء وغيرها مع عدّاد، ومتابع لعباداتك يومًا بيوم." },
    prayer: { title: "الصلاة والقبلة", body: "مواقيت الصلاة حسب موقعك، وبوصلة القبلة، وأداة على الشاشة الرئيسية في أندرويد." },
  },
  tours: {
    home: {
      tabs: { title: "التنقل", body: "كل أقسام التطبيق في الشريط السفلي: الرئيسية والمصحف والاختبارات والأذكار والحفظ." },
      more: { title: "المزيد", body: "مواقيت الصلاة والقبلة، ومتابع العبادات، والحساب، والإعدادات." },
    },
    viewer: {
      swipe: { title: "قلّب الصفحات", body: "اسحب يمينًا أو يسارًا للانتقال بين الصفحات." },
      pill: { title: "السور والأجزاء", body: "اضغط هنا للانتقال إلى أي سورة أو جزء أو حزب." },
      play: { title: "استمع أو سمّع", body: "اضغط للاستماع إلى التلاوة، واضغط مطوّلًا للتبديل إلى وضع التسميع." },
      hide: { title: "أخفِ للمراجعة", body: "أخفِ الآيات لتختبر حفظك، ثم اكشفها كلمة كلمة." },
      verse: { title: "خيارات الآية", body: "اضغط مطوّلًا على أي كلمة، أو على رقم الآية، للتفسير والملاحظات والعلامات." },
      nav: { title: "العلامات والبحث", body: "افتح آياتك المحفوظة، أو ابحث في نص القرآن." },
      immersive: { title: "قراءة بلا مشتّتات", body: "انقر مرتين لإخفاء الأشرطة والتركيز على الصفحة، وانقر مرتين مجددًا لإظهارها." },
    },
    "viewer.verseSheet": {
      actions: { title: "استمع ودوّن واحفظ", body: "شغّل الآية، أو أضف ملاحظة، أو ضع عليها علامة." },
      tafsir: { title: "التفسير", body: "اختر التفسير، أو نزّل تفسيرًا جديدًا من المكتبة." },
      swipe: { title: "الآية التالية", body: "اسحب على الآية للانتقال إلى الآية التالية أو السابقة." },
    },
    "viewer.playbackSheet": {
      range: { title: "حدّد المقطع", body: "اختر آية البداية وآية النهاية." },
      quick: { title: "اختيار سريع", body: "هذه الصفحة أو السورة أو الجزء أو القرآن كاملًا بنقرة واحدة." },
      reciter: { title: "القارئ", body: "اختر القارئ، ونزّل السور للاستماع دون اتصال." },
      speed: { title: "السرعة والتكرار", body: "غيّر سرعة التلاوة، وكرّر كل آية أو المقطع كله لتحفظ." },
    },
    "viewer.playbackBar": {
      controls: { title: "التحكم في التلاوة", body: "الآية السابقة والتالية، والإيقاف المؤقت، والإيقاف، وإعدادات التشغيل." },
    },
    "viewer.reciteBar": {
      transcript: { title: "ما تقرؤه", body: "يظهر هنا ما يسمعه رفيق، وتنكشف الآيات كلما قرأتها صحيحة." },
      reveal: { title: "توقفت؟", body: "اكشف الكلمة التالية أو الآية التالية." },
      stop: { title: "إنهاء التسميع", body: "اضغط لإيقاف الاستماع." },
    },
    "viewer.reveal": {
      word: { title: "اكشف كلمة", body: "يُظهر الكلمة التالية من الآيات المخفية." },
      verse: { title: "اكشف آية", body: "يُظهر الآية التالية كاملة." },
    },
    surahJuz: {
      tabs: { title: "تصفّح كما تحب", body: "حسب السورة، أو الجزء، أو الحزب وأرباعه." },
    },
    search: {
      input: { title: "ابحث في القرآن", body: "اكتب كلمات من الآية لتجدها في المصحف." },
      recents: { title: "عمليات البحث الأخيرة", body: "اضغط على أي بحث سابق لتعيده." },
    },
    quizList: {
      ayah: { title: "أكمل الآية", body: "تُعرض عليك بداية آية، فتكملها من حفظك." },
      mutashabihat: { title: "المتشابهات", body: "ميّز بين الآيات المتشابهة وأكمل الصحيحة منها." },
      nehayat: { title: "أكمل النهايات", body: "اختر النهاية الصحيحة للآية بعد علامة الوقف." },
    },
    quizSetup: {
      mode: { title: "بسيط أو متقدّم", body: "الوضع المتقدّم يتيح لك الجمع بين عدة نطاقات." },
      scope: { title: "النطاق", body: "اختبر نفسك في سور أو صفحات أو أجزاء." },
      count: { title: "عدد الأسئلة", body: "اختر عدد أسئلة الاختبار." },
      start: { title: "ابدأ", body: "ابدأ الاختبار متى كنت مستعدًا." },
    },
    azkar: {
      mine: { title: "أذكاري", body: "الأذكار التي تميّزها بنجمة تجتمع هنا." },
      progress: { title: "تقدّمك", body: "يظهر على كل قسم مقدار ما أتممته." },
    },
    azkarCategory: {
      counter: { title: "العدّاد", body: "اضغط مع كل تكرار حتى يكتمل العدد." },
      star: { title: "أضف إلى أذكاري", body: "ميّز الذكر بنجمة ليظهر في أذكاري." },
      swipe: { title: "ابدأ من جديد", body: "اسحب البطاقة جانبًا لتصفير عدّادها." },
      ref: { title: "المصدر", body: "اعرض مصدر هذا الذكر." },
    },
    hifzSetup: {
      add: { title: "محفوظك", body: "أضف السور أو الأجزاء أو الصفحات التي تحفظها." },
      goal: { title: "مقدار كل جلسة", body: "حدّد مقدار ما تراجعه في كل جلسة." },
      generate: { title: "أنشئ خطتك", body: "يقسّم رفيق محفوظك إلى جلسات مراجعة." },
    },
    hifzDashboard: {
      hero: { title: "اسحب للمزيد", body: "اسحب البطاقة لترى إحصاءاتك وأفضل خططك." },
      streak: { title: "أيامك المتتالية", body: "اضغط لترى سلسلة أيامك." },
      sessions: { title: "كل الجلسات", body: "اعرض جلسات خطتك وعلّم ما أنجزته." },
    },
    hifzSessions: {
      done: { title: "أنجزتها", body: "علّم الجلسة عند الانتهاء منها." },
      open: { title: "راجع واختبر", body: "افتح الجلسة في المصحف، أو اختبر نفسك فيها بعد إنجازها." },
    },
    more: {
      cards: { title: "المزيد من رفيق", body: "مواقيت الصلاة والقبلة، ومتابع العبادات، والحساب، والإعدادات." },
    },
    prayerTimes: {
      grant: { title: "موقعك", body: "اسمح بالوصول إلى موقعك لحساب مواقيت الصلاة واتجاه القبلة." },
      next: { title: "الصلاة القادمة", body: "الوقت المتبقي حتى الصلاة القادمة." },
      qibla: { title: "القبلة", body: "أدر هاتفك حتى يشير المؤشر إلى الكعبة." },
      menu: { title: "الخيارات", body: "طريقة الحساب والمذهب، والمواقيت المعروضة، وإعدادات الأداة." },
    },
    tracker: {
      item: { title: "سجّل عبادتك", body: "اضغط على العبادة بعد أدائها." },
      locked: { title: "لم يحن وقتها", body: "تُفتح كل عبادة عند دخول وقتها." },
      shortcut: { title: "اختصار", body: "اضغط مطوّلًا على الأذكار أو ورد القرآن لتفتحها مباشرة." },
      strip: { title: "الأيام السابقة", body: "اختر يومًا من الأسبوع أو من التقويم لتراجعه أو تعدّله." },
      header: { title: "الإعدادات والمساعدة", body: "اختر ما تتابعه ووزن كل قسم، واقرأ كيف تُحسب النتيجة." },
    },
    bookmarks: {
      tabs: { title: "علاماتك", body: "الآيات المحفوظة، وجلسات الاستماع التي يمكنك استئنافها." },
    },
    settings: {
      look: { title: "اللغة والمظهر", body: "بدّل بين العربية والإنجليزية، وبين الوضع الليلي والنهاري." },
      sync: { title: "المحتوى دون اتصال", body: "يُبقي رفيق المحتوى محدّثًا، ويمكنك المزامنة الآن." },
      reminders: { title: "تذكير الصلاة", body: "تنبيه عند دخول وقت كل صلاة." },
      tours: { title: "الجولات والنصائح", body: "أعد مشاهدة شرائح الترحيب ونصائح الصفحات من هنا." },
    },
    tafsirLibrary: {
      library: { title: "مكتبة التفاسير", body: "نزّل تفسيرًا لتقرأه دون اتصال." },
      downloaded: { title: "تفاسيرك", body: "التفاسير المنزّلة، احذفها أو أعد تنزيلها من هنا." },
    },
    account: {
      notes: { title: "ملاحظاتك", body: "كل ملاحظاتك على الآيات في مكان واحد." },
      backup: { title: "النسخ الاحتياطي", body: "صدّر بياناتك واستعدها على جهاز آخر." },
      streak: { title: "احمِ سلسلتك", body: "استخدم التجميد لتحافظ على سلسلتك في يوم يفوتك." },
    },
  },
  releases: {},
  settings: {
    section: "الجولات والنصائح",
    welcome: "شرائح الترحيب",
    welcomeDesc: "شاهد التعريف بالتطبيق من جديد",
    tips: "نصائح الصفحات",
    tipsDesc: "أعد عرض النصائح عند زيارة كل صفحة",
    tipsDone: "ستظهر النصائح مجددًا عند زيارة كل صفحة.",
    whatsNew: "ما الجديد",
    whatsNewDesc: "آخر الميزات المضافة",
    show: "عرض",
    replay: "إعادة",
  },
};

const en: OnboardingCopy = {
  controls: {
    next: "Next",
    prev: "Previous",
    skip: "Skip",
    done: "Done",
    getStarted: "Get started",
    showMe: "Show me",
    whatsNew: "What's new",
    chooseLanguage: "Choose your language",
    arabic: "العربية",
    english: "English",
    dialogLabel: "Guided tour",
    stepOf: (n, total) => `Step ${n} of ${total}`,
  },
  slides: {
    welcome: { title: "Welcome to Rafeeq", body: "In the name of Allah — your daily companion for the Quran, azkar and prayer." },
    read: { title: "Read & listen", body: "A Tajweed-coloured mushaf, tafsir and a choice of reciters — all working offline." },
    recite: { title: "Recite & memorize", body: "Recite from memory and the verses appear word by word. Hide verses to revise, and follow a Hifz plan." },
    quiz: { title: "Test yourself", body: "Three quizzes: Complete the Verse, Similar Verses and Verse Endings." },
    worship: { title: "Daily worship", body: "Morning, evening and other azkar with a counter, plus a tracker for your daily worship." },
    prayer: { title: "Prayer & Qibla", body: "Prayer times for your location, a Qibla compass and a home-screen widget on Android." },
  },
  tours: {
    home: {
      tabs: { title: "Getting around", body: "Every section is one tap away in the bar below: Home, Quran, Quiz, Azkar and Hifz." },
      more: { title: "More", body: "Prayer times & Qibla, the Worship Tracker, your account and settings." },
    },
    viewer: {
      swipe: { title: "Turn pages", body: "Swipe left or right to move between pages." },
      pill: { title: "Surahs & juz", body: "Tap to jump to any surah, juz or hizb." },
      play: { title: "Listen or recite", body: "Tap to listen. Long-press to switch to recite mode." },
      hide: { title: "Hide to revise", body: "Hide the verses to test your memory, then reveal them word by word." },
      verse: { title: "Verse options", body: "Long-press any word, or tap a verse number, for tafsir, notes and bookmarks." },
      nav: { title: "Bookmarks & search", body: "Open your saved verses, or search the Quran text." },
      immersive: { title: "Distraction-free", body: "Double-tap to hide the bars and focus on the page. Double-tap again to bring them back." },
    },
    "viewer.verseSheet": {
      actions: { title: "Play, note, bookmark", body: "Play this verse, add a note, or bookmark it." },
      tafsir: { title: "Tafsir", body: "Pick a tafsir, or download one from the library." },
      swipe: { title: "Next verse", body: "Swipe the verse to move to the next or previous one." },
    },
    "viewer.playbackSheet": {
      range: { title: "Choose a range", body: "Pick the first and last verse." },
      quick: { title: "Quick select", body: "This page, surah, juz or the whole Quran in one tap." },
      reciter: { title: "Reciter", body: "Choose a reciter and download surahs to listen offline." },
      speed: { title: "Speed & repeat", body: "Change the speed, and repeat each verse or the whole range to memorize." },
    },
    "viewer.playbackBar": {
      controls: { title: "Playback controls", body: "Previous and next verse, pause, stop, and playback settings." },
    },
    "viewer.reciteBar": {
      transcript: { title: "What you recite", body: "What Rafeeq hears shows here, and verses appear as you recite them correctly." },
      reveal: { title: "Stuck?", body: "Reveal the next word or the next verse." },
      stop: { title: "Stop reciting", body: "Tap to stop listening." },
    },
    "viewer.reveal": {
      word: { title: "Reveal a word", body: "Shows the next hidden word." },
      verse: { title: "Reveal a verse", body: "Shows the whole next verse." },
    },
    surahJuz: {
      tabs: { title: "Browse your way", body: "By surah, by juz, or by hizb and its quarters." },
    },
    search: {
      input: { title: "Search the Quran", body: "Type words from a verse to find it in the mushaf." },
      recents: { title: "Recent searches", body: "Tap a previous search to run it again." },
    },
    quizList: {
      ayah: { title: "Complete the Verse", body: "You see the start of a verse and finish it from memory." },
      mutashabihat: { title: "Similar Verses", body: "Tell similar verses apart and complete the right one." },
      nehayat: { title: "Verse Endings", body: "Pick the correct ending of a verse after the pause mark." },
    },
    quizSetup: {
      mode: { title: "Simple or advanced", body: "Advanced lets you combine several ranges." },
      scope: { title: "Scope", body: "Test yourself on surahs, pages or juz." },
      count: { title: "Questions", body: "Choose how many questions to answer." },
      start: { title: "Start", body: "Start the quiz when you're ready." },
    },
    azkar: {
      mine: { title: "My Azkar", body: "Azkar you star are collected here." },
      progress: { title: "Your progress", body: "Each category shows how much you've completed." },
    },
    azkarCategory: {
      counter: { title: "Counter", body: "Tap once for each repetition until the count is complete." },
      star: { title: "Add to My Azkar", body: "Star a zikr to keep it in My Azkar." },
      swipe: { title: "Start over", body: "Swipe a card sideways to reset its counter." },
      ref: { title: "Source", body: "See where this zikr comes from." },
    },
    hifzSetup: {
      add: { title: "What you know", body: "Add the surahs, juz or pages you've memorized." },
      goal: { title: "Per-session goal", body: "Set how much to review in each session." },
      generate: { title: "Build your plan", body: "Rafeeq splits what you know into review sessions." },
    },
    hifzDashboard: {
      hero: { title: "Swipe for more", body: "Swipe the card to see your stats and best plans." },
      streak: { title: "Your streak", body: "Tap to see your run of consecutive days." },
      sessions: { title: "All sessions", body: "See every session in your plan and mark what's done." },
    },
    hifzSessions: {
      done: { title: "Mark it done", body: "Tick a session off when you finish it." },
      open: { title: "Review & test", body: "Open a session in the mushaf, or quiz yourself on it once it's done." },
    },
    more: {
      cards: { title: "More of Rafeeq", body: "Prayer times & Qibla, the Worship Tracker, Account and Settings." },
    },
    prayerTimes: {
      grant: { title: "Your location", body: "Allow location access to work out prayer times and the Qibla." },
      next: { title: "Next prayer", body: "Time left until the next prayer." },
      qibla: { title: "Qibla", body: "Turn your phone until the needle points to the Kaaba." },
      menu: { title: "Options", body: "Calculation method, madhab, which times to show, and widget settings." },
    },
    tracker: {
      item: { title: "Log it", body: "Tap an act of worship once you've done it." },
      locked: { title: "Not yet", body: "Each act unlocks when its time comes in." },
      shortcut: { title: "Shortcut", body: "Long-press azkar or Quran items to open them directly." },
      strip: { title: "Past days", body: "Pick a day from the week or the calendar to review or edit it." },
      header: { title: "Settings & help", body: "Choose what to track and how much each part counts, and read how scoring works." },
    },
    bookmarks: {
      tabs: { title: "Your bookmarks", body: "Saved verses, and listening sessions you can resume." },
    },
    settings: {
      look: { title: "Language & look", body: "Switch between Arabic and English, and between night and day mode." },
      sync: { title: "Offline content", body: "Rafeeq keeps content up to date; you can also sync now." },
      reminders: { title: "Prayer reminders", body: "Get notified when each prayer time comes in." },
      tours: { title: "Tours & tips", body: "Replay the welcome slides and page tips from here." },
    },
    tafsirLibrary: {
      library: { title: "Tafsir library", body: "Download a tafsir to read offline." },
      downloaded: { title: "Your tafsirs", body: "Downloaded tafsirs — remove or re-download them here." },
    },
    account: {
      notes: { title: "Your notes", body: "All your verse notes in one place." },
      backup: { title: "Backup", body: "Export your data and restore it on another device." },
      streak: { title: "Protect your streak", body: "Use a freeze to keep your streak on a day you miss." },
    },
  },
  releases: {},
  settings: {
    section: "Tours & tips",
    welcome: "Welcome slides",
    welcomeDesc: "See the app introduction again",
    tips: "Page tips",
    tipsDesc: "Show tips again as you visit each page",
    tipsDone: "Tips will show again as you visit each page.",
    whatsNew: "What's new",
    whatsNewDesc: "The latest features",
    show: "Show",
    replay: "Replay",
  },
};

export const ONBOARDING_COPY: Record<Lang, OnboardingCopy> = { ar, en };
```

- [ ] **Step 4: Write `tourLogic.ts`**

```ts
// src/app/features/onboarding/tourLogic.ts
/**
 * Pure onboarding rules, kept out of the components so they can be tested
 * without React: which deck opens at launch, which tour runs next, where the
 * card sits, which element a step points at.
 */
import type { OnboardingState } from "./onboardingStore";
import type { Release, TourId } from "./tourCatalog";

export type Deck = { kind: "welcome" } | { kind: "whatsNew"; releases: Release[] } | null;

export function unseenReleases(state: OnboardingState, releases: Release[]): Release[] {
  return releases.filter((r) => !state.seenReleases.includes(r.id));
}

export function launchDeck(state: OnboardingState | null, releases: Release[]): Deck {
  if (!state) return null;
  if (!state.welcomeDone) return { kind: "welcome" };
  const fresh = unseenReleases(state, releases);
  return fresh.length > 0 ? { kind: "whatsNew", releases: fresh } : null;
}

export function pendingTours(state: OnboardingState | null, ids: TourId[]): TourId[] {
  if (!state) return [];
  return ids.filter((id) => !state.seenTours.includes(id));
}

export interface TourRequest {
  tourId: TourId;
  /** May start while a sheet is open: the tour belongs to that sheet. */
  overOverlay: boolean;
  onBeforeStart?: () => void;
}

/** Index of the first request allowed to start now, or -1. */
export function pickNext(queue: TourRequest[], overlayOpen: boolean): number {
  return queue.findIndex((r) => r.overOverlay || !overlayOpen);
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The card moves to the top when the target's centre is in the lower 40%. */
export function cardPlacement(target: Box, viewportHeight: number): "top" | "bottom" {
  return target.top + target.height / 2 > viewportHeight * 0.6 ? "top" : "bottom";
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Finds a step's target on the page the user is looking at. Ionic keeps
 * earlier pages mounted but hidden, and the bottom nav exists on every page,
 * so hidden copies and zero-size elements are ignored.
 */
export function resolveTarget(
  root: ParentNode,
  ref: string,
  union: boolean,
): { box: Box; element: Element } | null {
  const hits: { box: Box; element: Element }[] = [];
  root.querySelectorAll(`[data-tour~="${ref}"]`).forEach((element) => {
    if (element.closest(".ion-page-hidden, .ion-page-invisible")) return;
    const r = element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    hits.push({ element, box: { top: r.top, left: r.left, width: r.width, height: r.height } });
  });
  if (hits.length === 0) return null;
  if (!union) return hits[0];
  return { element: hits[0].element, box: unionBox(hits.map((h) => h.box)) as Box };
}

/** 1 = forward, -1 = back, 0 = not a swipe. Forward is leftward in LTR, rightward in RTL. */
export function swipeStep(dx: number, isRTL: boolean, threshold = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  const forward = isRTL ? dx > 0 : dx < 0;
  return forward ? 1 : -1;
}

/**
 * A tour counts as seen once the user has been shown at least one step and
 * finished or skipped it. A tour cut short by navigation, or one whose targets
 * never appeared, stays unseen so it can run on the next visit.
 */
export function shouldMarkSeen(reason: "done" | "skip" | "cancel", shownSteps: number): boolean {
  return reason !== "cancel" && shownSteps > 0;
}

/** The step "Previous" returns to: the latest shown step before `index`. */
export function previousShown(shown: number[], index: number): number | null {
  const earlier = shown.filter((i) => i < index);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern "onboarding"`
Expected: PASS for `onboardingStore`, `onboardingCopy` and `tourLogic`.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/onboarding/onboardingCopy.ts src/app/features/onboarding/tourLogic.ts src/app/features/onboarding/__tests__/onboardingCopy.test.ts src/app/features/onboarding/__tests__/tourLogic.test.ts
git commit -m "Add onboarding copy and tour rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Illustrations, styles and slide decks

**Files:**
- Create: `src/app/features/onboarding/illustrations.tsx`
- Create: `src/app/features/onboarding/onboarding.css`
- Create: `src/app/features/onboarding/SlideDeck.tsx`
- Create: `src/app/features/onboarding/WelcomeSlides.tsx`
- Create: `src/app/features/onboarding/WhatsNew.tsx`

**Interfaces:**
- Consumes:
  - `useLang()` from `src/app/core/context/LanguageContext.tsx`, which gives `{ lang, setLang, isRTL }`
  - `registerOverlay(close): () => void` from `src/app/core/utils/overlay-registry.ts`
  - `ONBOARDING_COPY` and `swipeStep` (Task 3)
  - `WELCOME_SLIDES`, `IllustrationId`, `Release` (Task 2)
- Produces:
  - `Illustration: React.FC<{ id: IllustrationId }>`
  - `interface DeckSlide { key: string; art: IllustrationId; title: string; body: string; extra?: React.ReactNode; action?: { label: string; onClick: () => void } }`
  - `Dots: React.FC<{ count: number; active: number }>`
  - `SlideDeck: React.FC<{ slides: DeckSlide[]; eyebrow?: string; finishLabel: string; onFinish: () => void; onSkip: () => void }>`
  - `WelcomeSlides: React.FC<{ onDone: () => void }>`
  - `WhatsNew: React.FC<{ releases: Release[]; onDone: () => void; onShowMe: (route: string) => void }>`

These are presentational; their logic (`swipeStep`) is tested in Task 3, and they get a visual check in Task 6.

- [ ] **Step 1: Write `illustrations.tsx`**

```tsx
// src/app/features/onboarding/illustrations.tsx
/**
 * Gold line-art for the welcome and "What's new" slides. Strokes use
 * currentColor so the deck's --color-gold drives them in day and night.
 */
import React from "react";
import type { IllustrationId } from "./tourCatalog";

const ART: Record<IllustrationId, React.ReactNode> = {
  brand: (
    <>
      <rect x="45" y="45" width="70" height="70" rx="4" />
      <rect x="45" y="45" width="70" height="70" rx="4" transform="rotate(45 80 80)" />
      <circle cx="80" cy="80" r="20" />
      <path d="M86 70a11 11 0 1 0 0 20a8.5 8.5 0 1 1 0-20z" />
    </>
  ),
  mushaf: (
    <>
      <path d="M80 52C64 42 40 42 28 48v64c12-6 36-6 52 4c16-10 40-10 52-4V48c-12-6-36-6-52 4z" />
      <path d="M80 52v64" />
      <path d="M40 64c10-3 22-3 32 0M40 78c10-3 22-3 32 0M40 92c10-3 22-3 32 0M88 64c10-3 22-3 32 0M88 78c10-3 22-3 32 0M88 92c10-3 22-3 32 0" opacity=".55" />
      <path d="M48 130l32-14 32 14M60 138l20-10 20 10" />
    </>
  ),
  recite: (
    <>
      <path d="M28 128q52-20 104 0V82q-52-20-104 0z" />
      <path d="M80 72v46" />
      <path d="M40 92q14-5 28-2M40 106q14-5 28-2M92 90q14-3 28 2M92 104q14-3 28 2" opacity=".55" />
      <rect x="68" y="12" width="24" height="38" rx="12" />
      <path d="M58 36q0 24 22 24t22-24" opacity=".75" />
      <path d="M42 28q-8 10 0 20M118 28q8 10 0 20" opacity=".5" />
    </>
  ),
  quiz: (
    <>
      <rect x="36" y="26" width="88" height="112" rx="10" />
      <path d="M52 56l8 8 14-16" />
      <path d="M84 58h26" opacity=".7" />
      <path d="M52 88l8 8 14-16" />
      <path d="M84 90h26" opacity=".7" />
      <path d="M54 118h52" opacity=".45" />
    </>
  ),
  worship: (
    <>
      <circle cx="62" cy="70" r="34" strokeDasharray="0.5 10" strokeWidth="7" />
      <path d="M62 104v14" />
      <circle cx="62" cy="124" r="5" />
      <rect x="100" y="66" width="40" height="58" rx="6" />
      <path d="M108 84l5 5 9-10M108 106l5 5 9-10" />
    </>
  ),
  qibla: (
    <>
      <circle cx="80" cy="88" r="48" />
      <path d="M80 40v8M80 128v8M32 88h8M120 88h8" />
      <path d="M80 60l10 28-10 28-10-28z" />
      <path d="M66 32V22q14-16 28 0v10" opacity=".7" />
    </>
  ),
};

export const Illustration: React.FC<{ id: IllustrationId }> = ({ id }) => (
  <svg
    viewBox="0 0 160 160"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ART[id]}
  </svg>
);
```

- [ ] **Step 2: Write `onboarding.css`**

```css
/* src/app/features/onboarding/onboarding.css
   Welcome / What's new decks and the spotlight overlay. Above every app
   surface; colours only from theme tokens so day and night both work. */

/* ── Shared ─────────────────────────────────────── */
.ob-btn {
  min-height: 44px;
  min-width: 44px;
  padding: 0 var(--space-5);
  border: none;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ob-btn--primary { background: var(--color-gold); color: #111; }
.ob-btn--ghost {
  background: transparent;
  border: 1px solid var(--color-gold);
  color: var(--color-gold);
}
.ob-btn--link {
  background: none;
  color: var(--color-text-muted);
  padding: 0 var(--space-2);
  font-weight: 400;
}
.ob-dots { display: flex; justify-content: center; gap: 6px; }
.ob-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--color-gold-subtle);
  transition: width 0.2s ease;
}
.ob-dot.is-on { width: 18px; background: var(--color-gold); }
.ob-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ── Slide decks ────────────────────────────────── */
.ob-deck {
  position: fixed;
  inset: 0;
  z-index: 30000;
  display: flex;
  justify-content: center;
  background: var(--color-bg-app);
  color: var(--color-text-primary);
}
.ob-deck-inner {
  width: 100%;
  max-width: var(--max-width-mobile, 600px);
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-inset-top) + var(--space-3)) var(--space-5)
    calc(var(--safe-inset-bottom) + var(--space-5));
}
.ob-deck-top { display: flex; justify-content: flex-end; min-height: 44px; }
.ob-deck-slide {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  text-align: center;
  overflow-y: auto;
  touch-action: pan-y;
  animation: ob-slide-in 0.25s ease-out;
}
.ob-deck-art { width: min(56vw, 200px); color: var(--color-gold); }
.ob-deck-art svg { width: 100%; height: auto; display: block; }
.ob-deck-eyebrow {
  margin: 0;
  color: var(--color-gold);
  font-size: var(--text-sm);
  letter-spacing: var(--tracking-wide);
}
.ob-deck-title {
  margin: 0;
  font-family: var(--font-arabic-display);
  font-size: var(--text-2xl);
  color: var(--color-gold);
  outline: none;
}
.ob-deck-body {
  margin: 0;
  max-width: 34ch;
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
.ob-deck .ob-dots { margin: var(--space-4) 0; }
.ob-deck-nav { display: flex; justify-content: space-between; align-items: center; }
.ob-lang-row { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
.ob-lang-btn {
  min-height: 44px;
  padding: 0 var(--space-5);
  border: 1px solid var(--color-gold-subtle);
  border-radius: var(--radius-pill);
  background: var(--color-gold-faint);
  color: var(--color-text-primary);
  font: inherit;
  cursor: pointer;
}
.ob-lang-btn.is-active {
  background: var(--color-gold);
  border-color: var(--color-gold);
  color: #111;
}
@keyframes ob-slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

/* ── Spotlight ──────────────────────────────────── */
.ob-spot { position: fixed; inset: 0; z-index: 30000; touch-action: none; }
.ob-spot-ring {
  position: fixed;
  border-radius: 12px;
  box-shadow: 0 0 0 2px var(--color-gold), 0 0 0 9999px rgba(0, 0, 0, 0.72);
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
}
.ob-card {
  position: fixed;
  left: var(--space-4);
  right: var(--space-4);
  margin: 0 auto;
  max-width: var(--max-width-mobile, 600px);
  padding: var(--space-4);
  background: var(--color-bg-card);
  border: 1px solid var(--color-gold-subtle);
  border-radius: var(--radius-xl);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  color: var(--color-text-secondary);
  outline: none;
  animation: ob-slide-in 0.2s ease-out;
}
.ob-card--bottom { bottom: calc(var(--safe-inset-bottom) + var(--space-4)); }
.ob-card--top { top: calc(var(--safe-inset-top) + var(--space-4)); }
.ob-card-title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-gold);
}
.ob-card-body { margin: 0; font-size: var(--text-base); line-height: var(--leading-normal); }
.ob-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.ob-card-actions { display: flex; align-items: center; gap: var(--space-1); }

/* ── Gesture glyph ──────────────────────────────── */
.ob-gesture {
  position: fixed;
  width: 40px;
  height: 40px;
  margin: -6px 0 0 -14px;
  color: var(--color-gold);
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}
.ob-gesture svg { width: 100%; height: 100%; }
.ob-gesture--swipe { animation: ob-swipe 1.6s ease-in-out infinite alternate; }
.ob-gesture--longPress { animation: ob-press 1.4s ease-in-out infinite; }
.ob-gesture--doubleTap { animation: ob-double 1.4s ease-in-out infinite; }
@keyframes ob-swipe {
  from { transform: translateX(-36px); }
  to { transform: translateX(36px); }
}
@keyframes ob-press {
  0%, 100% { transform: scale(1); }
  20%, 80% { transform: scale(0.86); }
}
@keyframes ob-double {
  0%, 30%, 60%, 100% { transform: scale(1); }
  15%, 45% { transform: scale(0.84); }
}
@media (prefers-reduced-motion: reduce) {
  .ob-gesture, .ob-deck-slide, .ob-card { animation: none; }
  .ob-spot-ring { transition: none; }
}
```

- [ ] **Step 3: Write `SlideDeck.tsx`**

```tsx
// src/app/features/onboarding/SlideDeck.tsx
/**
 * Full-screen slide shell shared by the welcome and "What's new" decks.
 * Back / edge swipe closes it as Skip through the overlay registry.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import { Illustration } from "./illustrations";
import { ONBOARDING_COPY } from "./onboardingCopy";
import type { IllustrationId } from "./tourCatalog";
import { swipeStep } from "./tourLogic";
import "./onboarding.css";

export interface DeckSlide {
  key: string;
  art: IllustrationId;
  title: string;
  body: string;
  extra?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

export const Dots: React.FC<{ count: number; active: number }> = ({ count, active }) => (
  <div className="ob-dots" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <span key={i} className={"ob-dot" + (i === active ? " is-on" : "")} />
    ))}
  </div>
);

interface Props {
  slides: DeckSlide[];
  eyebrow?: string;
  finishLabel: string;
  onFinish: () => void;
  onSkip: () => void;
}

export const SlideDeck: React.FC<Props> = ({ slides, eyebrow, finishLabel, onFinish, onSkip }) => {
  const { lang, isRTL } = useLang();
  const c = ONBOARDING_COPY[lang].controls;
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;

  useEffect(() => registerOverlay(() => skipRef.current()), []);
  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  const slide = slides[Math.min(index, slides.length - 1)];
  const isLast = index >= slides.length - 1;

  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const step = swipeStep(e.clientX - startX.current, isRTL);
    startX.current = null;
    if (step === 1 && !isLast) setIndex(index + 1);
    if (step === -1 && index > 0) setIndex(index - 1);
  };

  return createPortal(
    <div className="ob-deck" role="dialog" aria-modal="true" aria-label={c.dialogLabel}>
      <div className="ob-deck-inner">
        <div className="ob-deck-top">
          <button type="button" className="ob-btn ob-btn--link" onClick={onSkip}>
            {c.skip}
          </button>
        </div>
        <div
          className="ob-deck-slide"
          key={slide.key}
          onPointerDown={(e) => {
            startX.current = e.clientX;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            startX.current = null;
          }}
        >
          <div className="ob-deck-art">
            <Illustration id={slide.art} />
          </div>
          {eyebrow && <p className="ob-deck-eyebrow">{eyebrow}</p>}
          <h2 ref={titleRef} tabIndex={-1} className="ob-deck-title">
            {slide.title}
          </h2>
          <p className="ob-deck-body">{slide.body}</p>
          {slide.extra}
          {slide.action && (
            <button type="button" className="ob-btn ob-btn--ghost" onClick={slide.action.onClick}>
              {slide.action.label}
            </button>
          )}
        </div>
        <p className="ob-sr" aria-live="polite">
          {c.stepOf(index + 1, slides.length)}
        </p>
        <Dots count={slides.length} active={index} />
        <div className="ob-deck-nav">
          {index > 0 ? (
            <button type="button" className="ob-btn ob-btn--link" onClick={() => setIndex(index - 1)}>
              {c.prev}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="ob-btn ob-btn--primary"
            onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
          >
            {isLast ? finishLabel : c.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Write `WelcomeSlides.tsx` and `WhatsNew.tsx`**

```tsx
// src/app/features/onboarding/WelcomeSlides.tsx
import React from "react";
import { useLang } from "../../core/context/LanguageContext";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { SlideDeck, DeckSlide } from "./SlideDeck";
import { WELCOME_SLIDES } from "./tourCatalog";

/** First-install deck. Slide 1 sets the language the rest is read in. */
export const WelcomeSlides: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { lang, setLang } = useLang();
  const c = ONBOARDING_COPY[lang];

  const langPick = (
    <div className="ob-lang-row" role="group" aria-label={c.controls.chooseLanguage}>
      {(["ar", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={"ob-lang-btn" + (lang === l ? " is-active" : "")}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {l === "ar" ? c.controls.arabic : c.controls.english}
        </button>
      ))}
    </div>
  );

  const slides: DeckSlide[] = WELCOME_SLIDES.map((s) => ({
    key: s.id,
    art: s.art,
    ...c.slides[s.id],
    extra: s.id === "welcome" ? langPick : undefined,
  }));

  return <SlideDeck slides={slides} finishLabel={c.controls.getStarted} onFinish={onDone} onSkip={onDone} />;
};
```

```tsx
// src/app/features/onboarding/WhatsNew.tsx
import React from "react";
import { useLang } from "../../core/context/LanguageContext";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { SlideDeck, DeckSlide } from "./SlideDeck";
import type { Release } from "./tourCatalog";

/** One slide per new feature; "Show me" takes the user to it. */
export const WhatsNew: React.FC<{
  releases: Release[];
  onDone: () => void;
  onShowMe: (route: string) => void;
}> = ({ releases, onDone, onShowMe }) => {
  const { lang } = useLang();
  const c = ONBOARDING_COPY[lang];

  const slides: DeckSlide[] = releases.flatMap((r) =>
    r.features.map((f) => ({
      key: `${r.id}.${f.key}`,
      art: f.art,
      ...c.releases[`${r.id}.${f.key}`],
      action: { label: c.controls.showMe, onClick: () => onShowMe(f.route) },
    })),
  );

  return (
    <SlideDeck
      slides={slides}
      eyebrow={c.controls.whatsNew}
      finishLabel={c.controls.done}
      onFinish={onDone}
      onSkip={onDone}
    />
  );
};
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep features/onboarding`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/onboarding/illustrations.tsx src/app/features/onboarding/onboarding.css src/app/features/onboarding/SlideDeck.tsx src/app/features/onboarding/WelcomeSlides.tsx src/app/features/onboarding/WhatsNew.tsx
git commit -m "Add welcome and What's new slide decks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Spotlight overlay

**Files:**
- Create: `src/app/features/onboarding/SpotlightOverlay.tsx`

**Interfaces:**
- Consumes:
  - `resolveTarget`, `cardPlacement`, `Box` (Task 3)
  - `TourId`, `TourStep`, `Gesture` (Task 2)
  - `ONBOARDING_COPY` (Task 3), `Dots` (Task 4)
  - `registerOverlay`
- Produces:
  ```ts
  SpotlightOverlay: React.FC<{
    tourId: TourId; step: TourStep; index: number; total: number;
    canGoBack: boolean; isLast: boolean;
    onShown: () => void; onMissing: () => void;
    onNext: () => void; onPrev: () => void; onSkip: () => void;
  }>
  ```

**Behaviour:**
- Polls for the target every 100 ms for up to 1.5 s. If it's never found, it calls `onMissing`.
- It scrolls an off-screen target into view once.
- After that it re-measures every animation frame.
- It renders nothing visible until the target is found, so a missing step causes no flash of dim.
- Taps anywhere on the overlay (including over the ring) are swallowed. Only the card's buttons act.

- [ ] **Step 1: Write the component**

```tsx
// src/app/features/onboarding/SpotlightOverlay.tsx
/**
 * One spotlight step: dims the screen, rings the target in gold and explains
 * it in a card at the bottom (or the top, when the target sits low). The page
 * underneath gets no taps while it is up; only the card's buttons act.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { Dots } from "./SlideDeck";
import type { Gesture, TourId, TourStep } from "./tourCatalog";
import { Box, cardPlacement, resolveTarget } from "./tourLogic";
import "./onboarding.css";

const PAD = 6;
const FIND_TIMEOUT_MS = 1500;
const FIND_POLL_MS = 100;

const sameBox = (a: Box | null, b: Box) =>
  !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

// Pointer hand, after Lucide's "pointer" icon (ISC).
const HAND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 14a8 8 0 0 1-8 8" />
    <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
    <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
    <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

const GestureHint: React.FC<{ gesture: Gesture; box: Box }> = ({ gesture, box }) => (
  <div
    className={`ob-gesture ob-gesture--${gesture}`}
    style={{ top: box.top + box.height / 2, left: box.left + box.width / 2 }}
    aria-hidden="true"
  >
    {HAND}
  </div>
);

interface Props {
  tourId: TourId;
  step: TourStep;
  index: number;
  total: number;
  canGoBack: boolean;
  isLast: boolean;
  onShown: () => void;
  onMissing: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export const SpotlightOverlay: React.FC<Props> = ({
  tourId,
  step,
  index,
  total,
  canGoBack,
  isLast,
  onShown,
  onMissing,
  onNext,
  onPrev,
  onSkip,
}) => {
  const { lang } = useLang();
  const copy = ONBOARDING_COPY[lang];
  const text = copy.tours[tourId][step.key];
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onShown, onMissing, onSkip });
  cb.current = { onShown, onMissing, onSkip };

  useEffect(() => registerOverlay(() => cb.current.onSkip()), []);

  useEffect(() => {
    const ref = `${tourId}.${step.key}`;
    const started = Date.now();
    let found = false;
    let scrolled = false;
    let frame = 0;
    let poll: number | undefined;

    const tick = () => {
      const hit = resolveTarget(document, ref, !!step.union);
      if (hit) {
        const vh = window.innerHeight;
        const offScreen = hit.box.top < 0 || hit.box.top + hit.box.height > vh;
        if (!scrolled && offScreen && hit.box.height < vh) {
          scrolled = true;
          hit.element.scrollIntoView({ block: "center" });
        }
        setBox((prev) => (sameBox(prev, hit.box) ? prev : hit.box));
        if (!found) {
          found = true;
          cb.current.onShown();
        }
        frame = requestAnimationFrame(tick);
        return;
      }
      // A target that blinks out mid-step keeps its last ring.
      if (found) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (Date.now() - started > FIND_TIMEOUT_MS) {
        cb.current.onMissing();
        return;
      }
      poll = window.setTimeout(tick, FIND_POLL_MS);
    };

    tick();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(poll);
    };
  }, [tourId, step.key, step.union]);

  const visible = box !== null;
  useEffect(() => {
    if (visible) cardRef.current?.focus();
  }, [visible]);

  const placement = box ? cardPlacement(box, window.innerHeight) : "bottom";
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div className="ob-spot" onClick={swallow} onPointerDown={swallow}>
      {box && (
        <>
          <div
            className="ob-spot-ring"
            style={{
              top: box.top - PAD,
              left: box.left - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2,
            }}
          />
          {step.gesture && <GestureHint gesture={step.gesture} box={box} />}
          <div
            ref={cardRef}
            tabIndex={-1}
            className={`ob-card ob-card--${placement}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ob-card-title"
          >
            <p className="ob-sr" aria-live="polite">
              {copy.controls.stepOf(index + 1, total)}
            </p>
            <h2 id="ob-card-title" className="ob-card-title">
              {text.title}
            </h2>
            <p className="ob-card-body">{text.body}</p>
            <div className="ob-card-foot">
              <button type="button" className="ob-btn ob-btn--link" onClick={onSkip}>
                {copy.controls.skip}
              </button>
              <Dots count={total} active={index} />
              <div className="ob-card-actions">
                {canGoBack && (
                  <button type="button" className="ob-btn ob-btn--link" onClick={onPrev}>
                    {copy.controls.prev}
                  </button>
                )}
                <button type="button" className="ob-btn ob-btn--primary" onClick={onNext}>
                  {isLast ? copy.controls.done : copy.controls.next}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep features/onboarding`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/onboarding/SpotlightOverlay.tsx
git commit -m "Add spotlight overlay for page tours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tour provider, page hook and App wiring

**Files:**
- Create: `src/app/features/onboarding/TourProvider.tsx`
- Create: `src/app/features/onboarding/usePageTour.ts`
- Modify: `src/App.tsx` (imports; the `App` component body before the `useEffect` that calls `ensureSince`; the `<IonReactRouter>` children)
- Modify: `src/app/features/home/pages/Home.tsx`
- Modify: `src/app/shared/components/bottom-nav/BottomNavBar.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `initOnboarding`, `markTourSeen`, `markReleasesSeen`, `completeWelcome`, `resetTours`, `OnboardingState`
  - From Task 2: `RELEASES`, `RELEASE_IDS`, `TOURS`, `TourId`, `Release`
  - From Task 3: `launchDeck`, `pendingTours`, `pickNext`, `previousShown`, `shouldMarkSeen`, `TourRequest`, `Deck`
  - From Tasks 4–5: `WelcomeSlides`, `WhatsNew`, `SpotlightOverlay`
  - `hasOpenOverlay()`
- Produces:
  - `TourProvider: React.FC<{ initial: OnboardingState | null; children: React.ReactNode }>`
  - `useTours(): TourApi`, where `TourApi = { requestTours(reqs: TourRequest[]): void; cancelTours(ids: TourId[]): void; showWelcome(): void; showWhatsNew(): void; resetTours(): void; hasReleases: boolean }`
  - `usePageTour(tourIds: TourId[], opts?: { ready?: boolean; overOverlay?: boolean; onBeforeStart?: () => void }): void`

- [ ] **Step 1: Write `TourProvider.tsx`**

```tsx
// src/app/features/onboarding/TourProvider.tsx
/**
 * Owns everything onboarding shows: the launch deck (welcome or What's new)
 * and one page tour at a time from a queue. Pages ask for tours through
 * usePageTour; Settings replays through useTours.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { hasOpenOverlay } from "../../core/utils/overlay-registry";
import {
  OnboardingState,
  completeWelcome,
  markReleasesSeen,
  markTourSeen,
  resetTours as clearSeenTours,
} from "./onboardingStore";
import { SpotlightOverlay } from "./SpotlightOverlay";
import { RELEASES, RELEASE_IDS, Release, TOURS, TourId } from "./tourCatalog";
import { Deck, TourRequest, launchDeck, pendingTours, pickNext, previousShown, shouldMarkSeen } from "./tourLogic";
import { WelcomeSlides } from "./WelcomeSlides";
import { WhatsNew } from "./WhatsNew";

export interface TourApi {
  requestTours: (reqs: TourRequest[]) => void;
  cancelTours: (ids: TourId[]) => void;
  showWelcome: () => void;
  showWhatsNew: () => void;
  resetTours: () => void;
  hasReleases: boolean;
}

const NOOP: TourApi = {
  requestTours: () => {},
  cancelTours: () => {},
  showWelcome: () => {},
  showWhatsNew: () => {},
  resetTours: () => {},
  hasReleases: false,
};

const Ctx = createContext<TourApi>(NOOP);
export const useTours = () => useContext(Ctx);

interface ActiveTour {
  req: TourRequest;
  index: number;
  /** Step indices actually displayed, for "Previous" and for marking seen. */
  shown: number[];
}

/** How long a request blocked by an open sheet waits before re-checking. */
const GATE_RETRY_MS = 400;

export const TourProvider: React.FC<{ initial: OnboardingState | null; children: React.ReactNode }> = ({
  initial,
  children,
}) => {
  const history = useHistory();
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [deck, setDeck] = useState<Deck>(() => launchDeck(initial, RELEASES));
  const [queue, setQueue] = useState<TourRequest[]>([]);
  const [active, setActive] = useState<ActiveTour | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [retry, setRetry] = useState(0);

  const commit = useCallback((next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const endTour = useCallback(
    (reason: "done" | "skip" | "cancel") => {
      const a = activeRef.current;
      if (!a) return;
      const s = stateRef.current;
      if (s && shouldMarkSeen(reason, a.shown.length)) commit(markTourSeen(s, a.req.tourId));
      activeRef.current = null;
      setActive(null);
    },
    [commit],
  );

  const requestTours = useCallback((reqs: TourRequest[]) => {
    setQueue((q) => {
      const fresh = reqs.filter(
        (r) =>
          pendingTours(stateRef.current, [r.tourId]).length > 0 &&
          activeRef.current?.req.tourId !== r.tourId &&
          !q.some((x) => x.tourId === r.tourId),
      );
      return fresh.length > 0 ? [...q, ...fresh] : q;
    });
  }, []);

  const cancelTours = useCallback(
    (ids: TourId[]) => {
      setQueue((q) => q.filter((r) => !ids.includes(r.tourId)));
      if (activeRef.current && ids.includes(activeRef.current.req.tourId)) endTour("cancel");
    },
    [endTour],
  );

  // Start the next tour once nothing else is showing.
  useEffect(() => {
    if (deck || active || queue.length === 0) return;
    const i = pickNext(queue, hasOpenOverlay());
    if (i === -1) {
      const t = window.setTimeout(() => setRetry((n) => n + 1), GATE_RETRY_MS);
      return () => window.clearTimeout(t);
    }
    const req = queue[i];
    setQueue((q) => q.filter((r) => r.tourId !== req.tourId));
    if (pendingTours(stateRef.current, [req.tourId]).length === 0) return;
    req.onBeforeStart?.();
    setActive({ req, index: 0, shown: [] });
  }, [deck, active, queue, retry]);

  const advance = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    if (a.index + 1 >= TOURS[a.req.tourId].length) endTour("done");
    else setActive({ ...a, index: a.index + 1 });
  }, [endTour]);

  const goBack = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const prev = previousShown(a.shown, a.index);
    if (prev !== null) setActive({ ...a, index: prev });
  }, []);

  const markShown = useCallback(() => {
    setActive((a) => (a && !a.shown.includes(a.index) ? { ...a, shown: [...a.shown, a.index] } : a));
  }, []);

  const skip = useCallback(() => endTour("skip"), [endTour]);

  const finishWelcome = useCallback(() => {
    const s = stateRef.current;
    if (s && !s.welcomeDone) commit(completeWelcome(s, RELEASE_IDS));
    setDeck(null);
  }, [commit]);

  const closeWhatsNew = useCallback(
    (releases: Release[], route?: string) => {
      const s = stateRef.current;
      if (s) commit(markReleasesSeen(s, releases.map((r) => r.id)));
      setDeck(null);
      if (route) history.push(route);
    },
    [commit, history],
  );

  const api = useMemo<TourApi>(
    () => ({
      requestTours,
      cancelTours,
      showWelcome: () => setDeck({ kind: "welcome" }),
      showWhatsNew: () => {
        const latest = RELEASES[RELEASES.length - 1];
        if (latest) setDeck({ kind: "whatsNew", releases: [latest] });
      },
      resetTours: () => {
        const s = stateRef.current;
        if (s) commit(clearSeenTours(s));
      },
      hasReleases: RELEASES.length > 0,
    }),
    [requestTours, cancelTours, commit],
  );

  const steps = active ? TOURS[active.req.tourId] : [];

  return (
    <Ctx.Provider value={api}>
      {children}
      {deck?.kind === "welcome" && <WelcomeSlides onDone={finishWelcome} />}
      {deck?.kind === "whatsNew" && (
        <WhatsNew
          releases={deck.releases}
          onDone={() => closeWhatsNew(deck.releases)}
          onShowMe={(route) => closeWhatsNew(deck.releases, route)}
        />
      )}
      {active && !deck && (
        <SpotlightOverlay
          key={`${active.req.tourId}:${active.index}`}
          tourId={active.req.tourId}
          step={steps[active.index]}
          index={active.index}
          total={steps.length}
          canGoBack={previousShown(active.shown, active.index) !== null}
          isLast={active.index === steps.length - 1}
          onShown={markShown}
          onMissing={advance}
          onNext={advance}
          onPrev={goBack}
          onSkip={skip}
        />
      )}
    </Ctx.Provider>
  );
};
```

- [ ] **Step 2: Write `usePageTour.ts`**

```ts
// src/app/features/onboarding/usePageTour.ts
/**
 * Asks for this page's tours while the page is the visible one and `ready`.
 * Must be called from a routed page component: it keys off Ionic's
 * enter/leave lifecycle, because Ionic keeps left pages mounted.
 */
import { useEffect, useRef, useState } from "react";
import { useIonViewDidEnter, useIonViewWillLeave } from "@ionic/react";
import type { TourId } from "./tourCatalog";
import { useTours } from "./TourProvider";

interface Options {
  /** Data loaded / state present. Defaults to true. */
  ready?: boolean;
  /** The tour belongs to a sheet, so it may start while that sheet is open. */
  overOverlay?: boolean;
  /** E.g. the viewer bringing its toolbar back from immersive mode. */
  onBeforeStart?: () => void;
}

export function usePageTour(tourIds: TourId[], opts: Options = {}): void {
  const { requestTours, cancelTours } = useTours();
  const [entered, setEntered] = useState(false);
  useIonViewDidEnter(() => setEntered(true));
  useIonViewWillLeave(() => setEntered(false));

  const beforeStart = useRef(opts.onBeforeStart);
  beforeStart.current = opts.onBeforeStart;

  const ready = opts.ready ?? true;
  const overOverlay = opts.overOverlay ?? false;
  const key = tourIds.join("|");

  useEffect(() => {
    if (!entered || !ready) return;
    const ids = key.split("|") as TourId[];
    requestTours(ids.map((tourId) => ({ tourId, overOverlay, onBeforeStart: () => beforeStart.current?.() })));
    return () => cancelTours(ids);
  }, [entered, ready, overOverlay, key, requestTours, cancelTours]);
}
```

- [ ] **Step 3: Wire `App.tsx`**

Add these imports next to the other feature imports:

```tsx
import { TourProvider } from "./app/features/onboarding/TourProvider";
import { initOnboarding } from "./app/features/onboarding/onboardingStore";
import { RELEASE_IDS } from "./app/features/onboarding/tourCatalog";
```

In `const App: React.FC = () => {`, add these lines as the **first statements**, before the `useState` for `preloadProgress`:

```tsx
  // Must run before the effect below that calls ensureSince(): the tracker's
  // launch-time write is one of the keys detectExistingUser() looks for.
  const [onboarding] = useState(() => initOnboarding(RELEASE_IDS));
```

Replace:

```tsx
              <IonReactRouter>
                <MainRouterOutlet />
              </IonReactRouter>
```

with:

```tsx
              <IonReactRouter>
                <TourProvider initial={onboarding}>
                  <MainRouterOutlet />
                </TourProvider>
              </IonReactRouter>
```

- [ ] **Step 4: Add the home tour targets**

In `src/app/shared/components/bottom-nav/BottomNavBar.tsx`:
1. Add the import `import { tourAttr } from "../../../features/onboarding/tourCatalog";`
2. Spread `{...tourAttr("home.tabs")}` onto the `<nav className={"rfq-tab-bar" ...}>` element.
3. On the tab `<button key={tab.id} ...>`, add `{...(tab.id === "more" ? tourAttr("home.more") : {})}`.

In `src/app/features/home/pages/Home.tsx`, import `usePageTour` from `"../../onboarding/usePageTour"`. Then add `usePageTour(["home"]);` as the first line inside the component body.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/onboarding|App.tsx|BottomNavBar|home/pages"`
Expected: no output.

- [ ] **Step 6: Verify in the browser**

Start the dev server in the background: `npm start` (port 3000). Then, in a browser at a phone-sized viewport (e.g. 390×844), check:

1. **New user.** Clear site data (DevTools → Application → Clear storage) and reload.
   - The welcome deck shows in Arabic RTL.
   - Tapping **English** switches the deck to LTR English immediately.
   - Swiping, **Next** and **Previous** all work, and the last slide shows **Get started**.
   - After **Get started**, the Home tour plays two steps, ringing the tab bar and then the More tab. The card moves to the top for these because the tab bar sits low.
   - **Done** closes the tour. Reloading shows nothing.
2. **Existing user.** Clear storage, run `localStorage.setItem("rafiq_settings_v1","{}")` in the console, and reload.
   - No welcome deck appears. The Home tour plays.
3. **Back button.** During a tour, press the browser back gesture or `Escape`. That isn't wired on web, so skip this check here; on Android it's covered in Task 11.
4. **Skip.** Tap **Skip**, then reload. The Home tour doesn't return.

Record any visual problems and fix them in `onboarding.css` before committing.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/onboarding/TourProvider.tsx src/app/features/onboarding/usePageTour.ts src/App.tsx src/app/shared/components/bottom-nav/BottomNavBar.tsx src/app/features/home/pages/Home.tsx
git commit -m "Run welcome slides and page tours from a tour provider

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Settings "Tours & tips" section and settings tour

**Files:**
- Modify: `src/app/features/settings/Settings.tsx` (imports; component state; JSX between the Notifications section and the `{/* ── Reset ── */}` section; `data-tour` spreads on the Language, Appearance, Offline content and Notifications sections)

**Interfaces:**
- Consumes: `useTours()` and `usePageTour()` (Task 6), `ONBOARDING_COPY` (Task 3), `tourAttr` (Task 2), plus the `lang` already destructured from `useLang()` in Settings.
- Produces: nothing new.

- [ ] **Step 1: Add the imports and state**

```tsx
import { useTours } from "../onboarding/TourProvider";
import { usePageTour } from "../onboarding/usePageTour";
import { ONBOARDING_COPY } from "../onboarding/onboardingCopy";
import { tourAttr } from "../onboarding/tourCatalog";
```

Inside the component, next to the other `useState` calls, add:

```tsx
  const tours = useTours();
  const oc = ONBOARDING_COPY[lang].settings;
  const [tipsReset, setTipsReset] = useState(false);
  usePageTour(["settings"]);
```

- [ ] **Step 2: Tag the settings tour targets**

- On the Language section's outer div, change `<div className="settings-section">` to `<div className="settings-section" {...tourAttr("settings.look")}>`. Do the same on the Appearance section's outer div, also with `"settings.look"`; that step uses `union`.
- On the Offline content section's outer div, add `{...tourAttr("settings.sync")}`.
- On the Notifications section, the first `<div className="settings-card">` (the one holding the Prayer reminders `ToggleRow`) gets `{...tourAttr("settings.reminders")}`.

- [ ] **Step 3: Add the section before `{/* ── Reset ── */}`**

```tsx
            {/* ── Tours & tips ── */}
            <div className="settings-section" {...tourAttr("settings.tours")}>
              <p className="settings-section-title">{oc.section}</p>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-text">
                      <p className="settings-row-label">{oc.welcome}</p>
                      <p className="settings-row-desc">{oc.welcomeDesc}</p>
                    </div>
                  </div>
                  <button className="settings-action-btn" onClick={tours.showWelcome}>
                    {oc.show}
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-text">
                      <p className="settings-row-label">{oc.tips}</p>
                      <p className="settings-row-desc">{oc.tipsDesc}</p>
                    </div>
                  </div>
                  <button
                    className="settings-action-btn"
                    onClick={() => {
                      tours.resetTours();
                      setTipsReset(true);
                    }}
                  >
                    {oc.replay}
                  </button>
                </div>
                {tipsReset && (
                  <div className="settings-row">
                    <p className="settings-sync-note" role="status">
                      {oc.tipsDone}
                    </p>
                  </div>
                )}
                {tours.hasReleases && (
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <div className="settings-row-text">
                        <p className="settings-row-label">{oc.whatsNew}</p>
                        <p className="settings-row-desc">{oc.whatsNewDesc}</p>
                      </div>
                    </div>
                    <button className="settings-action-btn" onClick={tours.showWhatsNew}>
                      {oc.show}
                    </button>
                  </div>
                )}
              </div>
            </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/settings|features/onboarding"`
Expected: no output.

- [ ] **Step 5: Verify in the browser**

1. Open `/settings`.
   - The settings tour plays four steps: Language + Appearance ringed together, Offline content, the Prayer reminders card, and Tours & tips. Lower targets get a top card.
   - The page scrolls the Tours & tips section into view.
2. Tap **Show** on Welcome slides. The welcome deck opens. Finishing it returns to Settings with nothing else marked.
3. Tap **Replay** on Page tips.
   - The note appears.
   - Navigate Home and back to Settings: both tours play again.
4. The What's new row isn't shown, because `RELEASES` is empty.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/settings/Settings.tsx
git commit -m "Add Tours & tips replay section and settings tour

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Viewer tours

**Files:**
- Modify: `src/app/features/viewer/PageViewer.tsx`
- Modify: `src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx`
- Modify: `src/app/features/playback/PlaybackSettings.tsx`

**Interfaces:**
- Consumes: `usePageTour` (Task 6), `tourAttr` (Task 2). The PageViewer locals it relies on:
  - `loading`, `verses`
  - `showPlaybackBar` (defined around line 417)
  - `isRecording` (around 628)
  - `anyPageHidden` (used at ~1060)
  - `sheetVerseKey`, `playbackSheetOpen`
  - `immersive.showChrome`
- Produces: nothing new.

- [ ] **Step 1: Add the hooks to PageViewer**

Import:

```tsx
import { usePageTour } from "../onboarding/usePageTour";
import { tourAttr } from "../onboarding/tourCatalog";
```

Directly above the component's main `return (`, add the block below. First confirm all six names are already declared above that point, and that no early `return` sits between them and the hooks; if one does, place the block above it.

```tsx
  // Onboarding. The page tour waits for a quiet page; the contextual tours
  // play the first time their bar or sheet appears.
  const quietPage = !showPlaybackBar && !isRecording && sheetVerseKey === null && !playbackSheetOpen;
  usePageTour(["viewer"], {
    ready: !loading && verses.length > 0 && quietPage,
    onBeforeStart: immersive.showChrome,
  });
  usePageTour(["viewer.verseSheet"], { ready: sheetVerseKey !== null, overOverlay: true });
  usePageTour(["viewer.playbackSheet"], { ready: playbackSheetOpen, overOverlay: true });
  usePageTour(["viewer.playbackBar"], {
    ready: showPlaybackBar && !playbackSheetOpen && sheetVerseKey === null,
    onBeforeStart: immersive.showChrome,
  });
  usePageTour(["viewer.reciteBar"], { ready: isRecording, onBeforeStart: immersive.showChrome });
  usePageTour(["viewer.reveal"], {
    ready: anyPageHidden && !isRecording && !showPlaybackBar,
    onBeforeStart: immersive.showChrome,
  });
```

If `anyPageHidden` is declared *after* the main `return` (inside JSX only), compute it the same way it is computed at its use site and assign it to a local above this block.

- [ ] **Step 2: Tag the PageViewer targets**

| Element (find by className) | Add |
|---|---|
| `<div className="mushaf-content"` (~1355) | `{...tourAttr("viewer.swipe", "viewer.verse", "viewer.immersive")}` |
| `className="toolbar-center-pill"` (~1267) | `{...tourAttr("viewer.pill")}` |
| `.play-button` button (~943) | `{...tourAttr("viewer.play")}` |
| `.hide-toggle-button` in the normal toolbar (~1005) | `{...tourAttr("viewer.hide")}` |
| bookmark button `className={\`toolbar-button bookmark-button...` (~1305) | `{...tourAttr("viewer.nav")}` |
| `className="toolbar-button search-button"` (~1328) | `{...tourAttr("viewer.nav")}` |
| `className="toolbar-playback-bar"` (~1123) | `{...tourAttr("viewer.playbackBar.controls")}` |
| the `recite-recording-transcript` span (~812) | `{...tourAttr("viewer.reciteBar.transcript")}` |
| the two `hide-reveal-btn` buttons **inside `.recite-recording-bar`** (~890, ~913) | `{...tourAttr("viewer.reciteBar.reveal")}` on both |
| the mic stop button, the first button inside `.recite-recording-bar` (~770) | `{...tourAttr("viewer.reciteBar.stop")}` |
| the **reveal-next-word** `hide-reveal-btn` in the normal toolbar sidebar (~1069, single chevron) | `{...tourAttr("viewer.reveal.word")}` |
| the **reveal-next-verse** `hide-reveal-btn` in the normal toolbar sidebar (~1093, double chevron) | `{...tourAttr("viewer.reveal.verse")}` |

- [ ] **Step 3: Tag the sheet targets**

**VerseActionSheet.tsx**
1. Import `tourAttr` from `"../../../features/onboarding/tourCatalog"`.
2. `<div className="vas-header-actions">` gets `{...tourAttr("viewer.verseSheet.actions")}`.
3. `<div className={\`vas-resource-bar${nightClass}\`}>` gets `{...tourAttr("viewer.verseSheet.tafsir")}`.
4. The `className="vas-verse-row"` element gets `{...tourAttr("viewer.verseSheet.swipe")}`.

**PlaybackSettings.tsx**
1. Import `tourAttr` from `"../onboarding/tourCatalog"`.
2. Tag the `<section className="pb-section">` elements in render order:
   - the first (~675, range selects): `{...tourAttr("viewer.playbackSheet.range")}`
   - the second (~693, reciter + Manage downloads): `{...tourAttr("viewer.playbackSheet.reciter")}`
   - the third (~714, speed / repeat): `{...tourAttr("viewer.playbackSheet.speed")}`
   - the fourth (~732, quick select): `{...tourAttr("viewer.playbackSheet.quick")}`
3. Check each section's `<h2 className="pb-section-title">` before tagging. If the order differs, match by title, not position.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "PageViewer|VerseActionSheet|PlaybackSettings|features/onboarding"`
Expected: no output.

- [ ] **Step 5: Verify in the browser**

Clear storage, then set `localStorage.setItem("rafiq_settings_v1","{}")` so it counts as an existing user and the welcome is skipped. Then:

1. Open `/viewer`. The viewer tour plays seven steps:
   - swipe (hand glyph sliding)
   - pill
   - play (press animation)
   - hide
   - verse (press)
   - bookmarks + search ringed together
   - double-tap
2. Double-tap to enter immersive mode. Clear the `rafiq_onboarding_v1` key's `seenTours` with **Settings → Replay**, then reopen the viewer. The toolbar reappears before step 1.
3. Long-press a word: the verse-sheet tour plays over the open sheet.
4. Tap Play: the playback-sheet tour plays.
5. Start playback: the playback-bar tour plays.
6. Tap the hide toggle: the reveal tour plays.
7. Each contextual tour plays only once.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/viewer/PageViewer.tsx src/app/shared/components/verse-action-sheet/VerseActionSheet.tsx src/app/features/playback/PlaybackSettings.tsx
git commit -m "Add Quran viewer, verse sheet and playback tours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Navigation, quiz, library and account tours

**Files (all modify):**
- `src/app/features/viewer/pages/SurahJuzSelection.tsx`
- `src/app/features/viewer/pages/Search.tsx`
- `src/app/features/quiz/pages/quiz-list/QuizList.tsx`
- `src/app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup.tsx`
- `src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.tsx`
- `src/app/features/quiz/quizzes/akmel-alnehayat/pages/setup/AkmelAlNehayatSetup.tsx`
- `src/app/features/more/More.tsx`
- `src/app/features/bookmarks/Bookmarks.tsx`
- `src/app/features/tafsir/TafsirSettings.tsx`
- `src/app/features/account/Account.tsx`
- `src/app/features/account/StreakPanel.tsx`

**Interfaces:**
- Consumes: `usePageTour` (Task 6) and `tourAttr` (Task 2).
- Import paths:
  - from `features/<x>/` files: `"../onboarding/..."`
  - from `features/viewer/pages/` and `features/quiz/pages/quiz-list/`: `"../../onboarding/..."` and `"../../../onboarding/..."` respectively
  - from `features/quiz/quizzes/<q>/pages/setup/`: `"../../../../../onboarding/..."`
- Produces: nothing new.

For every page component below:
- Add `usePageTour([...])` as the first line of the component body.
- Add the listed `tourAttr` spreads to the named elements.

- [ ] **Step 1: Tag the Quran navigation pages**

| File | Hook | Targets |
|---|---|---|
| SurahJuzSelection.tsx | `usePageTour(["surahJuz"]);` | `<div className="sjs-tabs" role="tablist">` → `{...tourAttr("surahJuz.tabs")}` |
| Search.tsx | `usePageTour(["search"]);` | `<form className="search-bottom-bar" ...>` → `{...tourAttr("search.input")}`; `<ul className="recents-list">` → `{...tourAttr("search.recents")}` |

- [ ] **Step 2: Tag the quiz pages**

**QuizList.tsx**
1. `usePageTour(["quizList"]);`
2. On `<button key={quiz.id} className="ql-card" ...>` add:
   ```tsx
   {...tourAttr(quiz.id === "akmel-alayah" ? "quizList.ayah" : quiz.id === "mutashabihat" ? "quizList.mutashabihat" : "quizList.nehayat")}
   ```

**Each of the three setup pages**
1. `usePageTour(["quizSetup"]);`
2. Use the file's prefix: `aa` for AkmelAlAyah, `ms` for Mutashabihat, `an` for AkmelAlNehayat.
3. Tag:
   - `<div className="{p}-tab-row">` → `{...tourAttr("quizSetup.mode")}`
   - `<div className="{p}-scope-section">` → `{...tourAttr("quizSetup.scope")}`
   - `<div className="{p}-count-row">` → `{...tourAttr("quizSetup.count")}`
   - `<button className="{p}-start-btn" ...>` → `{...tourAttr("quizSetup.start")}`

- [ ] **Step 3: Tag More, Bookmarks, Tafsir and Account**

| File | Hook | Targets |
|---|---|---|
| More.tsx | `usePageTour(["more"]);` | `<div className="more-grid">` → `{...tourAttr("more.cards")}` |
| Bookmarks.tsx | `usePageTour(["bookmarks"]);` | `<div className="bm-tabs" role="tablist">` → `{...tourAttr("bookmarks.tabs")}` |
| TafsirSettings.tsx | `usePageTour(["tafsirLibrary"]);` | the `tfs-section` whose title is `ts.sectionDownloaded` (~186) → `{...tourAttr("tafsirLibrary.downloaded")}`; the one whose title is `ts.sectionAvailable` (~244) → `{...tourAttr("tafsirLibrary.library")}` |
| Account.tsx | `usePageTour(["account"]);` | `<div className="ac-card ac-notes-card">` → `{...tourAttr("account.notes")}`; the `<div className="ac-group">` directly after `<p className="ac-group-hint">{t.backupHint}</p>` → `{...tourAttr("account.backup")}` |
| StreakPanel.tsx | (none; Account owns the hook) | `<button className="ac-freeze-cta" ...>` → `{...tourAttr("account.streak")}` |

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SurahJuzSelection|Search.tsx|QuizList|Setup.tsx|More.tsx|Bookmarks|TafsirSettings|Account|StreakPanel"`
Expected: no output.

- [ ] **Step 5: Verify in the browser**

Visit each page once and check that its tour plays with the listed steps:
- `/surah-juz`, `/search`, `/quiz-list`
- each of the three setup pages (only the first one visited plays `quizSetup`)
- `/more`, `/bookmarks`, `/tafsir-settings`, `/account`

Then check the missing-target cases:
- `/search` with no recent searches shows only the input step.
- `/account` without a streak skips the freeze step.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/viewer/pages/SurahJuzSelection.tsx src/app/features/viewer/pages/Search.tsx src/app/features/quiz/pages/quiz-list/QuizList.tsx src/app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup.tsx src/app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup.tsx src/app/features/quiz/quizzes/akmel-alnehayat/pages/setup/AkmelAlNehayatSetup.tsx src/app/features/more/More.tsx src/app/features/bookmarks/Bookmarks.tsx src/app/features/tafsir/TafsirSettings.tsx src/app/features/account/Account.tsx src/app/features/account/StreakPanel.tsx
git commit -m "Add tours for navigation, quiz, library and account pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Worship pages: Azkar, Hifz, Prayer Times, Tracker

**Files (all modify):**
- `src/app/features/azkar/Azkar.tsx`
- `src/app/features/hifz/Hifz.tsx`
- `src/app/features/prayer-times/PrayerTimes.tsx`
- `src/app/features/prayer-times/QiblaHeader.tsx`
- `src/app/features/tracker/WorshipTracker.tsx`

**Interfaces:**
- Consumes: `usePageTour` (Task 6), `tourAttr` and `TourRef` (Task 2).
- Imports: `"../onboarding/usePageTour"` and `"../onboarding/tourCatalog"`.
- Produces: nothing new.

- [ ] **Step 1: Resolve the WorshipTracker.tsx overlap first**

Run `git status --short src/app/features/tracker/WorshipTracker.tsx`.

If it shows ` M`, those edits belong to another session. **Stop and ask the user** whether to:
1. wait until they commit, or
2. include those edits in this commit.

Do not stage the file until they answer. `git add -p` is interactive and not available here. Continue with Steps 2–4 meanwhile.

- [ ] **Step 2: Tag Azkar**

The list page and each category page are separate Ionic page instances of the same component.

1. Add `usePageTour([selectedCategory ? "azkarCategory" : "azkar"]);` right after `const selectedCategory = categoryId ?? null;` (~line 137).
2. Category cards: on `<button key={cat.id} className={"azkar-cat-card" ...}>`, add
   ```tsx
   {...tourAttr(cat.id === MY_AZKAR_ID ? "azkar.mine" : "azkar.progress")}
   ```
   The first non-favourites card wins, because resolution takes the first match.
3. Zikr card: on the `azkar-item` element (`className={\`azkar-item ...\`}`, ~306), add `{...tourAttr("azkarCategory.swipe")}`.
4. The favourite-star `azkar-action-btn` (~325, the one toggling `isFavorite`) gets `{...tourAttr("azkarCategory.star")}`.
5. The `azkar-count-btn` (~347) gets `{...tourAttr("azkarCategory.counter")}`.
6. The reference `azkar-action-btn` (~376, `aria-label={ta.reference}`) gets `{...tourAttr("azkarCategory.ref")}`.

- [ ] **Step 3: Tag Hifz**

After `const [view, setView] = useState<...>("setup");` (~1623) and after `plan` is declared, add:

```tsx
  usePageTour(["hifzSetup"], { ready: view === "setup" });
  usePageTour(["hifzDashboard"], { ready: view === "plan" && plan !== null });
  usePageTour(["hifzSessions"], { ready: view === "sessions" });
```

Then tag these elements; they're in sub-components of the same file:

| Element | Add |
|---|---|
| `className="hifz-add-btn"` (~631) | `{...tourAttr("hifzSetup.add")}` |
| `<div className="hifz-goal-row">` (~644) | `{...tourAttr("hifzSetup.goal")}` |
| `.hifz-generate-btn` (~686) | `{...tourAttr("hifzSetup.generate")}` |
| `className="hifz-hero-scroll"` (~1108) | `{...tourAttr("hifzDashboard.hero")}` |
| the streak chip `className="hifz-stat-chip hifz-stat-chip-streak hifz-stat-chip--tappable"` (~1241) | `{...tourAttr("hifzDashboard.streak")}` |
| `className="hifz-all-sessions-row"` (~1285) | `{...tourAttr("hifzDashboard.sessions")}` |
| `className={\`hifz-session-check...\`}` (~986) | `{...tourAttr("hifzSessions.done")}` |
| `className="hifz-session-open-btn"` and `className="hifz-session-quiz-btn"` (~967–977) | `{...tourAttr("hifzSessions.open")}` on both |

- [ ] **Step 4: Tag Prayer Times**

1. In PrayerTimes.tsx, add `usePageTour(["prayerTimes"]);`
2. In PrayerTimes.tsx, tag:
   - `.pt-grant-btn` → `{...tourAttr("prayerTimes.grant")}`
   - `.pt-menu-btn` → `{...tourAttr("prayerTimes.menu")}`
3. In QiblaHeader.tsx, tag:
   - `<div className="qh-next" ...>` → `{...tourAttr("prayerTimes.next")}`
   - `<div className="qh-dial">` → `{...tourAttr("prayerTimes.qibla")}`

The grant step and the other three never coexist; missing targets are skipped.

- [ ] **Step 5: Tag the Worship Tracker**

1. Add `usePageTour(["tracker"]);` as the first line of the page component.
2. In the item-row render, where `done(item.id)`, `open` and `item.longPress` are in scope (~177–196), build the refs before the returned button and spread them onto it:
   ```tsx
   const refs: TourRef[] = ["tracker.item"];
   if (!done(item.id) && !open) refs.push("tracker.locked");
   if (item.longPress) refs.push("tracker.shortcut");
   ```
   Then on the button: `{...tourAttr(...refs)}`.
   If the row is rendered by an inline arrow returning JSX directly, turn it into a block body to declare `refs`.
3. Tag:
   - `<div className="wt-strip">` → `{...tourAttr("tracker.strip")}`
   - the `.wt-cal-btn` button → `{...tourAttr("tracker.strip")}`
   - `<div className="wt-header-actions">` → `{...tourAttr("tracker.header")}`

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Azkar.tsx|Hifz.tsx|PrayerTimes|QiblaHeader|WorshipTracker"`
Expected: no output.

- [ ] **Step 7: Verify in the browser**

1. `/azkar`: two steps (My Azkar, then the first category).
2. `/azkar/morning`: four steps.
3. `/hifz` with no plan: three setup steps. After generating a plan: three dashboard steps. Then "View all sessions": the sessions steps.
4. `/prayer-times` without location: only the grant step. With a location: next, qibla and menu.
5. `/tracker`: item, then locked if a later prayer is still locked, then shortcut, strip + calendar ringed together, and header.

- [ ] **Step 8: Commit**

Commit only after Step 1 is resolved; leave out `WorshipTracker.tsx` if the user said to wait.

```bash
git add src/app/features/azkar/Azkar.tsx src/app/features/hifz/Hifz.tsx src/app/features/prayer-times/PrayerTimes.tsx src/app/features/prayer-times/QiblaHeader.tsx src/app/features/tracker/WorshipTracker.tsx
git commit -m "Add tours for Azkar, Hifz, Prayer Times and the Worship Tracker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Source-scan guard and final verification

**Files:**
- Create: `src/app/features/onboarding/__tests__/tourTargets.test.ts`

**Interfaces:**
- Consumes: `TOURS`, `TourId` (Task 2), and the source files from Tasks 6–10.
- Produces: a test that fails when:
  - a page uses an unknown tour ref or id
  - a catalog step has no target anywhere
  - a tour is never requested by any `usePageTour`

- [ ] **Step 1: Write the test**

```ts
// src/app/features/onboarding/__tests__/tourTargets.test.ts
/**
 * Ties the catalog to the pages: every step has a data-tour target somewhere,
 * every tour is requested by some page, and no page uses a ref or id the
 * catalog doesn't know (a typo would otherwise just skip the step silently).
 */
import * as fs from "fs";
import * as path from "path";
import { TOURS, TourId } from "../tourCatalog";

const APP_DIR = path.resolve(__dirname, "../../..");
const SKIP_DIR = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return full === SKIP_DIR || e.name === "__tests__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const ids = Object.keys(TOURS) as TourId[];
const refs = new Set(ids.flatMap((id) => TOURS[id].map((s) => `${id}.${s.key}`)));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idPattern = [...ids].sort((a, b) => b.length - a.length).map(escape).join("|");
const DOTTED = new RegExp(`"((?:${idPattern})(?:\\.[A-Za-z]+)+)"`, "g");
const PAGE_TOUR = /usePageTour\(\s*\[([^\]]*)\]/g;

const sources = sourceFiles(APP_DIR).map((f) => fs.readFileSync(f, "utf8"));
const literals = new Set(sources.flatMap((src) => [...src.matchAll(DOTTED)].map((m) => m[1])));
const requested = new Set(
  sources.flatMap((src) => [...src.matchAll(PAGE_TOUR)].flatMap((m) => [...m[1].matchAll(/"([A-Za-z.]+)"/g)].map((x) => x[1]))),
);

it("uses only known tour refs and ids", () => {
  const unknown = [...literals].filter((l) => !refs.has(l) && !ids.includes(l as TourId));
  expect(unknown).toEqual([]);
});

it("gives every catalog step a target", () => {
  expect([...refs].filter((r) => !literals.has(r))).toEqual([]);
});

it("requests every tour from some page, and only known tours", () => {
  expect(ids.filter((id) => !requested.has(id))).toEqual([]);
  expect([...requested].filter((id) => !ids.includes(id as TourId))).toEqual([]);
});
```

- [ ] **Step 2: Run the whole onboarding suite**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern onboarding`
Expected: PASS for `onboardingStore`, `onboardingCopy`, `tourLogic` and `tourTargets`.

If `tourTargets` lists a missing ref, add the `tourAttr` in the page named by its prefix. If it lists an unknown one, fix the typo.

- [ ] **Step 3: Run the strict type gate**

Run: `npx tsc --noEmit -p tsconfig.json --noUnusedLocals --noUnusedParameters 2>&1 | grep -E "features/onboarding|App.tsx|Settings.tsx|PageViewer|VerseActionSheet|PlaybackSettings|SurahJuzSelection|Search.tsx|QuizList|Setup.tsx|More.tsx|Bookmarks|TafsirSettings|Account|StreakPanel|Azkar.tsx|Hifz.tsx|PrayerTimes|QiblaHeader|WorshipTracker|BottomNavBar|Home.tsx"`
Expected: no hit on a line this branch added. Hits on untouched lines are the repo's pre-existing unused-symbol warnings. To tell them apart, check each hit's line number against `git diff main -- <file>`.

- [ ] **Step 4: Check the CLAUDE.md rules**

Run: `git diff main --stat` and `git diff main -- '*.css' '*.tsx' '*.ts' | grep -nE "eslint-disable|scrollbar|max-width: [0-9]+px"`
Expected: no matches.

- [ ] **Step 5: Run the manual matrix in the browser**

For each of night/Arabic, night/English, day/Arabic and day/English:
1. Clear storage and load. The welcome deck renders in the right direction, and the illustrations are gold.
2. Do the Get started → Home tour → viewer tour flow.
3. Check that card text never overflows at 320px width, and that a top card never covers its own ring.

Then check the update path:
1. Temporarily add a release to `RELEASES`: `{ id: "test", features: [{ key: "x", art: "recite", route: "/tracker", tourId: "tracker" }] }`, plus `releases: { "test.x": { title: "T", body: "B" } }` in both copies.
2. Reload as an existing user.
3. The What's new deck shows. **Show me** opens `/tracker` and plays its tour.
4. **Revert the temporary release.**

- [ ] **Step 6: Hand off the on-device check to the user**

Ask the user to build and check on Android:
- Hardware back and edge swipe skip a tour or deck.
- Insets are correct on a gesture-nav device.
- The viewer's immersive mode is restored before its tour.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/onboarding/__tests__/tourTargets.test.ts
git commit -m "Guard tour targets against catalog drift

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
