/**
 * PRAYER-TIMES MENU SHEET
 * What the ⋮ on the Prayer Times page opens. A hub, not a settings screen:
 * every row leads somewhere, and the page itself keeps only the compass, the
 * countdown and the timetable.
 *
 * Each row carries the current value beneath its label — the active
 * calculation method, whether a widget is placed — so the menu answers "what
 * is it set to" without being opened further.
 *
 * The widget and alarm rows are absent where the platform has no widget or
 * cannot ring alarms (web, iOS), rather than present and inert.
 */

import React, { useEffect } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import "./PrayerSheet.css";
import "./PrayerMenuSheet.css";

export type PrayerMenuTarget = "shown" | "widget" | "calculation" | "alarms";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (target: PrayerMenuTarget) => void;
  /** Localized name of the active calculation method, shown under its row. */
  methodLabel: string;
  /** Absent where the platform has no home-screen widget. */
  widgetStatus: string | null;
  /** Absent where alarms cannot ring (anywhere but Android). */
  alarmsStatus: string | null;
}

const EyeIcon = () => (
  <svg
    className="pms-option-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path
      d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const WidgetIcon = () => (
  <svg
    className="pms-option-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <rect x="6" y="9" width="12" height="6" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const AlarmIcon: React.FC<{ className?: string }> = ({ className = "pms-option-icon" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4.2l2.6 1.6M4.5 4.8 7 2.8M19.5 4.8 17 2.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalculationIcon = () => (
  <svg
    className="pms-option-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3.2" />
    <path
      d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"
      strokeLinecap="round"
    />
  </svg>
);

const Chevron = () => (
  <svg
    className="pms-option-chevron"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    aria-hidden="true"
  >
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PrayerMenuSheet: React.FC<Props> = ({
  open,
  onClose,
  onSelect,
  methodLabel,
  widgetStatus,
  alarmsStatus,
}) => {
  const { t, isRTL } = useLang();
  const tp = t.prayerTimes;

  // Hardware back closes the menu rather than leaving the page.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(onClose);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sts-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="sts-sheet"
        role="dialog"
        aria-label={tp.menuTitle}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="sts-handle" aria-hidden="true" />

        <header className="sts-header">
          <div className="sts-header-text">
            <h3 className="sts-title">{tp.menuTitle}</h3>
          </div>
          <button
            className="sts-close"
            onClick={onClose}
            aria-label={t.mushaf.closeLabel}
          >
            ✕
          </button>
        </header>

        <div className="sts-body">
          <button
            type="button"
            className="pms-option"
            onClick={() => onSelect("shown")}
          >
            <EyeIcon />
            <span className="pms-option-text">
              <span className="pms-option-label">{tp.show}</span>
              <span className="pms-option-value">{tp.showDesc}</span>
            </span>
            <Chevron />
          </button>

          {alarmsStatus !== null && (
            <button
              type="button"
              className="pms-option"
              onClick={() => onSelect("alarms")}
            >
              <AlarmIcon />
              <span className="pms-option-text">
                <span className="pms-option-label">{t.prayerAlarms.menuLabel}</span>
                <span className="pms-option-value">{alarmsStatus}</span>
              </span>
              <Chevron />
            </button>
          )}

          {widgetStatus !== null && (
            <button
              type="button"
              className="pms-option"
              onClick={() => onSelect("widget")}
            >
              <WidgetIcon />
              <span className="pms-option-text">
                <span className="pms-option-label">{tp.widgetSettings}</span>
                <span className="pms-option-value">{widgetStatus}</span>
              </span>
              <Chevron />
            </button>
          )}

          <button
            type="button"
            className="pms-option"
            onClick={() => onSelect("calculation")}
          >
            <CalculationIcon />
            <span className="pms-option-text">
              <span className="pms-option-label">{tp.calculationTitle}</span>
              <span className="pms-option-value">{methodLabel}</span>
            </span>
            <Chevron />
          </button>
        </div>
      </aside>
    </>
  );
};

export default PrayerMenuSheet;
