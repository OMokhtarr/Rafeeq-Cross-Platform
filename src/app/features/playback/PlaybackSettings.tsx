import React, { useEffect, useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import { usePlayback } from "../../core/context/PlaybackContext";
import {
  type RepeatMode,
  type VerseKey,
} from "../../core/hooks/usePlaybackQueue";
import {
  countCachedAudio,
  clearAllCachedAudio,
  downloadAndCache,
} from "../../core/services/audio/audio-cache.service";
import { fetchRecitations } from "../../core/services/api/quran-api.client";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import "./PlaybackSettings.css";
import {
  getJuzStart,
  getJuzEnd,
  getPageStart,
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
  getHizbStart,
  getHizbEnd,
  getRubStart,
  getRubEnd,
  getRubNumberForPage,
  estimatePageForVerse,
} from "../../core/services/data/metadata.service";

const SETTINGS_KEY = "rafiq_settings_v1";

interface StoredPlaybackPrefs {
  reciter: string;
  playbackRate: number;
  repeatVerse: RepeatMode;
  repeatRange: RepeatMode;
}

const DEFAULT_PREFS: StoredPlaybackPrefs = {
  reciter: "4", // numeric ID of default reciter (Minshawi Murattal)
  playbackRate: 1,
  repeatVerse: 1,
  repeatRange: "loop",
};

function loadPrefs(): StoredPlaybackPrefs {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Migration: if reciter is not a numeric ID, reset to default
      if (typeof s.reciter === "string" && !/^\d+$/.test(s.reciter)) {
        s.reciter = DEFAULT_PREFS.reciter;
      }
      return {
        reciter: s.reciter ?? DEFAULT_PREFS.reciter,
        playbackRate:
          typeof s.playbackRate === "number"
            ? s.playbackRate
            : DEFAULT_PREFS.playbackRate,
        repeatVerse: s.repeatVerse ?? DEFAULT_PREFS.repeatVerse,
        repeatRange: s.repeatRange ?? DEFAULT_PREFS.repeatRange,
      };
    }
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(p: Partial<StoredPlaybackPrefs>) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const base = raw ? JSON.parse(raw) : {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...base, ...p }));
  } catch {}
}

type VerseKeyLocal = VerseKey;

function expandRange(
  start: VerseKeyLocal,
  end: VerseKeyLocal,
): VerseKeyLocal[] {
  const out: VerseKeyLocal[] = [];
  if (
    start.sura > end.sura ||
    (start.sura === end.sura && start.aya > end.aya)
  ) {
    return out;
  }
  const chapters = getChapters();
  const ayahCount = (sura: number) =>
    chapters.find((c) => c.id === sura)?.verses_count ?? 0;
  let s = start.sura;
  let a = start.aya;
  while (s < end.sura || (s === end.sura && a <= end.aya)) {
    out.push({ sura: s, aya: a });
    const max = ayahCount(s);
    if (a >= max) {
      s += 1;
      a = 1;
      if (s > 114) break;
    } else {
      a += 1;
    }
  }
  return out;
}

function pageStart(page: number): VerseKeyLocal {
  const start = getPageStart(page);
  return start ? { sura: start.sura, aya: start.aya } : { sura: 1, aya: 1 };
}

function pageEnd(page: number): VerseKeyLocal {
  if (page >= 604) return { sura: 114, aya: 6 };
  const next = getPageStart(page + 1);
  if (!next) return { sura: 114, aya: 6 };
  if (next.aya > 1) return { sura: next.sura, aya: next.aya - 1 };
  const prevSura = next.sura - 1;
  const ch = getChapters().find((c) => c.id === prevSura);
  return { sura: prevSura, aya: ch ? ch.verses_count : 1 };
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75];

interface SurahDownloadState {
  total: number;
  done: number;
  abortController: AbortController | null;
}

const PlaybackSettings: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const queue = usePlayback();
  const tp = t.playback;

  const nightCls = isNight ? " pb--night" : "";

  const startPageQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 && raw <= 604 ? raw : 1;
  }, [location.search]);

  const [prefs, setPrefs] = useState<StoredPlaybackPrefs>(loadPrefs);
  const [startVerse, setStartVerse] = useState<VerseKeyLocal>(() =>
    pageStart(startPageQuery),
  );
  const [endVerse, setEndVerse] = useState<VerseKeyLocal>(() =>
    pageEnd(startPageQuery),
  );

  const [activeQuick, setActiveQuick] = useState<string | null>(null);

  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [surahDownloads, setSurahDownloads] = useState<
    Record<number, SurahDownloadState>
  >({});

  // ── Dynamic reciters ───────────────────────────────────────────────────────
  const [reciters, setReciters] = useState<{ value: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchRecitations(lang === "ar" ? "ar" : "en")
      .then((list) => {
        if (cancelled) return;
        const options = list.map((r) => ({
          value: String(r.id),
          label: r.translated_name?.name ?? r.reciter_name,
        }));
        setReciters(options);
        // If current reciter is not in the fetched list, fall back to first
        if (
          options.length > 0 &&
          !options.some((o) => o.value === prefs.reciter)
        ) {
          setPrefs((prev) => ({ ...prev, reciter: options[0].value }));
        }
      })
      .catch(() => {
        // Offline: keep whatever is stored
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Sync prefs → queue
  useEffect(() => {
    queue.setReciter(prefs.reciter);
  }, [prefs.reciter, queue]);
  useEffect(() => {
    queue.setPlaybackRate(prefs.playbackRate);
  }, [prefs.playbackRate, queue]);
  useEffect(() => {
    queue.setRepeatVerse(prefs.repeatVerse);
  }, [prefs.repeatVerse, queue]);
  useEffect(() => {
    queue.setRepeatRange(prefs.repeatRange);
  }, [prefs.repeatRange, queue]);

  const updatePref = <K extends keyof StoredPlaybackPrefs>(
    key: K,
    val: StoredPlaybackPrefs[K],
  ) => {
    setPrefs((p) => {
      const next = { ...p, [key]: val };
      savePrefs({ [key]: val } as Partial<StoredPlaybackPrefs>);
      return next;
    });
  };

  const handlePlay = async () => {
    const verses = expandRange(startVerse, endVerse);
    if (verses.length === 0) return;
    const first = verses[0];
    const page = estimatePageForVerse(first.sura, first.aya);
    const verseKey = `${first.sura}:${first.aya}`;
    // Navigate to the viewer at the correct page with the verse highlighted
    history.replace(`/viewer?page=${page}&v=${encodeURIComponent(verseKey)}`);
    await queue.start(verses);
  };

  const currentPage = startPageQuery;
  const currentSura = getPageStart(currentPage)?.sura ?? 1;
  const currentJuz = Math.ceil(currentPage / 20);
  const currentHizb = Math.ceil(currentPage / 10);
  const currentRub = useMemo(
    () => getRubNumberForPage(currentPage),
    [currentPage],
  );

  const setRangeToPage = (p: number) => {
    setStartVerse(pageStart(p));
    setEndVerse(pageEnd(p));
    setActiveQuick("page");
  };
  const setRangeFromPage = (p: number) => {
    setStartVerse(pageStart(p));
    setEndVerse(pageEnd(604));
    setActiveQuick("fromPage");
  };
  const setRangeToSurah = (s: number) => {
    const ch = getChapters().find((c) => c.id === s);
    setStartVerse({ sura: s, aya: 1 });
    setEndVerse({ sura: s, aya: ch ? ch.verses_count : 1 });
    setActiveQuick("surah");
  };
  const setRangeToJuz = (j: number) => {
    setStartVerse(getJuzStart(j));
    setEndVerse(getJuzEnd(j));
    setActiveQuick("juz");
  };
  const setRangeToHizb = (h: number) => {
    if (h < 1 || h > 60) return;
    setStartVerse(getHizbStart(h));
    setEndVerse(getHizbEnd(h));
    setActiveQuick("hizb");
  };
  const setRangeToRub = (r: number) => {
    if (r < 1 || r > 240) return;
    setStartVerse(getRubStart(r));
    setEndVerse(getRubEnd(r));
    setActiveQuick("rub");
  };
  const setRangeToAll = () => {
    setStartVerse({ sura: 1, aya: 1 });
    setEndVerse({ sura: 114, aya: 6 });
    setActiveQuick("all");
  };

  // ── Downloads ──────────────────────────────────────────────────────────────
  const surahOptions = useMemo(
    () =>
      getChapters().map((c) => ({
        value: c.id,
        label: `${lang === "ar" ? c.name_arabic : c.translated_name?.name} (${
          c.id
        })`,
        versesCount: c.verses_count as number,
      })),
    [lang],
  );

  const startSurahDownload = async (sura: number, versesCount: number) => {
    if (surahDownloads[sura]?.abortController) return;
    const ctrl = new AbortController();
    setSurahDownloads((prev) => ({
      ...prev,
      [sura]: { total: versesCount, done: 0, abortController: ctrl },
    }));
    for (let aya = 1; aya <= versesCount; aya++) {
      if (ctrl.signal.aborted) break;
      try {
        await downloadAndCache(prefs.reciter, sura, aya, ctrl.signal);
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }
      setSurahDownloads((prev) => {
        const cur = prev[sura];
        if (!cur) return prev;
        return { ...prev, [sura]: { ...cur, done: aya } };
      });
    }
    setSurahDownloads((prev) => {
      const next = { ...prev };
      delete next[sura]?.abortController;
      return next;
    });
  };

  const cancelSurahDownload = (sura: number) => {
    surahDownloads[sura]?.abortController?.abort();
    setSurahDownloads((prev) => {
      const next = { ...prev };
      delete next[sura];
      return next;
    });
  };

  const handleClearCache = async () => {
    await clearAllCachedAudio();
    setSurahDownloads({});
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const surahPickerOptions = useMemo(
    () =>
      getChapters().map((c) => ({
        value: c.id,
        label: `${lang === "ar" ? c.name_arabic : c.translated_name?.name} (${
          c.id
        })`,
      })),
    [lang],
  );

  const renderVersePicker = (
    value: VerseKeyLocal,
    onChange: (v: VerseKeyLocal) => void,
  ) => {
    const maxAyah =
      getChapters().find((c) => c.id === value.sura)?.verses_count ?? 1;
    return (
      <div className={`pb-verse-picker${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
        <select
          className={`pb-select${nightCls}`}
          value={value.sura}
          onChange={(e) => {
            setActiveQuick(null);
            onChange({ sura: parseInt(e.target.value, 10), aya: 1 });
          }}
        >
          {surahPickerOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="pb-verse-sep">:</span>
        <input
          type="number"
          className={`pb-aya-input${nightCls}`}
          min={1}
          max={maxAyah}
          value={value.aya}
          onChange={(e) => {
            const aya = Math.max(
              1,
              Math.min(maxAyah, parseInt(e.target.value, 10) || 1),
            );
            setActiveQuick(null);
            onChange({ sura: value.sura, aya });
          }}
        />
      </div>
    );
  };

  const renderSpeedRow = () => (
    <div className={`pb-segmented pb-segmented--two-col${nightCls}`}>
      {SPEED_OPTIONS.map((sp) => (
        <button
          key={sp}
          type="button"
          className={
            `pb-seg-btn${nightCls}` +
            (prefs.playbackRate === sp ? " is-active" : "")
          }
          onClick={() => updatePref("playbackRate", sp)}
        >
          {sp}x{sp === 1 ? ` (${tp.speedDefault})` : ""}
        </button>
      ))}
    </div>
  );

  const renderRepeatRow = (
    value: RepeatMode,
    onChange: (m: RepeatMode) => void,
  ) => {
    const choices: RepeatMode[] = [1, 2, 3, "loop"];
    return (
      <div className={`pb-segmented${nightCls}`}>
        {choices.map((c) => (
          <button
            key={String(c)}
            type="button"
            className={
              `pb-seg-btn${nightCls}` + (value === c ? " is-active" : "")
            }
            onClick={() => onChange(c)}
          >
            {c === "loop" ? tp.loop : tp.times(c as number)}
          </button>
        ))}
      </div>
    );
  };

  const playingLabel = queue.state.currentVerse
    ? `${tp.nowPlaying}: ${queue.state.currentVerse}`
    : null;
  const ctaLabel = queue.state.isPlaying
    ? tp.pause
    : queue.state.currentVerse
    ? tp.resume
    : tp.playAudio;
  const handleCta = queue.state.isPlaying
    ? () => queue.pause()
    : queue.state.currentVerse
    ? () => queue.resume()
    : handlePlay;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className={`pb-page${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
          <header className={`pb-header${nightCls}`}>
            <button
              type="button"
              className={`pb-close${nightCls}`}
              onClick={() => history.goBack()}
              aria-label={tp.closeLabel}
            >
              ✕
            </button>
            <h1 className="pb-title">{tp.title}</h1>
            <span className="pb-header-spacer" />
          </header>

          <div className="pb-body">
            {playingLabel && (
              <div className={`pb-now-playing${nightCls}`}>
                <span>{playingLabel}</span>
                <button
                  type="button"
                  className="pb-mini-btn"
                  onClick={() =>
                    queue.state.isPlaying ? queue.pause() : queue.resume()
                  }
                >
                  {queue.state.isPlaying ? tp.pause : tp.resume}
                </button>
              </div>
            )}

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>
                {tp.selectRange}
              </h2>
              <div className={`pb-card${nightCls}`}>
                <div className="pb-row">
                  <label className={`pb-row-label${nightCls}`}>
                    {tp.startingVerse}
                  </label>
                  {renderVersePicker(startVerse, setStartVerse)}
                </div>
                <div className="pb-row">
                  <label className={`pb-row-label${nightCls}`}>
                    {tp.endingVerse}
                  </label>
                  {renderVersePicker(endVerse, setEndVerse)}
                </div>
              </div>
            </section>

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>{tp.reciter}</h2>
              <div className={`pb-card${nightCls}`}>
                <select
                  className={`pb-select pb-select-full${nightCls}`}
                  value={prefs.reciter}
                  onChange={(e) => updatePref("reciter", e.target.value)}
                >
                  {reciters.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`pb-link-row${nightCls}`}
                  onClick={() => setDownloadsOpen(true)}
                >
                  <span>{tp.manageDownloads}</span>
                  <span className="pb-link-chev">{isRTL ? "‹" : "›"}</span>
                </button>
              </div>
            </section>

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>{tp.playSpeed}</h2>
              {renderSpeedRow()}
            </section>

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>
                {tp.playEachVerse}
              </h2>
              {renderRepeatRow(prefs.repeatVerse, (m) =>
                updatePref("repeatVerse", m),
              )}
            </section>

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>
                {tp.playTheRange}
              </h2>
              {renderRepeatRow(prefs.repeatRange, (m) =>
                updatePref("repeatRange", m),
              )}
            </section>

            <section className="pb-section">
              <h2 className={`pb-section-title${nightCls}`}>
                {tp.quickSelect}
              </h2>
              <div className={`pb-segmented pb-segmented--two-col${nightCls}`}>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "page" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeToPage(currentPage)}
                >
                  {tp.quickPage(String(currentPage))}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "fromPage" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeFromPage(currentPage)}
                >
                  {tp.quickFromPage(String(currentPage))}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "surah" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeToSurah(currentSura)}
                >
                  {tp.quickSurah(
                    lang === "ar"
                      ? getSurahNameArabic(currentSura)
                      : getSurahNameEnglish(currentSura),
                  )}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "juz" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeToJuz(currentJuz)}
                >
                  {tp.quickJuz(String(currentJuz))}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "hizb" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeToHizb(currentHizb)}
                >
                  {tp.quickHizb(String(currentHizb))}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "rub" ? " is-active" : ""
                  }`}
                  onClick={() => setRangeToRub(currentRub)}
                >
                  {lang === "ar"
                    ? `ربع ${toHindiNumbers(currentRub)}`
                    : `Rub‛ ${currentRub}`}
                </button>
                <button
                  className={`pb-seg-btn${nightCls}${
                    activeQuick === "all" ? " is-active" : ""
                  }`}
                  onClick={setRangeToAll}
                >
                  {tp.quickAll}
                </button>
              </div>
            </section>

            <button
              type="button"
              className="pb-cta"
              onClick={handleCta}
              disabled={queue.state.isLoading}
            >
              {ctaLabel}
            </button>
          </div>

          {/* ── Downloads sub‑panel ── */}
          {downloadsOpen && (
            <div
              className={`pb-downloads-overlay${nightCls}`}
              role="dialog"
              aria-label={tp.downloadsTitle}
            >
              <header className={`pb-header${nightCls}`}>
                <button
                  type="button"
                  className={`pb-close${nightCls}`}
                  onClick={() => setDownloadsOpen(false)}
                  aria-label={tp.closeLabel}
                >
                  ✕
                </button>
                <h1 className="pb-title">{tp.downloadsTitle}</h1>
                <span className="pb-header-spacer" />
              </header>
              <div className="pb-body">
                <div className={`pb-card${nightCls}`}>
                  <p className={`pb-row-label${nightCls}`}>
                    {lang === "ar"
                      ? "اختر السور للتحميل:"
                      : "Select Surahs to download:"}
                  </p>
                </div>
                <div className={`pb-surah-list${nightCls}`}>
                  {surahOptions.map((sura) => {
                    const state = surahDownloads[sura.value];
                    const isDownloading = !!state?.abortController;
                    const progress = state
                      ? Math.round((state.done / state.total) * 100)
                      : 0;
                    return (
                      <div
                        key={sura.value}
                        className={`pb-surah-row${nightCls}`}
                      >
                        <div className="pb-surah-info">
                          <span className="pb-surah-name">{sura.label}</span>
                          <span className="pb-surah-count">
                            (
                            {lang === "ar"
                              ? toHindiNumbers(sura.versesCount)
                              : sura.versesCount}{" "}
                            {lang === "ar" ? "آية" : "verses"})
                          </span>
                        </div>
                        <div className="pb-surah-actions">
                          {isDownloading ? (
                            <>
                              <div className="pb-progress pb-surah-progress">
                                <div
                                  className="pb-progress-fill"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="pb-surah-progress-text">
                                {state?.done ?? 0}/{state?.total ?? 0}
                              </span>
                              <button
                                type="button"
                                className={`pb-mini-btn pb-mini-btn-warn${nightCls}`}
                                onClick={() => cancelSurahDownload(sura.value)}
                              >
                                {tp.downloadCancel}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={`pb-mini-btn${nightCls}`}
                              onClick={() =>
                                startSurahDownload(sura.value, sura.versesCount)
                              }
                            >
                              {tp.downloadStart}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={`pb-cta pb-cta-ghost${nightCls}`}
                  onClick={handleClearCache}
                  disabled={Object.keys(surahDownloads).length === 0}
                >
                  {tp.downloadClear}
                </button>
              </div>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PlaybackSettings;
