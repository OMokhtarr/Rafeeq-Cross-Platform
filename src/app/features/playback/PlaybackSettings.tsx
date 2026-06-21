import React, { useEffect, useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import { usePlayback } from "../../core/context/PlaybackContext";
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import {
  type RepeatMode,
  type VerseKey,
} from "../../core/hooks/usePlaybackQueue";
import {
  countCachedAudio,
  clearAllCachedAudio,
  downloadAndCache,
  getCachedCountsPerSurah,
} from "../../core/services/audio/audio-cache.service";
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
import { fetchRecitations } from "../../core/services/api/quran-api.client";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import "./PlaybackSettings.css";

const SETTINGS_KEY = "rafiq_settings_v1";

interface StoredPlaybackPrefs {
  reciter: string;
  playbackRate: number;
  repeatVerse: RepeatMode;
  repeatRange: RepeatMode;
}

const DEFAULT_PREFS: StoredPlaybackPrefs = {
  reciter: "4",
  playbackRate: 1,
  repeatVerse: 1,
  repeatRange: "loop",
};

function loadPrefs(): StoredPlaybackPrefs {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
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

interface Props {
  onClose?: () => void;
  currentPage?: number;
}

const PlaybackSettings: React.FC<Props> = ({ onClose, currentPage: currentPageProp }) => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const queue = usePlayback();
  const tp = t.playback;

  const nightCls = "";

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
  const [cachedCounts, setCachedCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!downloadsOpen) return;
    getCachedCountsPerSurah(prefs.reciter).then(setCachedCounts).catch(() => {});
  }, [downloadsOpen, prefs.reciter]);

  // Dynamic reciters
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
        if (
          options.length > 0 &&
          !options.some((o) => o.value === prefs.reciter)
        ) {
          setPrefs((prev) => ({ ...prev, reciter: options[0].value }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang]);

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
    history.replace(`/viewer?page=${page}&v=${encodeURIComponent(verseKey)}`);
    await queue.start(verses);
    onClose?.();
  };

  const currentPage = currentPageProp ?? startPageQuery;
  const currentJuz = Math.ceil(currentPage / 20);
  const currentHizb = Math.ceil(currentPage / 10);
  const currentRub = useMemo(
    () => getRubNumberForPage(currentPage),
    [currentPage],
  );

  // All surahs that start on (or continue from) the current page
  const surahsOnPage = useMemo(() => {
    const start = getPageStart(currentPage);
    if (!start) return [1];
    const surahs: number[] = [start.sura];
    if (currentPage >= 604) return surahs;
    const nextStart = getPageStart(currentPage + 1);
    if (!nextStart || nextStart.sura === start.sura) return surahs;
    // Any surah between start.sura+1 and nextStart.sura-1 is fully contained on this page.
    // nextStart.sura is on this page only if it starts mid-page (aya > 1).
    for (let s = start.sura + 1; s < nextStart.sura; s++) {
      surahs.push(s);
    }
    if (nextStart.aya > 1) {
      surahs.push(nextStart.sura);
    }
    return surahs;
  }, [currentPage]);

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

  // Downloads
  const surahOptions = useMemo(
    () =>
      getChapters().map((c) => ({
        value: c.id,
        label: `${lang === "ar" ? c.name_arabic : (c.name_simple ?? c.translated_name?.name)} (${
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
    getCachedCountsPerSurah(prefs.reciter).then(setCachedCounts).catch(() => {});
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
    setCachedCounts({});
  };

  const surahPickerOptions = useMemo(
    () =>
      getChapters().map((c) => ({
        value: c.id,
        label: `${lang === "ar" ? c.name_arabic : (c.name_simple ?? c.translated_name?.name)} (${
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
    const ayaOptions = Array.from({ length: maxAyah }, (_, i) => i + 1);

    return (
      <div className={`pb-verse-picker${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
        <InlineSelect
          value={String(value.sura)}
          options={surahPickerOptions.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => {
            setActiveQuick(null);
            onChange({ sura: parseInt(v, 10), aya: 1 });
          }}
          night={isNight}
        />
        <span className="pb-verse-sep">:</span>
        <InlineSelect
          value={String(value.aya)}
          options={ayaOptions.map((aya) => ({
            value: String(aya),
            label: lang === "ar" ? toHindiNumbers(aya) : String(aya),
          }))}
          onChange={(v) => {
            setActiveQuick(null);
            onChange({ sura: value.sura, aya: parseInt(v, 10) || 1 });
          }}
          night={isNight}
        />
      </div>
    );
  };

  const renderSpeedBtns = () => (
    <div className="pb-segmented pb-segmented--inline">
      {SPEED_OPTIONS.map((sp) => (
        <button
          key={sp}
          type="button"
          className={"pb-seg-btn" + (prefs.playbackRate === sp ? " is-active" : "")}
          onClick={() => updatePref("playbackRate", sp)}
        >
          {sp}x
        </button>
      ))}
    </div>
  );

  const renderRepeatBtns = (
    value: RepeatMode,
    onChange: (m: RepeatMode) => void,
  ) => {
    const choices: RepeatMode[] = [1, 2, 3, "loop"];
    return (
      <div className="pb-segmented pb-segmented--inline">
        {choices.map((c) => (
          <button
            key={String(c)}
            type="button"
            className={"pb-seg-btn" + (value === c ? " is-active" : "")}
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
    ? () => { queue.pause(); }
    : queue.state.currentVerse
    ? () => { queue.resume(); onClose?.(); }
    : handlePlay;

  // Main settings or downloads overlay
  const content = downloadsOpen ? (
    // Downloads overlay (replaces main content)
    <div className={`pb-page${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
      <header className="pb-header">
        <button
          type="button"
          className="pb-back-btn"
          onClick={() => setDownloadsOpen(false)}
          aria-label={tp.closeLabel}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isRTL ? <path d="M5 12h14M13 5l7 7-7 7" /> : <path d="M19 12H5M12 5l-7 7 7 7" />}
          </svg>
        </button>
        <h1 className="pb-title">{tp.downloadsTitle}</h1>
        <span className="pb-header-spacer" />
      </header>
      <div className="pb-body pb-body--downloads">
        <div className="pb-surah-list">
          {surahOptions.map((sura) => {
            const state = surahDownloads[sura.value];
            const isDownloading = !!state?.abortController;
            const progress = state
              ? Math.round((state.done / state.total) * 100)
              : 0;
            const cachedCount = cachedCounts[sura.value] ?? 0;
            const isFullyCached = cachedCount >= sura.versesCount;
            return (
              <div key={sura.value} className={`pb-surah-row${nightCls}`}>
                <div className="pb-surah-info">
                  <span className="pb-surah-name">{sura.label}</span>
                  <span className="pb-surah-count">
                    (
                    {lang === "ar"
                      ? toHindiNumbers(sura.versesCount)
                      : sura.versesCount}{" "}
                    {lang === "ar" ? "آية" : "verses"})
                  </span>
                  {!isDownloading && cachedCount > 0 && (
                    <span className={`pb-cached-badge${isFullyCached ? " pb-cached-badge--full" : ""}${nightCls}`}>
                      {lang === "ar"
                        ? `${toHindiNumbers(cachedCount)}/${toHindiNumbers(sura.versesCount)} محفوظ`
                        : `${cachedCount}/${sura.versesCount} cached`}
                    </span>
                  )}
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
                      className={`pb-mini-btn${isFullyCached ? " pb-mini-btn--done" : ""}${nightCls}`}
                      onClick={() =>
                        startSurahDownload(sura.value, sura.versesCount)
                      }
                    >
                      {isFullyCached ? tp.downloadRedownload : tp.downloadStart}
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
  ) : (
    // Main settings
    <div className={`pb-page${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
      <header className="pb-header">
        <button
          type="button"
          className="pb-close"
          onClick={() => (onClose ? onClose() : history.goBack())}
          aria-label={tp.closeLabel}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
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
          <h2 className={`pb-section-title${nightCls}`}>{tp.selectRange}</h2>
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
            <InlineSelect
              value={prefs.reciter}
              options={reciters}
              onChange={(v) => updatePref("reciter", v)}
              night={isNight}
              fullWidth
            />
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
          <h2 className="pb-section-title">{tp.playSpeed} / {tp.playEachVerse} / {tp.playTheRange}</h2>
          <div className="pb-card pb-card--controls">
            <div className="pb-ctrl-row">
              <span className="pb-ctrl-label">{tp.playSpeed}</span>
              {renderSpeedBtns()}
            </div>
            <div className="pb-ctrl-row">
              <span className="pb-ctrl-label">{tp.playEachVerse}</span>
              {renderRepeatBtns(prefs.repeatVerse, (m) => updatePref("repeatVerse", m))}
            </div>
            <div className="pb-ctrl-row">
              <span className="pb-ctrl-label">{tp.playTheRange}</span>
              {renderRepeatBtns(prefs.repeatRange, (m) => updatePref("repeatRange", m))}
            </div>
          </div>
        </section>

        <section className="pb-section">
          <h2 className="pb-section-title">{tp.quickSelect}</h2>
          <div className={`pb-segmented pb-segmented--two-col${nightCls}`}>
            <button
              type="button"
              className={`pb-seg-btn${nightCls}${
                activeQuick === "page" ? " is-active" : ""
              }`}
              onClick={() => setRangeToPage(currentPage)}
            >
              {tp.quickPage(String(currentPage))}
            </button>
            <button
              type="button"
              className={`pb-seg-btn${nightCls}${
                activeQuick === "fromPage" ? " is-active" : ""
              }`}
              onClick={() => setRangeFromPage(currentPage)}
            >
              {tp.quickFromPage(String(currentPage))}
            </button>
            {surahsOnPage.map((s) => (
              <button
                key={s}
                type="button"
                className={`pb-seg-btn${nightCls}${
                  activeQuick === `surah-${s}` ? " is-active" : ""
                }`}
                onClick={() => {
                  setRangeToSurah(s);
                  setActiveQuick(`surah-${s}`);
                }}
              >
                {tp.quickSurah(
                  lang === "ar"
                    ? getSurahNameArabic(s)
                    : getSurahNameEnglish(s),
                )}
              </button>
            ))}
            <button
              type="button"
              className={`pb-seg-btn${nightCls}${
                activeQuick === "juz" ? " is-active" : ""
              }`}
              onClick={() => setRangeToJuz(currentJuz)}
            >
              {tp.quickJuz(String(currentJuz))}
            </button>
            <button
              type="button"
              className={`pb-seg-btn${nightCls}${
                activeQuick === "hizb" ? " is-active" : ""
              }`}
              onClick={() => setRangeToHizb(currentHizb)}
            >
              {tp.quickHizb(String(currentHizb))}
            </button>
            <button
              type="button"
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
              type="button"
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
    </div>
  );

  if (onClose) return content;

  return (
    <IonPage>
      <IonContent>{content}</IonContent>
    </IonPage>
  );
};

export default PlaybackSettings;
