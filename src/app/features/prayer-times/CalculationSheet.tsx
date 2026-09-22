/**
 * CALCULATION SHEET
 * The calculation method and madhab, reached from the Prayer Times page's ⋮
 * menu. Both used to sit inline under the timetable; they are set once and
 * rarely revisited, so a permanent place on the page cost more attention
 * than they earn.
 *
 * Each change writes through and reloads the day immediately — every time on
 * the timetable behind the sheet moves with it, which is the clearest
 * confirmation the choice took effect.
 */

import React from "react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import {
  PRAYER_METHODS,
  type PrayerMadhab,
  type PrayerMethod,
} from "../../core/services/prayer/prayer-times.types";
import "./PrayerSheet.css";
import "./CalculationSheet.css";

/** Localized label for each method — the plugin's enum has no other mapping. */
export const METHOD_LABEL_KEY: Record<PrayerMethod, string> = {
  egyptian: "methodEgyptian",
  umm_al_qura: "methodUmmAlQura",
  muslim_world_league: "methodMwl",
  karachi: "methodKarachi",
  north_america: "methodNorthAmerica",
  dubai: "methodDubai",
  qatar: "methodQatar",
  kuwait: "methodKuwait",
  singapore: "methodSingapore",
  moon_sighting_committee: "methodMoonSighting",
};

export const MADHABS: PrayerMadhab[] = ["shafi", "hanafi"];

interface Props {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  method: PrayerMethod;
  madhab: PrayerMadhab;
  onMethodChange: (value: string) => void;
  onMadhabChange: (value: string) => void;
}

const CalculationSheet: React.FC<Props> = ({
  open,
  onClose,
  onBack,
  method,
  madhab,
  onMethodChange,
  onMadhabChange,
}) => {
  const { t, isRTL } = useLang();
  const { isNight } = useTheme();
  const tp = t.prayerTimes;

  // Registers the back step, not the close: the hardware back button has to
  // land where the header's back arrow does, otherwise the same gesture
  // means "up one level" in one place and "dismiss everything" in the other.
  React.useEffect(() => {
    if (!open) return;
    return registerOverlay(onBack);
  }, [open, onBack]);

  if (!open) return null;

  return (
    <>
      <div className="sts-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="sts-sheet"
        role="dialog"
        aria-label={tp.calculationTitle}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="sts-handle" aria-hidden="true" />

        <header className="sts-header">
          <div className="sts-header-text">
            <h3 className="sts-title">{tp.calculationTitle}</h3>
            <p className="sts-desc">{tp.calculationDesc}</p>
          </div>
          <button className="sts-close sts-back" onClick={onBack} aria-label={tp.menuTitle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="sts-body">
          <div className="cs-field">
            <span className="cs-field-label">{tp.method}</span>
            <span className="cs-field-hint">{tp.methodHint}</span>
            <InlineSelect
              value={method}
              options={PRAYER_METHODS.map((m) => ({
                value: m,
                label: tp[METHOD_LABEL_KEY[m] as keyof typeof tp] as string,
              }))}
              onChange={onMethodChange}
              night={isNight}
              fullWidth
              aria-label={tp.method}
            />
          </div>

          <div className="cs-field">
            <span className="cs-field-label">{tp.madhab}</span>
            <span className="cs-field-hint">{tp.madhabHint}</span>
            <InlineSelect
              value={madhab}
              options={MADHABS.map((m) => ({ value: m, label: tp[m] }))}
              onChange={onMadhabChange}
              night={isNight}
              fullWidth
              aria-label={tp.madhab}
            />
          </div>
        </div>
      </aside>
    </>
  );
};

export default CalculationSheet;
