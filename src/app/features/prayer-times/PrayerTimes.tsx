/**
 * PRAYER TIMES PAGE
 * Reached from More. Renders the six daily times with the next prayer
 * highlighted and a live countdown, plus the method/madhab pickers.
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
import {
  loadPrayerDay,
  requestLocation,
  getPrayerConfig,
  setPrayerConfig,
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
  const [denied, setDenied] = useState(false);
  // Collapsed by default: these are secondary to the timetable above them.
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestingRef = useRef(false);

  const load = useCallback(async () => {
    const [cfg, d] = await Promise.all([getPrayerConfig(), loadPrayerDay()]);
    setConfig({ method: cfg.method, madhab: cfg.madhab });
    setDay(d);
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

  const handleGrantLocation = useCallback(async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setDenied(false);
    try {
      const ok = await requestLocation();
      if (!ok) {
        setDenied(true);
        return;
      }
      await load();
    } finally {
      requestingRef.current = false;
    }
  }, [load]);

  const handleMethodChange = useCallback(
    async (value: string) => {
      await setPrayerConfig({ method: value as PrayerMethod });
      await load();
    },
    [load],
  );

  const handleMadhabChange = useCallback(
    async (value: string) => {
      await setPrayerConfig({ madhab: value as PrayerMadhab });
      await load();
    },
    [load],
  );

  const hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const gregorianDate = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-EG" : "en-GB",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  ).format(new Date());

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const rowLabel = (key: PrayerKey): string => tp[key];

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="pt-page-wrapper">
          <div className="pt-container" dir={isRTL ? "rtl" : "ltr"}>
            {day === null ? null : !day.hasLocation ? (
              <>
                <h1 className="pt-title">{tp.title}</h1>
                <div className="pt-permission">
                  <h2 className="pt-permission-title">{tp.locationNeeded}</h2>
                  <p className="pt-permission-desc">{tp.locationNeededDesc}</p>
                  <button
                    type="button"
                    className="pt-grant-btn"
                    onClick={handleGrantLocation}
                  >
                    {tp.grantLocation}
                  </button>
                  {denied && <p className="pt-denied">{tp.locationDenied}</p>}
                </div>
              </>
            ) : (
              <>
                {/* ── Hero: the next prayer, its time, and the countdown ── */}
                <div className="pt-hero">
                  {day.next && nextAt !== undefined ? (
                    <>
                      <p className="pt-hero-label">{tp.nextPrayer}</p>
                      <h1 className="pt-hero-name">{rowLabel(day.next.name)}</h1>
                      <p className="pt-hero-time">
                        {formatTime(day.next.at)}
                      </p>
                      <span className="pt-hero-pill">
                        {formatCountdown(nextAt - now, lang)}
                      </span>
                    </>
                  ) : (
                    // No next prayer: the midnight-sun window. The times below
                    // still stand, so the hero shows the page's name rather
                    // than an empty block or an invented countdown.
                    <h1 className="pt-hero-name">{tp.title}</h1>
                  )}
                </div>

                {/* ── Date band ── */}
                <div className="pt-dates">
                  <p className="pt-date-greg">{gregorianDate}</p>
                  <p className="pt-date-hijri">{hijriDate}</p>
                </div>

                {/* ── Daily timetable ── */}
                <div className="pt-rows">
                  {PRAYER_KEYS.filter((key) => day.times?.[key]).map((key) => {
                    const time = day.times![key];
                    const isNext = day.next?.name === key;
                    const isSunrise = key === "sunrise";
                    return (
                      <div
                        key={key}
                        className={
                          "pt-row" +
                          (isNext ? " pt-row--next" : "") +
                          (isSunrise ? " pt-row--sunrise" : "")
                        }
                      >
                        <span className="pt-row-label">{rowLabel(key)}</span>
                        <span className="pt-row-time">{formatTime(time)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* ── Supplementary times ── */}
                {ADDITIONAL_KEYS.some((key) => day.times?.[key]) && (
                  <div className="pt-additional">
                    <button
                      type="button"
                      className="pt-additional-toggle"
                      onClick={() => setAdditionalOpen((open) => !open)}
                      aria-expanded={additionalOpen}
                    >
                      <span className="pt-additional-rule" aria-hidden="true" />
                      <span className="pt-additional-label">
                        {tp.additionalTimes}
                      </span>
                      <span
                        className={
                          "pt-additional-chevron" +
                          (additionalOpen ? " pt-additional-chevron--open" : "")
                        }
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </span>
                      <span className="pt-additional-rule" aria-hidden="true" />
                    </button>

                    {additionalOpen && (
                      <div className="pt-rows pt-rows--additional">
                        {ADDITIONAL_KEYS.filter((key) => day.times?.[key]).map(
                          (key) => (
                            <div key={key} className="pt-row pt-row--sunrise">
                              <span className="pt-row-label">
                                {rowLabel(key)}
                              </span>
                              <span className="pt-row-time">
                                {formatTime(day.times![key])}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
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
                </div>
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
