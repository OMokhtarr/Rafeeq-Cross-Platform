/**
 * PRAYER TIMES PAGE
 * Reached from More by either the qibla card or the times card — one page
 * holding both. The compass header sits on top, then the daily times with the
 * next prayer highlighted and a live countdown. There is no view switch:
 * nothing is hidden behind a tab.
 *
 * Settings do not live on the page. The ⋮ opens a menu sheet, and each of its
 * rows opens a sheet of its own — shown times, widget, calculation. They are
 * set once and rarely revisited, so a permanent place here cost more
 * attention than they earned, and the timetable is what the page is for.
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
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import QiblaHeader from "./QiblaHeader";
import ShowTimesSheet from "./ShowTimesSheet";
import PrayerMenuSheet, { type PrayerMenuTarget } from "./PrayerMenuSheet";
import WidgetSettingsSheet from "./WidgetSettingsSheet";
import CalculationSheet, { METHOD_LABEL_KEY, MADHABS } from "./CalculationSheet";
import {
  loadPrayerDay,
  requestLocation,
  getPrayerConfig,
  setPrayerConfig,
  getVisibleTimes,
  getPlace,
  getWidgetInfo,
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
  // Which sheet is on screen, if any. One value rather than a flag per
  // sheet: they are steps in a single stack, never open at once, and a flag
  // each would let two of them be true.
  const [sheet, setSheet] = useState<"menu" | PrayerMenuTarget | null>(null);
  const [widget, setWidget] = useState<{
    supported: boolean;
    placed: number;
  } | null>(null);
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

  const closeSheet = useCallback(() => setSheet(null), []);
  const backToMenu = useCallback(() => setSheet("menu"), []);

  // The menu shows each destination's current value under its label, so the
  // common question is answered without opening anything.
  const methodLabel = config
    ? (tp[METHOD_LABEL_KEY[config.method] as keyof typeof tp] as string)
    : "";

  // Null where the platform has no widget — that keeps the row out of the
  // menu entirely rather than showing one that leads nowhere.
  const widgetStatus = !widget?.supported
    ? null
    : widget.placed > 0
    ? tp.widgetPlacedStatus
    : tp.widgetNotPlacedStatus;

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const rowLabel = (key: PrayerKey): string => tp[key];

  // Moved here from the header: the dates label the timetable, so they head
  // its card.
  const today = new Date(now);
  const gregorianDate = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-EG" : "en-GB",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  ).format(today);
  const hijriDate = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-GB-u-ca-islamic-umalqura",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(today);

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
                  next={
                    day.next && nextAt !== undefined
                      ? {
                          key: day.next.name,
                          label: rowLabel(day.next.name),
                          time: formatTime(day.next.at),
                          countdown: formatCountdown(nextAt - now, lang),
                        }
                      : null
                  }
                  times={rowKeys.map((key) => ({ key, at: day.times![key]! }))}
                  sunrise={day.times?.sunrise}
                  maghrib={day.times?.maghrib}
                  now={now}
                />

                <div className="pt-card">
                  {/* The dates head the timetable they label, with the
                      options menu at the row's end — the conventional place
                      for it, so a bare ⋮ is enough here. */}
                  <div className="pt-card-header">
                    <div className="pt-dates">
                      <p className="pt-date-greg">{gregorianDate}</p>
                      <p className="pt-date-hijri">{hijriDate}</p>
                    </div>
                    <button
                      type="button"
                      className="pt-menu-btn"
                      onClick={() => setSheet("menu")}
                      aria-haspopup="dialog"
                      aria-label={tp.menuLabel}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
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

                <PrayerMenuSheet
                  open={sheet === "menu"}
                  onClose={closeSheet}
                  onSelect={setSheet}
                  methodLabel={methodLabel}
                  widgetStatus={widgetStatus}
                />

                <ShowTimesSheet
                  open={sheet === "shown"}
                  onClose={closeSheet}
                  onBack={backToMenu}
                  onChanged={load}
                />

                {/* Mounted only where the platform has a widget at all, which
                    is the same condition that puts its row in the menu. */}
                {widget?.supported && (
                  <WidgetSettingsSheet
                    open={sheet === "widget"}
                    onClose={closeSheet}
                    onBack={backToMenu}
                    placed={widget.placed}
                    onChanged={load}
                  />
                )}

                <CalculationSheet
                  open={sheet === "calculation"}
                  onClose={closeSheet}
                  onBack={backToMenu}
                  method={config?.method ?? PRAYER_METHODS[0]}
                  madhab={config?.madhab ?? MADHABS[0]}
                  onMethodChange={handleMethodChange}
                  onMadhabChange={handleMadhabChange}
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
