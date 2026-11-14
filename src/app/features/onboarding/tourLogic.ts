/**
 * Pure onboarding rules, kept out of the components so they can be tested
 * without React: which deck opens at launch, which tour runs next, where the
 * card sits, which element a step points at.
 */
import type { OnboardingState } from "./onboardingStore";
import type { Release, TourId } from "./tourCatalog";

export type Deck = { kind: "welcome" } | { kind: "whatsNew"; releases: Release[] } | null;

/** Each update's features not yet seen; updates with none left are dropped. */
export function unseenReleases(state: OnboardingState, releases: Release[]): Release[] {
  return releases
    .map((r) => ({ ...r, features: r.features.filter((f) => !state.seenReleases.includes(f.key)) }))
    .filter((r) => r.features.length > 0);
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

/**
 * The spotlight ring: `pad` px outside the target, but pulled in on any side
 * that would cross `bounds` (the screen minus the system bars), keeping `edge`
 * px clear for the ring's border. Without this a full-width header, the
 * bottom nav or a button flush with a screen edge has part of its ring drawn
 * off-screen or under the status bar. A target wholly outside `bounds` keeps
 * the plain padded ring.
 */
export function ringBox(target: Box, bounds: Box, pad: number, edge: number): Box {
  const top = Math.max(target.top - pad, bounds.top + edge);
  const left = Math.max(target.left - pad, bounds.left + edge);
  const bottom = Math.min(target.top + target.height + pad, bounds.top + bounds.height - edge);
  const right = Math.min(target.left + target.width + pad, bounds.left + bounds.width - edge);
  if (bottom <= top || right <= left) {
    return { top: target.top - pad, left: target.left - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
  }
  return { top, left, width: right - left, height: bottom - top };
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

/**
 * The step after `from` whose target is on screen now, or null when none is —
 * which makes `from` the last step the user will see. Mid-tour gaps are
 * skipped at once instead of waiting out each missing step.
 */
export function nextShowable<S>(steps: S[], from: number, exists: (step: S) => boolean): number | null {
  for (let i = from + 1; i < steps.length; i++) if (exists(steps[i])) return i;
  return null;
}

/** The step "Previous" returns to: the latest shown step before `index`. */
export function previousShown(shown: number[], index: number): number | null {
  const earlier = shown.filter((i) => i < index);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}
