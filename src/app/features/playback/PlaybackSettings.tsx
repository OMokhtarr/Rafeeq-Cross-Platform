/**
 * PLAYBACK SETTINGS SCREEN
 *
 * Pick a verse range, reciter, speed, and per-verse / per-range repeat
 * counts, then start sequenced recitation through `usePlaybackQueue`.
 *
 * Closing the screen does NOT stop playback — the queue lives in a hook
 * that owns its own <audio> element, detached from the React tree.
 */

import React, { useEffect, useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import {
  usePlaybackQueue,
  type RepeatMode,
  type VerseKey,
} from "../../core/hooks/usePlaybackQueue";
import {
  countCachedAudio,
  clearAllCachedAudio,
  downloadAndCache,
} from "../../core/services/audio/audio-cache.service";
import {
  getJuzStart,
  getJuzEnd,
  getPageStart,
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../core/services/data/metadata.service";
import "./PlaybackSettings.css";

// ─── Persisted settings shape ─────────────────────────────────────────────────
const SETTINGS_KEY = "rafiq_settings_v1";

interface StoredPlaybackPrefs {
  reciter: string;
  playbackRate: number;
  repeatVerse: RepeatMode;
  repeatRange: RepeatMode;
}

const DEFAULT_PREFS: StoredPlaybackPrefs = {
  reciter: "minshawi-murattal",
  playbackRate: 1,
  repeatVerse: 1,
  repeatRange: "loop",
};

function loadPrefs(): StoredPlaybackPrefs {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
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

// ─── Range helpers ────────────────────────────────────────────────────────────
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
  const ayahCount = (sura: number) => {
    const ch = chapters.find((c) => c.id === sura);
    return ch ? ch.verses_count : 0;
  };

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
  if (!start) return { sura: 1, aya: 1 };
  return { sura: start.sura, aya: start.aya };
}

function pageEnd(page: number): VerseKeyLocal {
  if (page >= 604) return { sura: 114, aya: 6 };
  const next = getPageStart(page + 1);
  if (!next) return { sura: 114, aya: 6 };
  if (next.aya > 1) return { sura: next.sura, aya: next.aya - 1 };
  // previous surah's last verse
  const prevSura = next.sura - 1;
  const chapters = getChapters();
  const prevCh = chapters.find((c) => c.id === prevSura);
  return { sura: prevSura, aya: prevCh ? prevCh.verses_count : 1 };
}

// ─── Component ────────────────────────────────────────────────────────────────
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75];

const PlaybackSettings: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  const tp = t.playback;
  const ts = t.settings;

  const startPageQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 && raw <= 604 ? raw : 1;
  }, [location.search]);

  const [prefs, setPrefs] = useState<StoredPlaybackPrefs>(loadPrefs);

  const [startVerse, setStartVerse] = useState<VerseKeyLocal>({
    sura: 2,
    aya: 1,
  });
  const [endVerse, setEndVerse] = useState<VerseKeyLocal>({
    sura: 114,
    aya: 6,
  });

  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const downloadAbortRef = React.useRef<AbortController | null>(null);

  const queue = usePlaybackQueue({
    reciter: prefs.reciter,
    playbackRate: prefs.playbackRate,
    repeatVerse: prefs.repeatVerse,
    repeatRange: prefs.repeatRange,
  });

  // Push prefs to the queue whenever they change
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

  // Refresh cached count when downloads panel opens
  useEffect(() => {
    if (!downloadsOpen) return;
    let cancelled = false;
    countCachedAudio().then((n) => {
      if (!cancelled) setCachedCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [downloadsOpen, downloading]);

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
    await queue.start(verses);
  };

  // ── Quick-Select buttons ─────────────────────────────────────────────────
  const currentPage = startPageQuery;
  const currentSura = getPageStart(currentPage)?.sura ?? 1;
  const currentJuz = Math.ceil(currentPage / 20);

  const setRangeToPage = (p: number) => {
    setStartVerse(pageStart(p));
    setEndVerse(pageEnd(p));
  };
  const setRangeFromPage = (p: number) => {
    setStartVerse(pageStart(p));
    setEndVerse(pageEnd(604));
  };
  const setRangeToSurah = (s: number) => {
    const ch = getChapters().find((c) => c.id === s);
    setStartVerse({ sura: s, aya: 1 });
    setEndVerse({ sura: s, aya: ch ? ch.verses_count : 1 });
  };
  const setRangeToJuz = (j: number) => {
    setStartVerse(getJuzStart(j));
    setEndVerse(getJuzEnd(j));
  };
  const setRangeToHizb = (h: number) => {
    // approximate hizb as half of a juz (each juz has 2 hizbs)
    const juz = Math.ceil(h / 2);
    const start = getJuzStart(juz);
    const end = getJuzEnd(juz);
    // crude midpoint
    setStartVerse(start);
    setEndVerse(end);
    // For accurate hizb, we'd need another static mapping; this is acceptable for now.
  };
  const setRangeToAll = () => {
    setStartVerse({ sura: 1, aya: 1 });
    setEndVerse({ sura: 114, aya: 6 });
  };

  // ── Downloads ────────────────────────────────────────────────────────────
  const handleDownloadRange = async () => {
    const verses = expandRange(startVerse, endVerse);
    if (verses.length === 0) return;
    setDownloading(true);
    setDownloadDone(0);
    setDownloadTotal(verses.length);
    const ctrl = new AbortController();
    downloadAbortRef.current = ctrl;
    try {
      for (let i = 0; i < verses.length; i++) {
        if (ctrl.signal.aborted) break;
        const v = verses[i];
        try {
          await downloadAndCache(prefs.reciter, v.sura, v.aya, ctrl.signal);
        } catch (err) {
          if ((err as Error).name === "AbortError") break;
          console.warn("[playback] failed to cache", `${v.sura}:${v.aya}`, err);
        }
        setDownloadDone(i + 1);
      }
    } finally {
      setDownloading(false);
      downloadAbortRef.current = null;
      setCachedCount(await countCachedAudio());
    }
  };

  const handleCancelDownload = () => {
    downloadAbortRef.current?.abort();
  };

  const handleClearCache = async () => {
    await clearAllCachedAudio();
    setCachedCount(0);
  };

  // ── UI helpers ────────────────────────────────────────────────────────────
  const surahOptions = useMemo(
    () =>
      getChapters().map((c) => ({
        value: c.id,
        label: `${lang === "ar" ? c.name_arabic : c.translated_name?.name} (${c.id})`,
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
      <div className="pb-verse-picker" dir={isRTL ? "rtl" : "ltr"}>
        <select
          className="pb-select"
          value={value.sura}
          onChange={(e) => {
            const sura = parseInt(e.target.value, 10);
            onChange({ sura, aya: 1 });
          }}
        >
          {surahOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="pb-verse-sep">:</span>
        <input
          type="number"
          className="pb-aya-input"
          min={1}
          max={maxAyah}
          value={value.aya}
          onChange={(e) => {
            const aya = Math.max(
              1,
              Math.min(maxAyah, parseInt(e.target.value, 10) || 1),
            );
            onChange({ sura: value.sura, aya });
          }}
        />
      </div>
    );
  };

  const renderSpeedRow = () => (
    <div className="pb-segmented">
      {SPEED_OPTIONS.map((sp) => (
        <button
          key={sp}
          type="button"
          className={
            "pb-seg-btn" + (prefs.playbackRate === sp ? " is-active" : "")
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
      <div className="pb-segmented">
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

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="pb-page" dir={isRTL ? "rtl" : "ltr"}>
          <header className="pb-header">
            <button
              type="button"
              className="pb-close"
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
              <div className="pb-now-playing">
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
              <h2 className="pb-section-title">{tp.selectRange}</h2>
              <div className="pb-card">
                <div className="pb-row">
                  <label className="pb-row-label">{tp.startingVerse}</label>
                  {renderVersePicker(startVerse, setStartVerse)}
                </div>
                <div className="pb-row">
                  <label className="pb-row-label">{tp.endingVerse}</label>
                  {renderVersePicker(endVerse, setEndVerse)}
                </div>
              </div>
            </section>

            <section className="pb-section">
              <h2 className="pb-section-title">{tp.reciter}</h2>
              <div className="pb-card">
                <select
                  className="pb-select pb-select-full"
                  value={prefs.reciter}
                  onChange={(e) => updatePref("reciter", e.target.value)}
                >
                  {ts.reciters.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="pb-link-row"
                  onClick={() => setDownloadsOpen(true)}
                >
                  <span>{tp.manageDownloads}</span>
                  <span className="pb-link-chev">{isRTL ? "‹" : "›"}</span>
                </button>
              </div>
            </section>

            <section className="pb-section">
              <h2 className="pb-section-title">{tp.playSpeed}</h2>
              {renderSpeedRow()}
            </section>

            <section className="pb-section">
              <h2 className="pb-section-title">{tp.playEachVerse}</h2>
              {renderRepeatRow(prefs.repeatVerse, (m) =>
                updatePref("repeatVerse", m),
              )}
            </section>

            <section className="pb-section">
              <h2 className="pb-section-title">{tp.playTheRange}</h2>
              {renderRepeatRow(prefs.repeatRange, (m) =>
                updatePref("repeatRange", m),
              )}
            </section>

            <section className="pb-section">
              <h2 className="pb-section-title">{tp.quickSelect}</h2>
              <div className="pb-quick-grid">
                <button
                  className="pb-quick-btn"
                  onClick={() => setRangeToPage(currentPage)}
                >
                  {tp.quickPage(String(currentPage))}
                </button>
                <button
                  className="pb-quick-btn"
                  onClick={() => setRangeFromPage(currentPage)}
                >
                  {tp.quickFromPage(String(currentPage))}
                </button>
                <button
                  className="pb-quick-btn"
                  onClick={() => setRangeToSurah(currentSura)}
                >
                  {tp.quickSurah(
                    lang === "ar"
                      ? getSurahNameArabic(currentSura)
                      : getSurahNameEnglish(currentSura),
                  )}
                </button>
                <button
                  className="pb-quick-btn"
                  onClick={() => setRangeToJuz(currentJuz)}
                >
                  {tp.quickJuz(String(currentJuz))}
                </button>
                <button
                  className="pb-quick-btn"
                  onClick={() => setRangeToHizb(Math.ceil(currentPage / 4))}
                >
                  {tp.quickHizb(String(Math.ceil(currentPage / 4)))}
                </button>
                <button className="pb-quick-btn" onClick={setRangeToAll}>
                  {tp.quickAll}
                </button>
              </div>
            </section>

            <button
              type="button"
              className="pb-cta"
              onClick={
                queue.state.isPlaying
                  ? () => queue.pause()
                  : queue.state.currentVerse
                    ? () => queue.resume()
                    : handlePlay
              }
              disabled={queue.state.isLoading}
            >
              {queue.state.isPlaying
                ? tp.pause
                : queue.state.currentVerse
                  ? tp.resume
                  : tp.playAudio}
            </button>
          </div>

          {/* ── Downloads sub-panel ── */}
          {downloadsOpen && (
            <div
              className="pb-downloads-overlay"
              role="dialog"
              aria-label={tp.downloadsTitle}
            >
              <header className="pb-header">
                <button
                  type="button"
                  className="pb-close"
                  onClick={() => setDownloadsOpen(false)}
                  aria-label={tp.closeLabel}
                >
                  ✕
                </button>
                <h1 className="pb-title">{tp.downloadsTitle}</h1>
                <span className="pb-header-spacer" />
              </header>

              <div className="pb-body">
                <div className="pb-card">
                  <p className="pb-row-label">
                    {cachedCount === 0
                      ? tp.downloadEmpty
                      : tp.downloadProgress(
                          String(cachedCount),
                          String(cachedCount),
                        )}
                  </p>
                </div>

                {downloading ? (
                  <>
                    <div className="pb-card">
                      <p className="pb-row-label">
                        {tp.downloadProgress(
                          String(downloadDone),
                          String(downloadTotal),
                        )}
                      </p>
                      <div className="pb-progress">
                        <div
                          className="pb-progress-fill"
                          style={{
                            width:
                              downloadTotal > 0
                                ? `${Math.round(
                                    (downloadDone / downloadTotal) * 100,
                                  )}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pb-cta pb-cta-warn"
                      onClick={handleCancelDownload}
                    >
                      {tp.downloadCancel}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pb-cta"
                    onClick={handleDownloadRange}
                  >
                    {tp.downloadStart}
                  </button>
                )}

                <button
                  type="button"
                  className="pb-cta pb-cta-ghost"
                  onClick={handleClearCache}
                  disabled={cachedCount === 0 || downloading}
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
