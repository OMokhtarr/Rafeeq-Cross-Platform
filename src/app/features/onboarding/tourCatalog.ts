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
 *  2. Add a Release whose feature (with a NEW key) points at that route and
 *     tour id. Bump versionName in android/app/build.gradle as usual; the
 *     What's new heading reads it, so no version number goes here.
 */

import { Capacitor } from "@capacitor/core";

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
  | "viewer.reciteReveal"
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
  | "prayerTimes.alarms"
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
  "viewer.reciteBar": [{ key: "transcript" }, { key: "stop" }],
  // Its own tour: the reveal buttons only appear once the verse is recognised,
  // well after the recording (and the tour above) has started.
  "viewer.reciteReveal": [{ key: "reveal", union: true }],
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
  // Announced in 1.2.0. Its own id so existing users, who have seen the tour
  // above, still get it from "Show me".
  "prayerTimes.alarms": [{ key: "menu" }],
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
  /**
   * The feature's identity, unique across every release and never reused:
   * "seen" remembers it, and its copy lives at onboardingCopy releases[key].
   */
  key: string;
  art: IllustrationId;
  /** Where "Show me" navigates. */
  route: string;
  /** Played on arrival; must be in that page's usePageTour list. */
  tourId: TourId;
  /** Where the feature exists, as Capacitor names platforms; everywhere when absent. */
  platforms?: string[];
}

/**
 * One app update's announcements. It carries no version number: seen state is
 * kept per feature, so bumping versionName can never re-announce an old
 * feature, and the deck's heading reads the installed versionName itself.
 */
export interface Release {
  features: ReleaseFeature[];
}

/** Oldest first. Everything before prayer alarms is covered by the welcome slides. */
export const ALL_RELEASES: Release[] = [
  {
    features: [
      // Ringing needs AlarmManager and a lock-screen activity: Android only.
      { key: "prayerAlarms", art: "qibla", route: "/prayer-times", tourId: "prayerTimes.alarms", platforms: ["android"] },
    ],
  },
];

/**
 * The releases worth announcing on [platform]: features that do not exist
 * there are dropped, and so is a release left with nothing to show.
 */
export function releasesForPlatform(releases: Release[], platform: string): Release[] {
  return releases
    .map((r) => ({
      ...r,
      features: r.features.filter((f) => !f.platforms || f.platforms.includes(platform)),
    }))
    .filter((r) => r.features.length > 0);
}

export const RELEASES: Release[] = releasesForPlatform(ALL_RELEASES, Capacitor.getPlatform());

/** Every announced feature's key; a new user starts with all of them seen. */
export const RELEASE_FEATURE_KEYS = RELEASES.flatMap((r) => r.features.map((f) => f.key));
