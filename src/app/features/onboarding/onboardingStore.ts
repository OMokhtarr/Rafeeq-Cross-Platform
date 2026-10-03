/**
 * Onboarding persistence: whether the welcome deck ran, which page tours and
 * "What's new" releases the user has been through. One localStorage key, pure
 * functions, no React.
 */

export const ONBOARDING_KEY = "rafiq_onboarding_v1";

export interface OnboardingState {
  welcomeDone: boolean;
  seenTours: string[];
  /** Keys of the announced features already seen (the name predates that). */
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
