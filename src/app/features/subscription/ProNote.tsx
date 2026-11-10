/**
 * PRO NOTE
 *
 * The short "Recite is for subscribers" card a non-subscriber sees when they
 * tap a recite mic. Rendered once at the app root (inside the router) and
 * opened from any recite surface through `useSubscription().openNote()`. It
 * sits at the bottom centre, above the toolbars, where every recite mic
 * lives. "See plans" opens RevenueCat's Paywall; "Not now" closes it.
 */

import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import { useStartSubscribe } from "./useStartSubscribe";
import ProStar from "./ProStar";
import "./ProNote.css";

const ProNote: React.FC = () => {
  const { noteOpen, closeNote } = useSubscription();
  const { t } = useLang();
  const startSubscribe = useStartSubscribe();
  const { pathname } = useLocation();

  // Android Back and the edge swipe close the topmost registered overlay
  // first (App.tsx); without this the note would outlive the page under it.
  useEffect(() => (noteOpen ? registerOverlay(closeNote) : undefined), [noteOpen, closeNote]);

  // The note belongs to the page that raised it: leaving that page closes it.
  const openedOnRef = useRef(pathname);
  useEffect(() => {
    if (!noteOpen) {
      openedOnRef.current = pathname;
      return;
    }
    if (pathname !== openedOnRef.current) closeNote();
  }, [noteOpen, pathname, closeNote]);

  if (!noteOpen) return null;
  const ts = t.subscription;

  const viewSubscription = () => {
    closeNote();
    void startSubscribe();
  };

  return (
    <div className="pro-note-layer" dir={t.dir}>
      <div className="pro-note-backdrop" onClick={closeNote} />
      <div className="pro-note" role="dialog" aria-modal="true" aria-labelledby="pro-note-title">
        <ProStar className="pro-note-star" />
        <h2 id="pro-note-title" className="pro-note-title">
          {ts.noteTitle}
        </h2>
        <p className="pro-note-line">{ts.noteLine}</p>
        <button type="button" className="pro-note-cta" onClick={viewSubscription}>
          {ts.noteCta}
        </button>
        <button type="button" className="pro-note-dismiss" onClick={closeNote}>
          {ts.noteDismiss}
        </button>
      </div>
    </div>
  );
};

export default ProNote;
