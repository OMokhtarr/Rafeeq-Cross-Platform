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
import { RELEASES, RELEASE_IDS, Release, TOURS, TourId, TourStep } from "./tourCatalog";
import {
  Deck,
  TourRequest,
  launchDeck,
  nextShowable,
  pendingTours,
  pickNext,
  previousShown,
  resolveTarget,
  shouldMarkSeen,
} from "./tourLogic";
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

// Kept apart from TourApi so the API object stays stable while tours come and go.
const ActiveCtx = createContext<TourId | null>(null);
/** The page tour on screen now, or null — e.g. to keep recording alive while its card is read. */
export const useActiveTour = () => useContext(ActiveCtx);

interface ActiveTour {
  req: TourRequest;
  index: number;
  /** Step indices actually displayed, for "Previous" and for marking seen. */
  shown: number[];
}

/** How long a request blocked by an open sheet waits before re-checking. */
const GATE_RETRY_MS = 400;

/** The step after `index` whose target is on screen now, or null. */
const nextStepOnScreen = (tourId: TourId, index: number) =>
  nextShowable(TOURS[tourId], index, (s: TourStep) => resolveTarget(document, `${tourId}.${s.key}`, !!s.union) !== null);

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
    const next = nextStepOnScreen(a.req.tourId, a.index);
    if (next === null) endTour("done");
    else setActive({ ...a, index: next });
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
  const activeTourId = active && !deck ? active.req.tourId : null;

  return (
    <Ctx.Provider value={api}>
      <ActiveCtx.Provider value={activeTourId}>{children}</ActiveCtx.Provider>
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
          isLast={nextStepOnScreen(active.req.tourId, active.index) === null}
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
