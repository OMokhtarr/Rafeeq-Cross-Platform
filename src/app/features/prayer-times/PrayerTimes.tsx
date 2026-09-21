/**
 * PRAYER TIMES PAGE
 * Reached from More by either the qibla card or the times card — one page
 * holding both. The compass header sits on top, then the daily times with the
 * next prayer highlighted and a live countdown, then the method/madhab
 * pickers. There is no view switch: nothing is hidden behind a tab.
 *
 * A missing location is a designed state, not an error: `hasLocation: false`
 * is the normal first-run condition until the user grants a fix, so it gets
 * an explanation and a button rather than a spinner or a toast.
 *
 * `times` may omit individual keys and `next` may be null even when times
 * exist — both happen inside the midnight-sun window at high latitude
 * (see PrayerTimesEngine.kt / prayer-times.service.ts). Rows for absent keys
 * are skipped, and a null `next` simply renders without a countdown.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IonPage, IonContent, useIonViewWillEnter } from "@ionic/react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import QiblaHeader from "./QiblaHeader";
import ShowTimesSheet from "./ShowTimesSheet";
import {
  loadPrayerDay,
  requestLocation,
  getPrayerConfig,
  setPrayerConfig,
  getVisibleTimes,
  getPlace,
  getWidgetInfo,
  requestPinWidget,
  openAppSettings,
} from "../../core/services/prayer/prayer-times.service";
import {
  ADDITIONAL_KEYS,
  PRAYER_KEYS,
  PRAYER_METHODS,
  type PrayerKey,
  type PrayerMadhab,
  type PrayerMethod,
  type PrayerDay,
} from "../../core/services/prayer/prayer-times.types";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import "./PrayerTimes.css";

const ALL_ROW_KEYS: PrayerKey[] = [...PRAYER_KEYS, ...ADDITIONAL_KEYS];

// Maps each calculation method to its localized string key — no other
// mapping exists between the plugin's enum and the i18n strings.
const METHOD_LABEL_KEY: Record<PrayerMethod, string> = {
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

const MADHABS: PrayerMadhab[] = ["shafi", "hanafi"];

function formatCountdown(msRemaining: number, lang: string): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (lang === "ar") {
    if (hours > 0) {
      return `${toHindiNumbers(hours)}س ${toHindiNumbers(minutes)}د`;
    }
    if (minutes > 0) {
      return `${toHindiNumbers(minutes)}د ${toHindiNumbers(seconds)}ث`;
    }
    return `${toHindiNumbers(seconds)}ث`;
  }

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const PrayerTimes: React.FC = () => {
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const tp = t.prayerTimes;

  const [day, setDay] = useState<PrayerDay | null>(null);
  const [config, setConfig] = useState<{
    method: PrayerMethod;
    madhab: PrayerMadhab;
  } | null>(null);
  const [visible, setVisible] = useState<PrayerKey[] | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<
    "denied" | "services-off" | "failed" | null
  >(null);
  const [showSheetOpen, setShowSheetOpen] = useState(false);
  const [widget, setWidget] = useState<{
    supported: boolean;
    placed: number;
  } | null>(null);
  const [widgetBlocked, setWidgetBlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestingRef = useRef(false);

  const load = useCallback(async () => {
    const [cfg, d, v, p, w] = await Promise.all([
      getPrayerConfig(),
      loadPrayerDay(),
      getVisibleTimes(),
      getPlace(),
      // Re-read on every load, not once on mount: the widget is added and
      // removed on the home screen, outside this page entirely, so the count
      // is only ever right as of the moment the page is entered.
      getWidgetInfo(),
    ]);
    setConfig({ method: cfg.method, madhab: cfg.madhab });
    setDay(d);
    setVisible(v);
    setPlace(p);
    setWidget(w);
    // Returning to the page with a widget now placed settles the question:
    // whatever was blocking it no longer is, so the warning must not linger.
    if (w.placed > 0) setWidgetBlocked(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useIonViewWillEnter(() => {
    load();
  });

  const nextAt = day?.next?.at.getTime();

  // Tick once a second while a next prayer is known; reload when it elapses
  // so `next` advances to the following prayer.
  useEffect(() => {
    if (nextAt === undefined) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= nextAt) {
        clearInterval(id);
        load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [nextAt, load]);

  const handleUpdateLocation = useCallback(async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setLocating(true);
    setLocationError(null);
    try {
      const outcome = await requestLocation();
      if (outcome !== "granted") {
        setLocationError(outcome);
        return;
      }
      await load();
    } finally {
      requestingRef.current = false;
      setLocating(false);
    }
  }, [load]);

  const handleMethodChange = useCallback(
    async (value: string) => {
      await setPrayerConfig({ method: value as PrayerMethod });
      await load();
    },
    [load]
  );

  const handleMadhabChange = useCallback(
    async (value: string) => {
      await setPrayerConfig({ madhab: value as PrayerMadhab });
      await load();
    },
    [load]
  );

  /**
   * Hands off to the launcher's own pin dialog.
   *
   * No success message is shown even when the request is accepted: the
   * launcher owns that dialog and never reports the outcome back, so the
   * refreshed count on the next `useIonViewWillEnter` is the honest place for
   * success to surface.
   *
   * A refusal is different and must be said out loud. Some launchers (MIUI)
   * reject the request without showing the user anything, which is the
   * "nothing happens on tap" this branch exists to explain.
   */
  const handleAddWidget = useCallback(async () => {
    setWidgetBlocked(false);
    const { blocked } = await requestPinWidget();
    if (blocked) setWidgetBlocked(true);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const rowLabel = (key: PrayerKey): string => tp[key];

  // One ordered list, filtered to keys that are both user-visible and
  // actually present in today's times — the visible-set preference no longer
  // has a separate collapsible section to defer to.
  const rowKeys =
    day?.times && visible
      ? ALL_ROW_KEYS.filter(
          (key) => visible.includes(key) && Boolean(day.times?.[key])
        )
      : [];
  const firstAdditionalKey = rowKeys.find((key) =>
    (ADDITIONAL_KEYS as PrayerKey[]).includes(key)
  );

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="pt-page-wrapper">
          <div className="pt-container" dir={isRTL ? "rtl" : "ltr"}>
            {day === null ? null : !day.hasLocation ? (
              <>
                <h1 className="pt-title">{tp.title}</h1>
                <div className="pt-permission">
                  <h2 className="pt-permission-title">
                    {locationError === "services-off"
                      ? tp.locationServicesOff
                      : tp.locationNeeded}
                  </h2>
                  <p className="pt-permission-desc">
                    {locationError === "services-off"
                      ? tp.locationServicesOffDesc
                      : tp.locationNeededDesc}
                  </p>
                  <button
                    type="button"
                    className="pt-grant-btn"
                    onClick={handleUpdateLocation}
                    disabled={locating}
                  >
                    {locating ? tp.locating : tp.grantLocation}
                  </button>
                  {locationError === "denied" && (
                    <p className="pt-denied">{tp.locationDenied}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <QiblaHeader
                  placeName={place}
                  onUpdateLocation={handleUpdateLocation}
                  locating={locating}
                />

                <div className="pt-card">
                  {day.next && nextAt !== undefined && (
                    <div className="pt-next">
                      <span className="pt-next-label">{tp.nextPrayer}</span>
                      <span className="pt-next-name">
                        {rowLabel(day.next.name)}
                      </span>
                      <span className="pt-next-countdown">
                        {formatCountdown(nextAt - now, lang)}
                      </span>
                    </div>
                  )}

                  {/* Only the three-dot menu now — the dates moved into the
                      compass header above. */}
                  <div className="pt-card-header">
                    <button
                      type="button"
                      className="pt-menu-btn"
                      onClick={() => setShowSheetOpen(true)}
                      aria-label={tp.show}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                  </div>

                  {/* ── Daily timetable ── */}
                  <div className="pt-rows">
                    {rowKeys.map((key) => {
                      const time = day.times![key];
                      const isNext = day.next?.name === key;
                      const isSunrise = key === "sunrise";
                      return (
                        <React.Fragment key={key}>
                          {key === firstAdditionalKey && (
                            <div className="pt-separator" aria-hidden="true">
                              <span className="pt-separator-label">
                                {tp.additionalTimes}
                              </span>
                            </div>
                          )}
                          <div
                            className={
                              "pt-row" +
                              (isNext ? " pt-row--next" : "") +
                              (isSunrise ? " pt-row--sunrise" : "")
                            }
                          >
                            <span className="pt-row-label">
                              {rowLabel(key)}
                            </span>
                            <span className="pt-row-time">
                              {formatTime(time)}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* The times on screen come from the last known fix, so a failure is
                    a note beside them rather than a takeover of the page. */}
                {locationError !== null && (
                  <p className="pt-location-error">
                    {locationError === "services-off"
                      ? tp.locationServicesOffDesc
                      : locationError === "denied"
                      ? tp.locationDenied
                      : tp.locationFailed}
                  </p>
                )}

                <div className="pt-settings">
                  <div className="pt-setting-row">
                    <span className="pt-setting-label">{tp.method}</span>
                    <InlineSelect
                      value={config?.method ?? PRAYER_METHODS[0]}
                      options={PRAYER_METHODS.map((m) => ({
                        value: m,
                        label: tp[METHOD_LABEL_KEY[m] as keyof typeof tp],
                      }))}
                      onChange={handleMethodChange}
                      night={isNight}
                      fullWidth
                      aria-label={tp.method}
                    />
                  </div>
                  <div className="pt-setting-row">
                    <span className="pt-setting-label">{tp.madhab}</span>
                    <InlineSelect
                      value={config?.madhab ?? MADHABS[0]}
                      options={MADHABS.map((m) => ({
                        value: m,
                        label: tp[m],
                      }))}
                      onChange={handleMadhabChange}
                      night={isNight}
                      fullWidth
                      aria-label={tp.madhab}
                    />
                  </div>

                  {/* Absent when the launcher cannot pin — there is no
                      way to force it, and a dead control would be worse
                      than none. The widget can still be added by
                      long-pressing the home screen. */}
                  {widget?.supported && (
                    <div>
                      <button
                        type="button"
                        className="pt-widget-btn"
                        onClick={handleAddWidget}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <rect x="3" y="4" width="18" height="16" rx="2.5" />
                          <rect
                            x="6"
                            y="9"
                            width="12"
                            height="6"
                            rx="1.5"
                            fill="currentColor"
                            stroke="none"
                          />
                        </svg>
                        {tp.addWidget}
                      </button>
                      {widgetBlocked ? (
                        // The launcher refused without telling the user.
                        // Explains why and offers both routes: the
                        // permission, and adding it by hand.
                        <div className="pt-widget-blocked" role="status">
                          <p className="pt-widget-blocked-text">
                            {tp.widgetBlocked}
                          </p>
                          <button
                            type="button"
                            className="pt-widget-settings-btn"
                            onClick={openAppSettings}
                          >
                            {tp.widgetOpenSettings}
                          </button>
                        </div>
                      ) : (
                        widget.placed > 0 && (
                          <p className="pt-widget-note">{tp.widgetAdded}</p>
                        )
                      )}
                    </div>
                  )}
                </div>

                <ShowTimesSheet
                  open={showSheetOpen}
                  onClose={() => setShowSheetOpen(false)}
                  onChanged={load}
                />
              </>
            )}
          </div>
        </div>
      </IonContent>
      <BottomNavBar active="more" fixed />
    </IonPage>
  );
};

export default PrayerTimes;
