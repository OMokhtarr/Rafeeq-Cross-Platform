/**
 * AZKAR PAGE
 * UI updated to match the Electron app's card structure:
 *  - Category cards: .azkar-cat-card with color accent + arrow
 *  - Detail items:   .azkar-item with number badge, source, translation support
 *  - Counter / progress / reset logic preserved
 *  - Per-category counter state persisted to localStorage
 *  - Haptic feedback via Web Vibration API (gated by settings.azkarVibration)
 *  - Horizontal swipe on an item resets its counter
 */

import React, { useState, useEffect, useRef } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import azkarData from "../../../data/azkarData";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
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
  const { t, isRTL } = useLang();
  const ta = t.azkar;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  // Touch tracking for swipe-to-reset (per-item)
  const touchRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // Persist on change
  useEffect(() => {
    if (!selectedCategory) return;
    saveCatState(selectedCategory, counters, completed);
  }, [selectedCategory, counters, completed]);

  const handleCategorySelect = (catId: string) => {
    localStorage.removeItem(stateKey(catId));
    setCounters({});
    setCompleted({});
    setSelectedCategory(catId);
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
    const cat = azkarData.find((c: any) => c.id === selectedCategory);
    if (!cat) return null;
    const allDone = cat.azkar.every((z: any) => completed[z.id]);

    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="azkar-page-wrapper">
            <div className="azkar-container" dir={isRTL ? "rtl" : "ltr"}>
              {/* Sticky header */}
              <div
                className="azkar-header"
                style={{ "--cat-color": cat.color } as React.CSSProperties}
              >
                <button
                  className="azkar-back-btn"
                  onClick={() => setSelectedCategory(null)}
                >
                  {ta.back}
                </button>
                <div className="azkar-header-title">
                  <div>
                    <h1 lang="ar" dir="rtl">
                      {cat.title}
                    </h1>
                    <p lang="ar" dir="rtl">
                      {cat.subtitle}
                    </p>
                  </div>
                </div>
                {allDone && <div className="azkar-all-done">{ta.allDone}</div>}
              </div>

              {/* Items list */}
              <div className="azkar-list">
                {cat.azkar.map((zikr: any, index: number) => {
                  const count = counters[zikr.id] || 0;
                  const isDone = completed[zikr.id];
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
                      style={
                        { "--cat-color": cat.color } as React.CSSProperties
                      }
                      onTouchStart={onItemTouchStart(zikr.id)}
                      onTouchEnd={onItemTouchEnd(zikr.id)}
                    >
                      {/* Item header: number badge + source */}
                      <div className="azkar-item-header">
                        <span className="azkar-item-num">{index + 1}</span>
                        {zikr.source && (
                          <span className="azkar-item-source">
                            {zikr.source}
                          </span>
                        )}
                      </div>

                      {/* Optional note */}
                      {zikr.note && (
                        <div className="azkar-note">{zikr.note}</div>
                      )}

                      {/* Main Arabic text */}
                      <p className="azkar-item-text" lang="ar">
                        {zikr.text}
                      </p>

                      {/* Optional translation */}
                      {zikr.translation && (
                        <p className="azkar-item-translation">
                          {zikr.translation}
                        </p>
                      )}

                      {/* Progress bar for multi-repeat */}
                      {zikr.repeat > 1 && (
                        <div className="azkar-progress-bar">
                          <div
                            className="azkar-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}

                      {/* Footer: counter + reset */}
                      <div className="azkar-item-footer">
                        {zikr.repeat > 1 && !isDone && (
                          <span className="azkar-repeat-label">
                            {count} / {zikr.repeat}
                          </span>
                        )}
                        <div className="azkar-counter">
                          <button
                            className={`azkar-count-btn ${isDone ? "done" : ""}`}
                            onClick={() =>
                              handleCount(zikr.id, zikr.repeat ?? 1)
                            }
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
                                <span className="count-total">
                                  {zikr.repeat}
                                </span>
                              </span>
                            )}
                          </button>
                          <button
                            className="azkar-reset-btn"
                            onClick={() => resetCounter(zikr.id)}
                            title={ta.resetTitle}
                            aria-label={ta.resetTitle}
                          >
                            {ta.reset}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="azkar-footer-nav">
                <button
                  className="azkar-back-bottom"
                  onClick={() => setSelectedCategory(null)}
                >
                  {ta.backToCategories}
                </button>
              </div>
            </div>
            <BottomNavBar active="azkar" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // ── Category list view ───────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="azkar-page-wrapper">
          <div className="azkar-container" dir={isRTL ? "rtl" : "ltr"}>
            <div className="azkar-categories">
              {azkarData.map((cat: any) => (
                <button
                  key={cat.id}
                  className="azkar-cat-card"
                  style={{ "--cat-color": cat.color } as React.CSSProperties}
                  onClick={() => handleCategorySelect(cat.id)}
                >
                  <div className="azkar-cat-body">
                    <h2 className="azkar-cat-title" lang="ar" dir="rtl">
                      {cat.title}
                    </h2>
                    <p className="azkar-cat-subtitle" lang="ar" dir="rtl">
                      {cat.subtitle}
                    </p>
                    <span className="azkar-cat-count">
                      {cat.azkar.length} {ta.zikr}
                    </span>
                  </div>
                  <span className="azkar-cat-arrow">{isRTL ? "←" : "→"}</span>
                </button>
              ))}
            </div>
          </div>
          <BottomNavBar active="azkar" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Azkar;
