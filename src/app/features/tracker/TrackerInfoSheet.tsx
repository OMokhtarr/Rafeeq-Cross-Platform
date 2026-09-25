/**
 * What the worship tracker is for and how its time locks work. The first
 * card says plainly that tracking is an aid, not an act of worship.
 */
import React from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";

const TrackerInfoSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, isRTL } = useLang();
  const ti = t.tracker.info;

  return (
    <AccountModal title={t.tracker.title} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <p className="wt-sheet-question">{ti.subtitle}</p>
        <section className="wt-info-card">
          <h3>{ti.purposeTitle}</h3>
          <p>{ti.purpose}</p>
        </section>
        <section className="wt-info-card">
          <h3>{ti.howTitle}</h3>
          <ul>{ti.how.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <section className="wt-info-card">
          <h3>{ti.lockedTitle}</h3>
          <ul>{ti.locked.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
      </div>
    </AccountModal>
  );
};

export default TrackerInfoSheet;
