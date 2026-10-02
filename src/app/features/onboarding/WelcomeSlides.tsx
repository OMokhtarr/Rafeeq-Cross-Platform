import React from "react";
import { useLang } from "../../core/context/LanguageContext";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { SlideDeck, DeckSlide } from "./SlideDeck";
import { WELCOME_SLIDES } from "./tourCatalog";

/** First-install deck. Slide 1 sets the language the rest is read in. */
export const WelcomeSlides: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { lang, setLang } = useLang();
  const c = ONBOARDING_COPY[lang];

  const langPick = (
    <div className="ob-lang-row" role="group" aria-label={c.controls.chooseLanguage}>
      {(["ar", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={"ob-lang-btn" + (lang === l ? " is-active" : "")}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {l === "ar" ? c.controls.arabic : c.controls.english}
        </button>
      ))}
    </div>
  );

  const slides: DeckSlide[] = WELCOME_SLIDES.map((s) => ({
    key: s.id,
    art: s.art,
    ...c.slides[s.id],
    extra: s.id === "welcome" ? langPick : undefined,
  }));

  return <SlideDeck slides={slides} finishLabel={c.controls.getStarted} onFinish={onDone} onSkip={onDone} />;
};
