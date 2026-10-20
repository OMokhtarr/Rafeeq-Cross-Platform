/**
 * PRO NOTE
 *
 * The short "Recite is for subscribers" card a non-subscriber sees when they
 * tap a recite mic. Rendered once at the app root (inside the router) and
 * opened from any recite surface through `useSubscription().openNote()`. It
 * sits at the bottom centre, above the toolbars, where every recite mic
 * lives. "View subscription" leads to the full /subscribe page.
 */

import React, { useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import "./ProNote.css";

const ProNote: React.FC = () => {
  const { noteOpen, closeNote } = useSubscription();
  const { t } = useLang();
  const history = useHistory();
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
    history.push("/subscribe");
  };

  return (
    <div className="pro-note-layer" dir={t.dir}>
      <div className="pro-note-backdrop" onClick={closeNote} />
      <div className="pro-note" role="dialog" aria-modal="true" aria-labelledby="pro-note-title">
        <svg className="pro-note-lock" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <h2 id="pro-note-title" className="pro-note-title">
          {ts.noteTitle}
        </h2>
        <p className="pro-note-line">{ts.noteLine}</p>
        <button type="button" className="pro-note-cta" onClick={viewSubscription}>
          {ts.noteCta}
        </button>
      </div>
    </div>
  );
};

export default ProNote;
