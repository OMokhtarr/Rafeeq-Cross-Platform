/**
 * Section toggles and weights for the worship tracker. Prayers are fixed at
 * 50% and can't be switched off; each other section's share of the remaining
 * 50% is adjusted with its -/+ stepper, and the chips preview it live.
 */
import React from "react";
import AccountModal from "../account/AccountModal";
import { Switch } from "../../shared/components/controls/Switch";
import { useLang } from "../../core/context/LanguageContext";
import { OPTIONAL_SECTIONS, SectionId } from "./trackerCatalog";
import { sectionShares, visibleSections } from "./trackerLogic";
import { WEIGHT_MIN, WEIGHT_MAX } from "./trackerStore";

interface Props {
  settings: Record<SectionId, boolean>;
  /** The tracking day, so the preview matches its score (fasting only counts on fasting days). */
  date: Date;
  onChange: (s: Record<SectionId, boolean>) => void;
  weights: Record<SectionId, number>;
  onWeightsChange: (w: Record<SectionId, number>) => void;
  onClose: () => void;
}

const pct = (n = 0) => `${Math.round(n * 100)}%`;

const TrackerSettingsSheet: React.FC<Props> = ({ settings, date, onChange, weights, onWeightsChange, onClose }) => {
  const { t, isRTL } = useLang();
  const tt = t.tracker;
  const shares = sectionShares(visibleSections(date, settings), weights);
  const step = (id: SectionId, by: number) =>
    onWeightsChange({ ...weights, [id]: Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weights[id] + by)) });

  return (
    <AccountModal title={tt.settings.title} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <p className="wt-sheet-question">{tt.settings.question}</p>
        <div className="wt-settings-list">
          <div className="wt-settings-row">
            <span className="wt-settings-name">{tt.sections.prayers}</span>
            <span className="wt-chip">{pct(shares.prayers)}</span>
            <span className="wt-settings-fixed">{tt.settings.obligatory}</span>
          </div>
          {OPTIONAL_SECTIONS.map((id) => (
            <div key={id} className="wt-settings-row">
              <span className="wt-settings-name">{tt.sections[id]}</span>
              <span className={"wt-weight" + (settings[id] ? "" : " is-off")}>
                <button
                  className="wt-weight-btn"
                  onClick={() => step(id, -1)}
                  disabled={!settings[id] || weights[id] <= WEIGHT_MIN}
                  aria-label={`${tt.settings.less} ${tt.sections[id]}`}
                >−</button>
                <span className="wt-chip">{pct(shares[id])}</span>
                <button
                  className="wt-weight-btn"
                  onClick={() => step(id, 1)}
                  disabled={!settings[id] || weights[id] >= WEIGHT_MAX}
                  aria-label={`${tt.settings.more} ${tt.sections[id]}`}
                >+</button>
              </span>
              <Switch
                checked={settings[id]}
                label={tt.sections[id]}
                onChange={(on) => onChange({ ...settings, [id]: on })}
              />
            </div>
          ))}
        </div>
        <p className="wt-sheet-footnote">{tt.settings.footnote}</p>
      </div>
    </AccountModal>
  );
};

export default TrackerSettingsSheet;
