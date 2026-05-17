import React, { useCallback, useEffect, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { usePlayback } from "../../core/context/PlaybackContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  getLocalBookmarkedVerseKeys,
  removeLocalBookmark,
} from "../../core/services/api/user-api.client";
import {
  getRecitationHistory,
  deleteRecitationSession,
  type RecitationSession,
} from "../../core/services/storage/recitation-history.service";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
  estimatePageForVerse,
} from "../../core/services/data/metadata.service";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import "./Bookmarks.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number, lang: string): string {
  if (seconds < 60) {
    const s = Math.round(seconds);
    return lang === "ar" ? `${toHindiNumbers(s)} ث` : `${s}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (lang === "ar") {
    return s > 0
      ? `${toHindiNumbers(m)} د ${toHindiNumbers(s)} ث`
      : `${toHindiNumbers(m)} دقيقة`;
  }
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatRecordedAt(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function verseKeyToPageAndName(
  verseKey: string,
  lang: string,
): { sura: number; aya: number; surahName: string; page: number } {
  const [suraStr, ayaStr] = verseKey.split(":");
  const sura = parseInt(suraStr, 10) || 1;
  const aya = parseInt(ayaStr, 10) || 1;
  const surahName =
    lang === "ar" ? getSurahNameArabic(sura) : getSurahNameEnglish(sura);
  const page = estimatePageForVerse(sura, aya);
  return { sura, aya, surahName, page };
}

const RECITER_LABELS: Record<string, { ar: string; en: string }> = {
  husary: { ar: "الحصري", en: "Al-Husary" },
  "minshawi-murattal": { ar: "المنشاوي — مرتل", en: "Al-Minshawi (Murattal)" },
  minshawi: { ar: "المنشاوي — مجود", en: "Al-Minshawi (Mujawwad)" },
  sudais: { ar: "السديس", en: "Al-Sudais" },
  afasy: { ar: "العفاسي", en: "Al-Afasy" },
  ghamdi: { ar: "الغامدي", en: "Al-Ghamdi" },
};

function reciterLabel(slug: string, lang: string): string {
  const entry = RECITER_LABELS[slug];
  if (!entry) return slug;
  return lang === "ar" ? entry.ar : entry.en;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Bookmarks: React.FC = () => {
  const history = useHistory();
  const { lang, isRTL } = useLang();
  const { resumeSession } = usePlayback();

  const [bookmarkedKeys, setBookmarkedKeys] = useState<string[]>([]);
  const [sessions, setSessions] = useState<RecitationSession[]>([]);
  const [activeTab, setActiveTab] = useState<"verses" | "sessions">("verses");

  const reload = useCallback(() => {
    setBookmarkedKeys(getLocalBookmarkedVerseKeys().reverse());
    setSessions(getRecitationHistory());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Bookmark removal ──
  const handleRemoveBookmark = useCallback(
    (verseKey: string) => {
      removeLocalBookmark(verseKey);
      reload();
    },
    [reload],
  );

  // ── Session removal ──
  const handleRemoveSession = useCallback(
    (id: string) => {
      deleteRecitationSession(id);
      reload();
    },
    [reload],
  );

  // ── Resume recitation session ──
  const handleResume = useCallback(
    async (session: RecitationSession) => {
      if (!session.queue || session.queue.length === 0) {
        const { page } = verseKeyToPageAndName(session.verseKey, lang);
        history.push(
          `/viewer?page=${page}&v=${encodeURIComponent(session.verseKey)}`,
        );
        return;
      }
      try {
        await resumeSession({
          queue: session.queue,
          verseKey: session.verseKey,
          elapsedSeconds: session.elapsedSeconds,
          reciter: session.reciter,
        });
        const { page } = verseKeyToPageAndName(session.verseKey, lang);
        history.push(
          `/viewer?page=${page}&v=${encodeURIComponent(session.verseKey)}`,
        );
      } catch {
        const { page } = verseKeyToPageAndName(session.verseKey, lang);
        history.push(
          `/viewer?page=${page}&v=${encodeURIComponent(session.verseKey)}`,
        );
      }
    },
    [resumeSession, history, lang],
  );

  const goToVerse = (verseKey: string) => {
    const { page } = verseKeyToPageAndName(verseKey, lang);
    history.push(`/viewer?page=${page}&v=${verseKey}`);
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="bm-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* Header */}
          <header className="bm-header">
            <button
              className="bm-back"
              onClick={() =>
                history.length > 1
                  ? history.goBack()
                  : history.replace("/viewer")
              }
              aria-label={lang === "ar" ? "رجوع" : "Back"}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {isRTL ? (
                  <path d="M5 12h14M13 5l7 7-7 7" />
                ) : (
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                )}
              </svg>
            </button>

            <div className="bm-header-titles">
              <h1 className="bm-title">
                {lang === "ar" ? "المحفوظات" : "Bookmarks"}
              </h1>
              <p className="bm-subtitle">
                {lang === "ar"
                  ? "الآيات المحفوظة وجلسات التلاوة"
                  : "Saved verses & recitation sessions"}
              </p>
            </div>

            <div
              className="bm-back"
              aria-hidden
              style={{ visibility: "hidden" }}
            />
          </header>

          {/* Tabs */}
          <div className="bm-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "verses"}
              className={`bm-tab ${
                activeTab === "verses" ? "bm-tab--active" : ""
              }`}
              onClick={() => setActiveTab("verses")}
            >
              {lang === "ar" ? "الآيات" : "Verses"}
              {bookmarkedKeys.length > 0 && (
                <span className="bm-tab-count">{bookmarkedKeys.length}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "sessions"}
              className={`bm-tab ${
                activeTab === "sessions" ? "bm-tab--active" : ""
              }`}
              onClick={() => setActiveTab("sessions")}
            >
              {lang === "ar" ? "جلسات التلاوة" : "Recitation Sessions"}
              {sessions.length > 0 && (
                <span className="bm-tab-count">{sessions.length}</span>
              )}
            </button>
          </div>

          <div className="bm-body">
            {/* Verses Tab */}
            {activeTab === "verses" && (
              <section className="bm-section">
                <div className="bm-section-header">
                  <span className="bm-section-icon">🔖</span>
                  <h2 className="bm-section-title">
                    {lang === "ar" ? "الآيات المحفوظة" : "Saved Verses"}
                  </h2>
                  <span className="bm-section-count">
                    {bookmarkedKeys.length}
                  </span>
                </div>

                {bookmarkedKeys.length === 0 ? (
                  <div className="bm-empty">
                    <span>📖</span>
                    <p>
                      {lang === "ar"
                        ? "لا توجد آيات محفوظة بعد — اضغط على أيقونة الإشارة المرجعية في قارئ المصحف"
                        : "No saved verses yet — tap the bookmark icon in the Quran viewer"}
                    </p>
                  </div>
                ) : (
                  <ul className="bm-list">
                    {bookmarkedKeys.map((vk) => {
                      const { sura, aya, surahName, page } =
                        verseKeyToPageAndName(vk, lang);
                      return (
                        <li key={vk} className="bm-row">
                          <button
                            className="bm-row-main"
                            onClick={() => goToVerse(vk)}
                          >
                            <div className="bm-row-icon bm-row-icon--verse">
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                stroke="none"
                              >
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                              </svg>
                            </div>
                            <div className="bm-row-info">
                              <span
                                className="bm-row-primary"
                                lang={lang === "ar" ? "ar" : undefined}
                              >
                                {surahName}
                              </span>
                              <span className="bm-row-secondary">
                                {lang === "ar"
                                  ? `آية ${toHindiNumbers(
                                      aya,
                                    )} • صفحة ${toHindiNumbers(page)}`
                                  : `Verse ${aya} • Page ${page}`}
                              </span>
                            </div>
                            <svg
                              className="bm-row-chevron"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              {isRTL ? (
                                <path d="M15 18l-6-6 6-6" />
                              ) : (
                                <path d="M9 18l6-6-6-6" />
                              )}
                            </svg>
                          </button>
                          <button
                            className="bm-row-delete"
                            onClick={() => handleRemoveBookmark(vk)}
                            aria-label={lang === "ar" ? "حذف" : "Remove"}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {/* Sessions Tab */}
            {activeTab === "sessions" && (
              <section className="bm-section">
                <div className="bm-section-header">
                  <span className="bm-section-icon">🎙️</span>
                  <h2 className="bm-section-title">
                    {lang === "ar"
                      ? "آخر جلسات التلاوة"
                      : "Recent Recitation Sessions"}
                  </h2>
                  <span className="bm-section-count">{sessions.length}</span>
                </div>

                {sessions.length === 0 ? (
                  <div className="bm-empty">
                    <span>🎵</span>
                    <p>
                      {lang === "ar"
                        ? "لا توجد جلسات تلاوة بعد — ابدأ الاستماع من قارئ المصحف"
                        : "No recitation sessions yet — start listening from the Quran viewer"}
                    </p>
                  </div>
                ) : (
                  <ul className="bm-list">
                    {sessions.map((session) => {
                      const { sura, aya, surahName, page } =
                        verseKeyToPageAndName(session.verseKey, lang);
                      return (
                        <li key={session.id} className="bm-row">
                          <button
                            className="bm-row-main"
                            onClick={() => handleResume(session)}
                          >
                            <div className="bm-row-icon bm-row-icon--session">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon
                                  points="5 3 19 12 5 21 5 3"
                                  fill="currentColor"
                                  stroke="none"
                                />
                              </svg>
                            </div>
                            <div className="bm-row-info">
                              <span
                                className="bm-row-primary"
                                lang={lang === "ar" ? "ar" : undefined}
                              >
                                {surahName}
                              </span>
                              <span className="bm-row-secondary">
                                {lang === "ar"
                                  ? `آية ${toHindiNumbers(
                                      aya,
                                    )} • ${formatElapsed(
                                      session.elapsedSeconds,
                                      lang,
                                    )}`
                                  : `Verse ${aya} • ${formatElapsed(
                                      session.elapsedSeconds,
                                      lang,
                                    )}`}
                              </span>
                              <span className="bm-row-meta">
                                {reciterLabel(session.reciter, lang)}
                                {" · "}
                                {formatRecordedAt(session.recordedAt, lang)}
                              </span>
                            </div>
                            <svg
                              className="bm-row-chevron"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              {isRTL ? (
                                <path d="M15 18l-6-6 6-6" />
                              ) : (
                                <path d="M9 18l6-6-6-6" />
                              )}
                            </svg>
                          </button>
                          <button
                            className="bm-row-delete"
                            onClick={() => handleRemoveSession(session.id)}
                            aria-label={lang === "ar" ? "حذف" : "Remove"}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>

          <BottomNavBar active="quran" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Bookmarks;
