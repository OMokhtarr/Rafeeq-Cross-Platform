/**
 * AZKAR PAGE
 * UI updated to match the Electron app's card structure:
 *  - Category cards: .azkar-cat-card with color accent + arrow
 *  - Detail items:   .azkar-item with number badge, source, translation support
 *  - Counter / progress / reset logic preserved
 *  - Per-category counter state persisted to localStorage
 *  - Haptic feedback via Web Vibration API (gated by settings.azkarVibration)
 *  - Horizontal swipe on an item resets its counter
 *  - Each item's action row: favourite, reset, counter, play, origin
 *  - "My Azkar" — a virtual category built from the user's favourites
 */

import React, { useState, useEffect, useRef } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import azkarData from "../../../data/azkarData";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import { useAzkarFavorites } from "./azkarFavorites";
import { zikrAudioUrl } from "./azkarAudio";
import "./Azkar.css";

// ── Settings (read-only read from Settings.tsx's localStorage key) ───────────
const SETTINGS_KEY = "rafiq_settings_v1";
function readAzkarFlags(): { vibrate: boolean; sound: boolean } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { vibrate: true, sound: false };
    const s = JSON.parse(raw);
    return {
      vibrate: s.azkarVibration !== false,
      sound: !!s.azkarCounterSound,
    };
  } catch {
    return { vibrate: true, sound: false };
  }
}

// Native iOS/Android haptics when running under Capacitor; fall back to the
// Web Vibration API on web/Electron. Both are fire-and-forget — we never
// await and we swallow errors so a haptic failure can't break the UI.
type HapticKind = "tick" | "complete" | "reset";

function haptic(kind: HapticKind) {
  const isNative = Capacitor.isNativePlatform();
  try {
    if (isNative) {
      // Capacitor plugin — ImpactStyle is the only API available without
      // extra native setup; patterns are approximated by chaining impacts.
      if (kind === "tick") {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      } else if (kind === "reset") {
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      } else {
        // "complete" — triple Heavy to match the [30,40,80] web pattern
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        setTimeout(
          () => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}),
          70,
        );
        setTimeout(
          () => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
          190,
        );
      }
      return;
    }
  } catch {
    // fall through to web vibrate
  }
  // Web Vibration API fallback (Android WebView, Chrome, Firefox)
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      const pattern: number | number[] =
        kind === "tick" ? 15 : kind === "reset" ? 25 : [30, 40, 80];
      (navigator as any).vibrate(pattern);
    }
  } catch {
    // iOS Safari (non-Capacitor) has no vibrate — silently ignore
  }
}

const MY_AZKAR_ID = "my-azkar";

// Favourites resolved to their zikr, in the order they were added; an id no
// longer present in azkarData is skipped.
function favoriteAzkar(favorites: string[]) {
  const all = azkarData.flatMap((c: any) => c.azkar);
  return favorites
    .map((id) => all.find((z: any) => z.id === id))
    .filter(Boolean);
}

// ── Per-category persistence ─────────────────────────────────────────────────
const stateKey = (catId: string) => `azkar:state:${catId}`;

function loadCatState(catId: string): {
  counters: Record<string, number>;
  completed: Record<string, boolean>;
} {
  try {
    const raw = localStorage.getItem(stateKey(catId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        counters: parsed.counters ?? {},
        completed: parsed.completed ?? {},
      };
    }
  } catch {
    // fall through
  }
  return { counters: {}, completed: {} };
}

function saveCatState(
  catId: string,
  counters: Record<string, number>,
  completed: Record<string, boolean>,
) {
  try {
    localStorage.setItem(
      stateKey(catId),
      JSON.stringify({ counters, completed }),
    );
  } catch {
    // ignore quota errors
  }
}

const Azkar: React.FC = () => {
  const history = useHistory();
  const { categoryId } = useParams<{ categoryId?: string }>();
  const selectedCategory = categoryId ?? null;
  const { t, isRTL } = useLang();
  const ta = t.azkar;
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const { favorites, toggleFavorite } = useAzkarFavorites();
  const myAzkarCat = {
    id: MY_AZKAR_ID,
    title: ta.myAzkarTitle,
    titleEn: ta.myAzkarTitle,
    subtitle: ta.myAzkarSubtitle,
    subtitleEn: ta.myAzkarSubtitle,
    azkar: favoriteAzkar(favorites),
  };

  // One shared player; `playingId` is the zikr currently sounding.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const togglePlay = (zikrId: string) => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (playingId === zikrId) {
      setPlayingId(null);
      return;
    }
    const url = zikrAudioUrl(zikrId);
    if (!url) return;
    const audio = new Audio(url);
    audio.onended = () => setPlayingId((id) => (id === zikrId ? null : id));
    audioRef.current = audio;
    setPlayingId(zikrId);
    audio.play().catch(() => setPlayingId(null));
  };

  // Stop playback when leaving the category or the page.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
    };
  }, [selectedCategory]);

  // Touch tracking for swipe-to-reset (per-item)
  const touchRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // Load persisted state when category changes via URL
  useEffect(() => {
    if (!selectedCategory) {
      setCounters({});
      setCompleted({});
      return;
    }
    const saved = loadCatState(selectedCategory);
    setCounters(saved.counters);
    setCompleted(saved.completed);
  }, [selectedCategory]);

  // Persist on change
  useEffect(() => {
    if (!selectedCategory) return;
    saveCatState(selectedCategory, counters, completed);
  }, [selectedCategory, counters, completed]);

  const handleCategorySelect = (catId: string) => {
    localStorage.removeItem(stateKey(catId));
    history.push(`/azkar/${catId}`);
    window.scrollTo(0, 0);
  };

  const handleCount = (zikrId: string, repeat: number) => {
    const flags = readAzkarFlags();
    setCounters((prev) => {
      const current = (prev[zikrId] || 0) + 1;
      if (current >= repeat) {
        setCompleted((c) => ({ ...c, [zikrId]: true }));
        if (flags.vibrate) haptic("complete");
        // NOTE: sound playback requires an audio asset to ship with the app.
        // When an azkar tick sound file is added, play it here (gated on
        // flags.sound). For now we only vibrate.
        return { ...prev, [zikrId]: 0 };
      }
      if (flags.vibrate) haptic("tick");
      return { ...prev, [zikrId]: current };
    });
  };

  const resetCounter = (zikrId: string) => {
    setCounters((prev) => ({ ...prev, [zikrId]: 0 }));
    setCompleted((prev) => ({ ...prev, [zikrId]: false }));
  };

  // ── Swipe-to-reset handlers ────────────────────────────────────────────────
  // Conservative: require >80px horizontal and horizontal >2.5× vertical so
  // vertical list scrolling isn't hijacked.
  const onItemTouchStart = (zikrId: string) => (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { id: zikrId, x: t.clientX, y: t.clientY };
  };
  const onItemTouchEnd = (zikrId: string) => (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || start.id !== zikrId) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (Math.abs(dx) > 80 && Math.abs(dx) > dy * 2.5) {
      resetCounter(zikrId);
      const flags = readAzkarFlags();
      if (flags.vibrate) haptic("reset");
    }
  };

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selectedCategory) {
    const cat =
      selectedCategory === MY_AZKAR_ID
        ? myAzkarCat
        : azkarData.find((c: any) => c.id === selectedCategory);
    if (!cat) return null;
    const allDone = cat.azkar.length > 0 && cat.azkar.every((z: any) => completed[z.id]);

    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="azkar-page-wrapper">
            {/* Header — standard pattern with centered title */}
            <div className="azkar-header">
              <button
                className="azkar-back-btn"
                onClick={() => history.push("/azkar")}
                aria-label={ta.back}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL
                    ? <path d="M5 12h14M12 5l7 7-7 7" />
                    : <path d="M19 12H5M12 19l-7-7 7-7" />}
                </svg>
              </button>
              <div className="azkar-header-title">
                <h1 lang={isRTL ? "ar" : "en"} dir={isRTL ? "rtl" : "ltr"}>{isRTL ? cat.title : (cat.titleEn ?? cat.title)}</h1>
                <p lang={isRTL ? "ar" : "en"} dir={isRTL ? "rtl" : "ltr"}>{isRTL ? cat.subtitle : (cat.subtitleEn ?? cat.subtitle)}</p>
              </div>
              {allDone
                ? <div className="azkar-all-done">{ta.allDone}</div>
                : <div style={{ width: 44 }} />}
            </div>

            <div className="azkar-container" dir={isRTL ? "rtl" : "ltr"}>
              <div className="azkar-list">
                {cat.azkar.length === 0 && (
                  <p className="azkar-empty">{ta.myAzkarEmpty}</p>
                )}
                {cat.azkar.map((zikr: any, index: number) => {
                  const count = counters[zikr.id] || 0;
                  const isDone = completed[zikr.id];
                  const isFavorite = favorites.includes(zikr.id);
                  const isPlaying = playingId === zikr.id;
                  const progress =
                    zikr.repeat > 1
                      ? (count / zikr.repeat) * 100
                      : isDone
                        ? 100
                        : 0;

                  return (
                    <div
                      key={zikr.id}
                      className={`azkar-item ${isDone ? "completed" : ""}`}
                      onTouchStart={onItemTouchStart(zikr.id)}
                      onTouchEnd={onItemTouchEnd(zikr.id)}
                    >
                      <p className="azkar-item-text" lang="ar">{zikr.text}</p>
                      {zikr.translation && (
                        <p className="azkar-item-translation">{zikr.translation}</p>
                      )}
                      {zikr.repeat > 1 && (
                        <div className="azkar-progress-bar">
                          <div
                            className="azkar-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                      <div className="azkar-item-footer">
                        <span className="azkar-item-num">{index + 1}</span>
                        <button
                          className={`azkar-action-btn ${isFavorite ? "active" : ""}`}
                          onClick={() => toggleFavorite(zikr.id)}
                          aria-label={isFavorite ? ta.unfavorite : ta.favorite}
                          aria-pressed={isFavorite}
                          title={isFavorite ? ta.unfavorite : ta.favorite}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
                          </svg>
                        </button>
                        <button
                          className="azkar-action-btn"
                          onClick={() => resetCounter(zikr.id)}
                          title={ta.resetTitle}
                          aria-label={ta.resetTitle}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                            <path d="M3 3v5h5" />
                          </svg>
                        </button>
                        <button
                          className={`azkar-count-btn ${isDone ? "done" : ""}`}
                          onClick={() => handleCount(zikr.id, zikr.repeat ?? 1)}
                          disabled={isDone}
                        >
                          {isDone ? (
                            ta.done
                          ) : zikr.repeat === 1 ? (
                            ta.doneAlt
                          ) : (
                            <span className="azkar-count-inner">
                              <span className="count-number">{count}</span>
                              <span className="count-slash">/</span>
                              <span className="count-total">{zikr.repeat}</span>
                            </span>
                          )}
                        </button>
                        <button
                          className={`azkar-action-btn ${isPlaying ? "active" : ""}`}
                          onClick={() => togglePlay(zikr.id)}
                          disabled={!zikrAudioUrl(zikr.id)}
                          aria-label={isPlaying ? ta.pause : ta.play}
                          title={isPlaying ? ta.pause : ta.play}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            {isPlaying
                              ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
                              : <path d="M8 5.5v13l10.5-6.5z" />}
                          </svg>
                        </button>
                        <button
                          className="azkar-action-btn"
                          onClick={() => history.push(`/azkar/${selectedCategory}/ref/${zikr.id}`)}
                          aria-label={ta.reference}
                          title={ta.reference}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
                            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="azkar-list-end-spacer" />
            </div>
          </div>
        </IonContent>
        <BottomNavBar active="azkar" fixed />
      </IonPage>
    );
  }

  // ── Category list view ───────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent>
        <div className="azkar-page-wrapper">
          <div className="azkar-container" dir={isRTL ? "rtl" : "ltr"}>
            <div className="azkar-categories">
              {[myAzkarCat, ...azkarData].map((cat: any) => {
                const saved = loadCatState(cat.id);
                const doneCount = cat.azkar.filter((z: any) => saved.completed[z.id]).length;
                const pct = cat.azkar.length > 0 ? Math.round((doneCount / cat.azkar.length) * 100) : 0;
                const isFullyDone = doneCount === cat.azkar.length && cat.azkar.length > 0;
                return (
                  <button
                    key={cat.id}
                    className={"azkar-cat-card" + (isFullyDone ? " azkar-cat-done" : "") + (cat.id === MY_AZKAR_ID ? " azkar-cat-mine" : "")}
                    dir={isRTL ? "rtl" : "ltr"}
                    onClick={() => handleCategorySelect(cat.id)}
                  >
                    <div className="azkar-cat-main">
                      {cat.id === MY_AZKAR_ID && (
                        <div className="azkar-mine-emblem" aria-hidden="true">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
                          </svg>
                        </div>
                      )}
                      <div className="azkar-cat-body">
                        <h2 className="azkar-cat-title" lang={isRTL ? "ar" : "en"}>{isRTL ? cat.title : (cat.titleEn ?? cat.title)}</h2>
                        <p className="azkar-cat-subtitle" lang={isRTL ? "ar" : "en"}>{isRTL ? cat.subtitle : (cat.subtitleEn ?? cat.subtitle)}</p>
                        <div className="azkar-cat-footer">
                          <span className="azkar-cat-count">
                            {cat.azkar.length} {ta.zikr}
                          </span>
                          {pct > 0 && (
                            <span className="azkar-cat-pct">{isFullyDone ? "✓" : `${pct}%`}</span>
                          )}
                        </div>
                      </div>
                      <div className="azkar-cat-arrow" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {isRTL
                            ? <path d="M19 12H5M12 19l-7-7 7-7" />
                            : <path d="M5 12h14M12 5l7 7-7 7" />}
                        </svg>
                      </div>
                    </div>
                    {pct > 0 && (
                      <div className="azkar-cat-progress-bar">
                        <div className="azkar-cat-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="azkar-list-end-spacer" />
          </div>
        </div>
      </IonContent>
      <BottomNavBar active="azkar" fixed />
    </IonPage>
  );
};

export default Azkar;
