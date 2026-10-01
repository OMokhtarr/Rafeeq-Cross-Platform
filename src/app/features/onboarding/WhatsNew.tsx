import React from "react";
import { useLang } from "../../core/context/LanguageContext";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { SlideDeck, DeckSlide } from "./SlideDeck";
import type { Release } from "./tourCatalog";

/** One slide per new feature; "Show me" takes the user to it. */
export const WhatsNew: React.FC<{
  releases: Release[];
  onDone: () => void;
  onShowMe: (route: string) => void;
}> = ({ releases, onDone, onShowMe }) => {
  const { lang } = useLang();
  const c = ONBOARDING_COPY[lang];

  const slides: DeckSlide[] = releases.flatMap((r) =>
    r.features.map((f) => ({
      key: `${r.id}.${f.key}`,
      art: f.art,
      ...c.releases[`${r.id}.${f.key}`],
      action: { label: c.controls.showMe, onClick: () => onShowMe(f.route) },
    })),
  );

  return (
    <SlideDeck
      slides={slides}
      eyebrow={c.controls.whatsNew}
      finishLabel={c.controls.done}
      onFinish={onDone}
      onSkip={onDone}
    />
  );
};
