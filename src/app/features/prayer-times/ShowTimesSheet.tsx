/**
 * SHOW-TIMES SHEET
 * Bottom sheet letting the user choose which prayer-times rows appear on the
 * Prayer Times page. Follows the VerseActionSheet pattern: fixed backdrop
 * that closes on click, bottom-anchored panel, and registration with the
 * overlay registry so the Android hardware back button closes the sheet
 * instead of leaving the page.
 *
 * The five obligatory prayers (fajr, dhuhr, asr, maghrib, isha) always render
 * checked and disabled, with a short "always shown" note in place of an
 * interactive control. The native layer force-includes them regardless of
 * what is persisted, but a toggle that silently undoes itself the next time
 * the page reloads is worse than one that is visibly unavailable — so the UI
 * itself must never offer it.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import {
  getVisibleTimes,
  setVisibleTimes,
} from "../../core/services/prayer/prayer-times.service";
import {
  PRAYER_KEYS,
  ADDITIONAL_KEYS,
  PRAYERS_ONLY,
  type PrayerKey,
} from "../../core/services/prayer/prayer-times.types";
import "./ShowTimesSheet.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ALL_KEYS: PrayerKey[] = [...PRAYER_KEYS, ...ADDITIONAL_KEYS];

const isObligatory = (key: PrayerKey) => (PRAYERS_ONLY as PrayerKey[]).includes(key);

const ShowTimesSheet: React.FC<Props> = ({ open, onClose, onChanged }) => {
  const { t, isRTL } = useLang();
  const { isNight } = useTheme();

  const nightClass = isNight ? " sts-sheet--night" : "";

  const [visible, setVisible] = useState<PrayerKey[]>([]);

  // Register with the overlay registry so the hardware back button closes
  // this sheet instead of leaving the page.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(onClose);
  }, [open, onClose]);

  // Load the current set whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVisibleTimes().then((times) => {
      if (!cancelled) setVisible(times);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggle = useCallback(
    (key: PrayerKey) => {
      if (isObligatory(key)) return;
      const next = visible.includes(key)
        ? visible.filter((k) => k !== key)
        : [...visible, key];
      setVisible(next);
      setVisibleTimes(next).then(onChanged);
    },
    [visible, onChanged],
  );

  if (!open) return null;

  return (
    <>
      <div className="sts-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className={`sts-sheet${nightClass}`}
        role="dialog"
        aria-label={t.prayerTimes.show}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="sts-handle" aria-hidden="true" />

        <header className="sts-header">
          <div className="sts-header-text">
            <h3 className="sts-title">{t.prayerTimes.show}</h3>
            <p className="sts-desc">{t.prayerTimes.showDesc}</p>
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
          {ALL_KEYS.map((key) => {
            const obligatory = isObligatory(key);
            const checked = obligatory || visible.includes(key);
            return (
              <div className={`sts-row${nightClass}`} key={key}>
                <span className="sts-row-label">{t.prayerTimes[key]}</span>
                {obligatory ? (
                  <span className="sts-always">{t.prayerTimes.alwaysShown}</span>
                ) : (
                  <label className="sts-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(key)}
                      aria-label={t.prayerTimes[key]}
                    />
                    <span className="sts-toggle-slider" />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default ShowTimesSheet;
