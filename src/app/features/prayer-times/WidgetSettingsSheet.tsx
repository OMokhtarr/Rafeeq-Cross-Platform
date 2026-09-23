/**
 * WIDGET SETTINGS SHEET
 * Everything to do with the home-screen widget, reached from the Prayer
 * Times page's ⋮ menu. Previously these controls sat inline on the page,
 * below the timetable, where they competed with the times for attention.
 *
 * Only ever rendered where the platform actually has a widget — the menu row
 * that opens it is itself absent on web and iOS — so there is no
 * "unsupported" state to draw here.
 *
 * Colour comes from the theme tokens in CSS rather than a night-mode class:
 * the class used to resolve the same token as the base rule, so it did
 * nothing, and the literal fallbacks beside it painted the sheet white in a
 * dark app whenever they fired.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import {
  requestPinWidget,
  openAppSettings,
  openHomeScreen,
  openWidgetSettings,
  syncAppTheme,
} from "../../core/services/prayer/prayer-times.service";
import "./PrayerSheet.css";
import "./WidgetSettingsSheet.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  /** How many copies are currently on the home screen. */
  placed: number;
  /** Re-reads the placed count and config after a change. */
  onChanged: () => void;
}

const WidgetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <rect x="6" y="9" width="12" height="6" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const AppearanceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
  </svg>
);

const WidgetSettingsSheet: React.FC<Props> = ({
  open,
  onClose,
  onBack,
  placed,
  onChanged,
}) => {
  const { t, isRTL } = useLang();
  const { isNight } = useTheme();
  const tp = t.prayerTimes;

  const [blocked, setBlocked] = useState(false);

  // Registers the back step, not the close: the hardware back button has to
  // land where the header's back arrow does, otherwise the same gesture
  // means "up one level" in one place and "dismiss everything" in the other.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(onBack);
  }, [open, onBack]);

  // A widget placed since the warning was raised settles the question —
  // whatever was blocking it no longer is, so the warning must not linger.
  useEffect(() => {
    if (placed > 0) setBlocked(false);
  }, [placed]);

  /**
   * Hands off to the launcher's own pin dialog.
   *
   * No success message is shown even when the request is accepted: the
   * launcher owns that dialog and never reports the outcome back, so the
   * refreshed count on returning to the page is the honest place for success
   * to surface.
   *
   * A refusal is different and must be said out loud. Some launchers (MIUI)
   * reject the request without showing the user anything, which is the
   * "nothing happens on tap" this branch exists to explain.
   */
  const handleAdd = useCallback(async () => {
    setBlocked(false);
    const { blocked: refused, alreadyPlaced } = await requestPinWidget();
    // One widget is enough: a second copy would show the same timetable. The
    // native side refuses in that case, and the useful answer is to put the
    // user in front of the one they already have.
    if (alreadyPlaced) {
      await openHomeScreen();
      return;
    }
    if (refused) setBlocked(true);
    else onChanged();
  }, [onChanged]);

  /**
   * Opens the widget's appearance screen, a native Activity.
   *
   * The theme is mirrored across first: that screen cannot read the app's
   * stored theme from localStorage, so without this it follows the device
   * and renders white inside a dark Rafeeq.
   */
  const handleAppearance = useCallback(async () => {
    await syncAppTheme(isNight);
    await openWidgetSettings();
  }, [isNight]);

  if (!open) return null;

  return (
    <>
      <div className="sts-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="sts-sheet"
        role="dialog"
        aria-label={tp.widgetSettings}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="sts-handle" aria-hidden="true" />

        <header className="sts-header">
          <div className="sts-header-text">
            <h3 className="sts-title">{tp.widgetSettings}</h3>
            <p className="sts-desc">{tp.widgetSettingsDesc}</p>
          </div>
          <button className="sts-close sts-back" onClick={onBack} aria-label={tp.menuTitle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="sts-body">
          <div className="wss-section">
            {/* One widget is the limit, so once a copy is placed the button
                becomes a way to reach it rather than an offer of a second
                copy of the same timetable. */}
            <button
              type="button"
              className="wss-btn"
              onClick={placed > 0 ? openHomeScreen : handleAdd}
            >
              <WidgetIcon />
              {placed > 0 ? tp.widgetShowOnHome : tp.addWidget}
            </button>

            {/* Appearance is only meaningful once something is placed —
                there is no widget to restyle otherwise. */}
            {placed > 0 && (
              <button
                type="button"
                className="wss-btn wss-btn--secondary"
                onClick={handleAppearance}
              >
                <AppearanceIcon />
                {tp.widgetAppearance}
              </button>
            )}

            {blocked && (
              // The launcher refused without telling the user. Explains why
              // and offers both routes: the permission, and adding it by hand.
              <div className="wss-blocked" role="status">
                <p className="wss-blocked-text">{tp.widgetBlocked}</p>
                <button
                  type="button"
                  className="wss-settings-btn"
                  onClick={openAppSettings}
                >
                  {tp.widgetOpenSettings}
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>
    </>
  );
};

export default WidgetSettingsSheet;
