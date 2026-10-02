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

/** A gold touch dot acting out the gesture: a sliding trail for swipe, a
 *  filling ring for long-press, two ripples for double-tap. */
const GestureHint: React.FC<{ gesture: Gesture; box: Box }> = ({ gesture, box }) => (
  <div
    className={`ob-touch ob-touch--${gesture}`}
    style={{ top: box.top + box.height / 2, left: box.left + box.width / 2 }}
    aria-hidden="true"
  >
    {gesture === "swipe" && <span className="ob-touch-trail" />}
    {gesture === "longPress" && (
      <svg className="ob-touch-ring" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="17" pathLength={100} />
      </svg>
    )}
    {gesture === "doubleTap" && (
      <>
        <span className="ob-touch-ripple" />
        <span className="ob-touch-ripple" />
      </>
    )}
    <span className="ob-touch-dot" />
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
  // Back / edge swipe skips the tour only once it is on screen; while a
  // target is still being looked for nothing is drawn, so Back belongs to
  // the page.
  useEffect(() => {
    if (!visible) return;
    cardRef.current?.focus();
    return registerOverlay(() => cb.current.onSkip());
  }, [visible]);

  const placement = box ? cardPlacement(box, window.innerHeight) : "bottom";
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div className={"ob-spot" + (box ? "" : " ob-spot--pending")} onClick={swallow} onPointerDown={swallow}>
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
