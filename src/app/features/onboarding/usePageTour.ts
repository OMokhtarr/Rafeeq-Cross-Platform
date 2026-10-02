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
  // A page mounts when it is navigated to, so mounting counts as entering.
  // Ionic's didEnter cannot be relied on for this: on the page showing at
  // launch it fires before the hook has registered and never reaches us.
  const [entered, setEntered] = useState(true);
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
