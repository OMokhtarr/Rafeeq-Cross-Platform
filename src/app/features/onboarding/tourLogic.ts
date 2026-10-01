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
