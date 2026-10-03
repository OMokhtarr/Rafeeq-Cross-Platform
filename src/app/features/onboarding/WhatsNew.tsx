import React, { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { useLang } from "../../core/context/LanguageContext";
import { ONBOARDING_COPY } from "./onboardingCopy";
import { SlideDeck, DeckSlide } from "./SlideDeck";
import type { Release } from "./tourCatalog";

/**
 * The installed app's version, as Android's versionName (iOS: the bundle's
 * short version). Null where there is none to read — the web build — or
 * until it arrives; the heading is then a plain "What's new".
 */
function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    App.getInfo()
      .then((info) => live && setVersion(info.version || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return version;
}

/** One slide per new feature; "Show me" takes the user to it. */
export const WhatsNew: React.FC<{
  releases: Release[];
  onDone: () => void;
  onShowMe: (route: string) => void;
}> = ({ releases, onDone, onShowMe }) => {
  const { lang } = useLang();
  const c = ONBOARDING_COPY[lang];
  const version = useAppVersion();

  const slides: DeckSlide[] = releases.flatMap((r) =>
    r.features.map((f) => ({
      key: f.key,
      art: f.art,
      ...c.releases[f.key],
      action: { label: c.controls.showMe, onClick: () => onShowMe(f.route) },
    })),
  );

  return (
    <SlideDeck
      slides={slides}
      eyebrow={version ? c.controls.whatsNewIn(version) : c.controls.whatsNew}
      finishLabel={c.controls.done}
      onFinish={onDone}
      onSkip={onDone}
    />
  );
};
