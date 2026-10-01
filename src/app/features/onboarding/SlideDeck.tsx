/**
 * Full-screen slide shell shared by the welcome and "What's new" decks.
 * Back / edge swipe closes it as Skip through the overlay registry.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import { Illustration } from "./illustrations";
import { ONBOARDING_COPY } from "./onboardingCopy";
import type { IllustrationId } from "./tourCatalog";
import { swipeStep } from "./tourLogic";
import "./onboarding.css";

export interface DeckSlide {
  key: string;
  art: IllustrationId;
  title: string;
  body: string;
  extra?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

export const Dots: React.FC<{ count: number; active: number }> = ({ count, active }) => (
  <div className="ob-dots" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <span key={i} className={"ob-dot" + (i === active ? " is-on" : "")} />
    ))}
  </div>
);

interface Props {
  slides: DeckSlide[];
  eyebrow?: string;
  finishLabel: string;
  onFinish: () => void;
  onSkip: () => void;
}

export const SlideDeck: React.FC<Props> = ({ slides, eyebrow, finishLabel, onFinish, onSkip }) => {
  const { lang, isRTL } = useLang();
  const c = ONBOARDING_COPY[lang].controls;
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;

  useEffect(() => registerOverlay(() => skipRef.current()), []);
  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  const slide = slides[Math.min(index, slides.length - 1)];
  const isLast = index >= slides.length - 1;

  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const step = swipeStep(e.clientX - startX.current, isRTL);
    startX.current = null;
    if (step === 1 && !isLast) setIndex(index + 1);
    if (step === -1 && index > 0) setIndex(index - 1);
  };

  return createPortal(
    <div className="ob-deck" role="dialog" aria-modal="true" aria-label={c.dialogLabel}>
      <div className="ob-deck-inner">
        <div className="ob-deck-top">
          <button type="button" className="ob-btn ob-btn--link" onClick={onSkip}>
            {c.skip}
          </button>
        </div>
        <div
          className="ob-deck-slide"
          key={slide.key}
          onPointerDown={(e) => {
            startX.current = e.clientX;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            startX.current = null;
          }}
        >
          <div className="ob-deck-art">
            <Illustration id={slide.art} />
          </div>
          {eyebrow && <p className="ob-deck-eyebrow">{eyebrow}</p>}
          <h2 ref={titleRef} tabIndex={-1} className="ob-deck-title">
            {slide.title}
          </h2>
          <p className="ob-deck-body">{slide.body}</p>
          {slide.extra}
          {slide.action && (
            <button type="button" className="ob-btn ob-btn--ghost" onClick={slide.action.onClick}>
              {slide.action.label}
            </button>
          )}
        </div>
        <p className="ob-sr" aria-live="polite">
          {c.stepOf(index + 1, slides.length)}
        </p>
        <Dots count={slides.length} active={index} />
        <div className="ob-deck-nav">
          {index > 0 ? (
            <button type="button" className="ob-btn ob-btn--link" onClick={() => setIndex(index - 1)}>
              {c.prev}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="ob-btn ob-btn--primary"
            onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
          >
            {isLast ? finishLabel : c.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
