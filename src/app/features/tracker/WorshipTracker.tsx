/**
 * WORSHIP TRACKER PAGE
 * Today's acts, grouped into sections, with a completion ring and a
 * display-only 7-day strip. Only the current tracking day (which starts at
 * Fajr) can be edited; items open at their prayer times.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { IonPage, IonContent, useIonViewWillEnter } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import { loadPrayerDay } from "../../core/services/prayer/prayer-times.service";
import type { PrayerDay } from "../../core/services/prayer/prayer-times.types";
import { SECTIONS, ItemId, TrackerItem } from "./trackerCatalog";
import {
  trackingDate, toDayKey, isUnlocked, freshTimes, fastingOccasion, visibleSections, dayScore,
} from "./trackerLogic";
import { loadDays, toggleItem, loadSettings, saveSettings } from "./trackerStore";
import TrackerSettingsSheet from "./TrackerSettingsSheet";
import TrackerInfoSheet from "./TrackerInfoSheet";
import TrackerCalendarSheet from "./TrackerCalendarSheet";
import { ITEM_ICONS } from "./trackerIcons";
import { getSurahStartPage } from "../../core/services/data/metadata.service";
import "./WorshipTracker.css";

const LONG_PRESS_MS = 500;
// Al-Kahf starts on page 293 of the Madani mushaf; the metadata cache is
// preferred, with the constant as a fallback if it has not loaded yet.
const KAHF_FALLBACK_PAGE = 293;
const kahfPage = () => {
  const page = getSurahStartPage(18);
  return page > 1 ? page : KAHF_FALLBACK_PAGE;
};

const WorshipTracker: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const tt = t.tracker;

  const [now, setNow] = useState(() => new Date());
  const [prayer, setPrayer] = useState<PrayerDay | null>(null);
  const [days, setDays] = useState(loadDays);
  const [settings, setSettings] = useState(loadSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<"settings" | "info" | "calendar" | null>(null);
  /** A past day being viewed read-only; null shows the current tracking day. */
  const [viewed, setViewed] = useState<Date | null>(null);
  const pressTimer = useRef<number>();
  const longPressed = useRef(false);

  const reloadTimes = () => {
    loadPrayerDay().then(setPrayer).catch(() => setPrayer({ hasLocation: false, times: null, next: null }));
  };

  // Ionic keeps the page mounted, so re-read the clock and times whenever it
  // is shown again (e.g. after the app was backgrounded overnight). This does
  // not fire on the first mount, which the effect below covers.
  useIonViewWillEnter(() => {
    setNow(new Date());
    reloadTimes();
  });

  useEffect(() => {
    reloadTimes();
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const times = freshTimes(prayer?.times ?? null, now);
  const timesStale = Boolean(prayer?.times) && !times;

  // Past midnight the loaded times belong to yesterday: fetch the new day's.
  useEffect(() => {
    if (timesStale) reloadTimes();
  }, [timesStale]);
  const today = trackingDate(now, times?.fajr);
  const dayKey = toDayKey(today);
  const isPreviousDay = dayKey !== toDayKey(now);
  // Everything below the strip reads from the shown day: today, or a past
  // day picked from the strip or calendar, which is read-only.
  const shown = viewed && toDayKey(viewed) < dayKey ? viewed : today;
  const shownKey = toDayKey(shown);
  const readOnly = shownKey !== dayKey;
  const ticked = days[shownKey] ?? [];
  const visible = visibleSections(shown, settings);
  const occasion = fastingOccasion(shown);
  const logged = useMemo(
    () => new Set(Object.keys(days).filter((k) => days[k].length > 0)),
    [days],
  );
  const pickDay = (d: Date) => setViewed(toDayKey(d) === dayKey ? null : d);

  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = toDayKey(d);
    return { d, key, score: dayScore(days[key] ?? [], visibleSections(d, settings)) };
  }), [today.getTime(), days, settings]);

  const tap = (item: TrackerItem) => {
    if (longPressed.current || readOnly) return;
    if (!isUnlocked(item, now, times, isPreviousDay)) return;
    setDays(toggleItem(dayKey, item.id));
  };

  const openLongPress = (item: TrackerItem) => {
    if (item.longPress === "azkarMorningEvening") history.push("/azkar/morning-evening");
    else if (item.longPress === "azkarSleep") history.push("/azkar/sleep");
    else if (item.longPress === "quran") {
      history.push(today.getDay() === 5 ? `/viewer?page=${kahfPage()}` : "/viewer");
    }
  };

  const pressHandlers = (item: TrackerItem) => ({
    onPointerDown: () => {
      longPressed.current = false;
      if (!item.longPress) return;
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        openLongPress(item);
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => window.clearTimeout(pressTimer.current),
    onPointerLeave: () => window.clearTimeout(pressTimer.current),
    onPointerCancel: () => window.clearTimeout(pressTimer.current),
    // Keep Android's long-press context menu from firing alongside navigation.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => tap(item),
  });

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(shown);
  const hijri = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-GB-u-ca-islamic-umalqura",
    { day: "numeric", month: "long" },
  ).format(shown);
  const greg = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(shown);
  const score = dayScore(ticked, visible);

  const done = (id: ItemId) => ticked.includes(id);
  const lockIcon = (
    <svg className="wt-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
  const checkIcon = (
    <svg className="wt-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const renderSection = (sectionId: typeof visible[number]) => {
    const section = SECTIONS.find((s) => s.id === sectionId)!;
    const count = section.items.filter((i) => done(i.id)).length;
    return (
      <section key={section.id} className="wt-section">
        <div className="wt-section-head">
          <h2>{tt.sections[section.id]}</h2>
          {section.id === "fasting" && occasion
            ? <span className="wt-chip wt-chip--accent">{tt.fasting[occasion].chip}</span>
            : <span className="wt-count">{count}/{section.items.length}</span>}
        </div>
        <div className={section.id === "prayers" ? "wt-prayer-row" : "wt-item-list"}>
          {section.items.map((item) => {
            const open = readOnly || isUnlocked(item, now, times, isPreviousDay);
            const isFast = item.id === "fastToday";
            const title = isFast ? tt.fastTodayTitle : tt.items[item.id].title;
            const subtitle = isFast && occasion ? tt.fasting[occasion].subtitle : tt.items[item.id]?.subtitle;
            return (
              <button
                key={item.id}
                className={
                  (section.id === "prayers" ? "wt-prayer" : "wt-item") +
                  (done(item.id) ? " is-done" : "") + (open ? "" : " is-locked") +
                  (readOnly ? " is-readonly" : "")
                }
                aria-pressed={done(item.id)}
                aria-disabled={!open || readOnly}
                {...pressHandlers(item)}
              >
                {section.id !== "prayers" && ITEM_ICONS[item.id] && (
                  <span className="wt-item-icon">{ITEM_ICONS[item.id]}</span>
                )}
                <span className="wt-item-text">
                  <span className="wt-item-title">{title}</span>
                  {section.id === "prayers" && <span className="wt-item-icon">{ITEM_ICONS[item.id]}</span>}
                  {subtitle && section.id !== "prayers" && <span className="wt-item-sub">{subtitle}</span>}
                </span>
                <span className="wt-item-state">{done(item.id) ? checkIcon : open ? null : lockIcon}</span>
                {!open && <span className="wt-sr-only">{tt.locked}</span>}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <IonPage>
      <IonContent fullscreen className="wt-content">
        <div className="wt-page" dir={isRTL ? "rtl" : "ltr"}>
          <header className="wt-header">
            <button className="wt-round-btn" onClick={() => history.goBack()} aria-label={tt.back}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={isRTL ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <h1>{tt.title}</h1>
            <div className="wt-menu-wrap">
              <button className="wt-round-btn" onClick={() => setMenuOpen((o) => !o)} aria-label={tt.menu} aria-expanded={menuOpen}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
              {menuOpen && (
                <div className="wt-menu">
                  <button onClick={() => { setMenuOpen(false); setSheet("settings"); }}>{tt.menuSettings}</button>
                  <button onClick={() => { setMenuOpen(false); setSheet("info"); }}>{tt.menuInfo}</button>
                </div>
              )}
            </div>
          </header>

          <div className="wt-summary">
            <div className="wt-summary-top">
              <div>
                <div className="wt-weekday">{weekday}</div>
                <div className="wt-dates">{hijri} — {greg}</div>
              </div>
              <button
                className="wt-round-btn wt-cal-btn"
                onClick={() => setSheet("calendar")}
                aria-label={tt.openCalendar}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                  <path d="M3.5 10h17M8 3v4M16 3v4" />
                </svg>
              </button>
              <div className="wt-ring" style={{ "--wt-p": score } as React.CSSProperties}>
                <span>{score}</span>
              </div>
            </div>
            <div className="wt-strip">
              {strip.map(({ d, key, score: s }) => (
                <button
                  key={key}
                  className={
                    "wt-strip-day" + (key === dayKey ? " is-today" : "") + (key === shownKey ? " is-selected" : "")
                  }
                  onClick={() => pickDay(d)}
                  aria-pressed={key === shownKey}
                >
                  <span className="wt-strip-name">{new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d)}</span>
                  <span className="wt-strip-dot" style={{ "--wt-p": s } as React.CSSProperties} />
                  <span className="wt-strip-num">{d.getDate()}</span>
                </button>
              ))}
            </div>
          </div>

          {readOnly && (
            <div className="wt-past-banner" role="status">
              <span>{tt.viewingPast}</span>
              <button onClick={() => setViewed(null)}>{tt.backToToday}</button>
            </div>
          )}


          {visible.map(renderSection)}
        </div>
      </IonContent>
      <BottomNavBar active="more" fixed />

      {sheet === "settings" && (
        <TrackerSettingsSheet
          settings={settings}
          date={today}
          onChange={(s) => { setSettings(s); saveSettings(s); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "calendar" && (
        <TrackerCalendarSheet
          selected={shown}
          today={today}
          logged={logged}
          onPick={(d) => { pickDay(d); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "info" && <TrackerInfoSheet onClose={() => setSheet(null)} />}
    </IonPage>
  );
};

export default WorshipTracker;
