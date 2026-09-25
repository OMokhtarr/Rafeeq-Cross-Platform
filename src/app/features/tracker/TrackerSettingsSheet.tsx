/**
 * Section toggles for the worship tracker. Prayers are fixed at 50% and
 * can't be switched off; the chips preview each section's share live.
 */
import React from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";
import { OPTIONAL_SECTIONS, SectionId } from "./trackerCatalog";
import { sectionShares } from "./trackerLogic";

interface Props {
  settings: Record<SectionId, boolean>;
  onChange: (s: Record<SectionId, boolean>) => void;
  onClose: () => void;
}

const pct = (n = 0) => `${Math.round(n * 100)}%`;

const TrackerSettingsSheet: React.FC<Props> = ({ settings, onChange, onClose }) => {
  const { t, isRTL } = useLang();
  const tt = t.tracker;
  const shares = sectionShares(["prayers", ...OPTIONAL_SECTIONS.filter((id) => settings[id])]);

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
            <label key={id} className="wt-settings-row">
              <span className="wt-settings-name">{tt.sections[id]}</span>
              <span className="wt-chip">{pct(shares[id])}</span>
              <input
                type="checkbox"
                role="switch"
                className="wt-switch"
                checked={settings[id]}
                onChange={() => onChange({ ...settings, [id]: !settings[id] })}
              />
            </label>
          ))}
        </div>
        <p className="wt-sheet-footnote">{tt.settings.footnote}</p>
      </div>
    </AccountModal>
  );
};

export default TrackerSettingsSheet;
