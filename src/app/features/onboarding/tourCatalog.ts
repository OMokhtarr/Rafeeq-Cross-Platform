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
  | "prayerTimes.setup"
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
  // Split so the next-prayer / Qibla / menu steps still play the first time a
  // location exists, rather than being marked seen while only "grant" showed.
  "prayerTimes.setup": [{ key: "grant" }],
  prayerTimes: [{ key: "next" }, { key: "qibla" }, { key: "menu" }],
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
