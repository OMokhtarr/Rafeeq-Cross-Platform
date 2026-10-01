/**
 * What the worship tracker is for and how its time locks work. The first
 * card says plainly that tracking is an aid, not an act of worship.
 */
import React, { useState } from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";
import { RIYA_NARRATIONS, RIYA_EXPLANATION, RIYA_EXPLANATION_TITLE } from "./riyaHadith";

const TrackerInfoSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, isRTL } = useLang();
  const ti = t.tracker.info;
  const [riyaOpen, setRiyaOpen] = useState(false);

  return (
    <AccountModal title={t.tracker.title} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <p className="wt-sheet-question">{ti.subtitle}</p>
        <section className="wt-info-card">
          <h3>{ti.purposeTitle}</h3>
          <p>
            {ti.purpose}
            <button className="wt-inline-link" onClick={() => setRiyaOpen(true)}>{ti.riyaLink}</button>
            {ti.purposeEnd}
          </p>
        </section>
        <section className="wt-info-card">
          <h3>{ti.howTitle}</h3>
          <ul>{ti.how.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <section className="wt-info-card">
          <h3>{ti.lockedTitle}</h3>
          <ul>{ti.locked.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <p className="wt-sheet-footnote">{ti.credit}</p>
      </div>
      {riyaOpen && (
        <AccountModal title={ti.riyaTitle} onClose={() => setRiyaOpen(false)}>
          <div className="wt-sheet" dir="rtl" lang="ar">
            {RIYA_NARRATIONS.map((n) => (
              <React.Fragment key={n.source[0]}>
                <section className="wt-info-card">
                  <p className="wt-hadith">{n.text}</p>
                </section>
                {n.source.map((line) => <p key={line} className="wt-sheet-footnote">{line}</p>)}
              </React.Fragment>
            ))}
            <section className="wt-info-card">
              <h3>{RIYA_EXPLANATION_TITLE}</h3>
              {RIYA_EXPLANATION.map((para) => <p key={para} className="wt-explanation">{para}</p>)}
            </section>
          </div>
        </AccountModal>
      )}
    </AccountModal>
  );
};

export default TrackerInfoSheet;
