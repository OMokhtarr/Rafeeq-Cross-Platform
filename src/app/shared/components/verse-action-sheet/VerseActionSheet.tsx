/**
 * VERSE ACTION SHEET
 *
 * A bottom-sheet popup that appears when the user long-presses a verse on
 * the Mushaf page. Replaces the always-on inline rail of audio buttons +
 * translations under the page text.
 *
 * Provides three actions for one verse:
 *   - Play / pause its recitation (using the shared useAudioPlayer hook).
 *   - Show its translation (uses the active translation edition from
 *     settings; renders a hint if none is selected).
 *   - Show its tafsir (stubbed — fetchTafsirForAyah returns empty until
 *     the user wires a real source. The UI handles the empty state).
 */

import React, { useEffect, useState } from "react";
import {
  fetchAudioForAyah,
  fetchTafsirForAyah,
  fetchTranslationsByPage,
} from "../../../core/services/api/quran-api.client";
import type { AudioPlayer } from "../../../core/hooks/useAudioPlayer";
import { useLang } from "../../../core/context/LanguageContext";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import "./VerseActionSheet.css";

interface Props {
  open: boolean;
  /** "sura:aya" of the verse the user long-pressed. */
  verseKey: string | null;
  /** Page the verse lives on — used for the translation request. */
  page: number;
  /** Reciter slug from settings ("husary", …). */
  reciter: string;
  /** Active translation id from settings (e.g. numeric id or slug). */
  translationId: string;
  /** Tafsir source id from settings. Empty string is fine — stub ignores it. */
  tafsirId?: string;
  /** Shared audio player so other surfaces stop when the sheet plays. */
  audio: AudioPlayer;
  onClose: () => void;
}

const VerseActionSheet: React.FC<Props> = ({
  open,
  verseKey,
  page,
  reciter,
  translationId,
  tafsirId,
  audio,
  onClose,
}) => {
  const { t, lang, isRTL } = useLang();

  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [translation, setTranslation] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const [tafsir, setTafsir] = useState<string>("");
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirError, setTafsirError] = useState<string | null>(null);

  // Reset all per-verse state when the sheet opens for a different verse,
  // and clear errors on close so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setAudioError(null);
      setTranslationError(null);
      setTafsirError(null);
      return;
    }
    setTranslation(null);
    setTafsir("");
  }, [open, verseKey]);

  // Fetch translation for the single verse on this page.
  useEffect(() => {
    if (!open || !verseKey) return;
    if (!translationId) {
      setTranslation(null);
      setTranslationError(null);
      return;
    }
    let cancelled = false;
    setTranslationLoading(true);
    setTranslationError(null);
    fetchTranslationsByPage(page, translationId)
      .then((rows) => {
        if (cancelled) return;
        const hit = rows.find((r) => r.verseKey === verseKey);
        setTranslation(hit?.text ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setTranslationError(t.mushaf.translationError);
      })
      .finally(() => {
        if (!cancelled) setTranslationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, verseKey, page, translationId, t]);

  // Fetch tafsir (stubbed for now — returns empty text).
  useEffect(() => {
    if (!open || !verseKey) return;
    const [s, a] = verseKey.split(":").map((n) => parseInt(n, 10));
    let cancelled = false;
    setTafsirLoading(true);
    setTafsirError(null);
    fetchTafsirForAyah(s, a, tafsirId)
      .then((res) => {
        if (!cancelled) setTafsir(res.text);
      })
      .catch(() => {
        if (!cancelled) setTafsirError(t.mushaf.tafsirError);
      })
      .finally(() => {
        if (!cancelled) setTafsirLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, verseKey, tafsirId, t]);

  if (!open || !verseKey) return null;

  const [suraStr, ayaStr] = verseKey.split(":");
  const sura = parseInt(suraStr, 10);
  const aya = parseInt(ayaStr, 10);
  const displayKey =
    lang === "ar"
      ? `${toHindiNumbers(sura)}:${toHindiNumbers(aya)}`
      : `${sura}:${aya}`;
  const isThisPlaying = audio.playingKey === verseKey && audio.isPlaying;

  const handleToggleAudio = async () => {
    if (isThisPlaying) {
      audio.stop();
      return;
    }
    setAudioBusy(true);
    setAudioError(null);
    try {
      const url = await fetchAudioForAyah(sura, aya, reciter);
      await audio.play(verseKey, url);
    } catch {
      setAudioError(t.mushaf.audioError);
    } finally {
      setAudioBusy(false);
    }
  };

  return (
    <>
      <div
        className="vas-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="vas-sheet"
        role="dialog"
        aria-label={t.mushaf.actionSheetTitle(displayKey)}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="vas-handle" aria-hidden="true" />

        <header className="vas-header">
          <h3 className="vas-title">{t.mushaf.actionSheetTitle(displayKey)}</h3>
          <button
            className="vas-close"
            onClick={onClose}
            aria-label={t.mushaf.closeLabel}
          >
            ✕
          </button>
        </header>

        <div className="vas-body">
          {/* ── Audio ── */}
          <section className="vas-section">
            <button
              type="button"
              className={`vas-audio-btn ${isThisPlaying ? "playing" : ""}`}
              onClick={handleToggleAudio}
              disabled={audioBusy}
            >
              {audioBusy ? (
                <span className="vas-spinner" aria-hidden="true" />
              ) : isThisPlaying ? (
                <span aria-hidden="true">⏸</span>
              ) : (
                <span aria-hidden="true">▶</span>
              )}
              <span>{isThisPlaying ? t.mushaf.pause : t.mushaf.play}</span>
            </button>
            {audioError && (
              <div className="vas-error" role="alert">
                {audioError}
              </div>
            )}
          </section>

          {/* ── Translation ── */}
          <section className="vas-section">
            <h4 className="vas-section-title">{t.mushaf.translation}</h4>
            {!translationId ? (
              <p className="vas-empty">{t.mushaf.translationUnavailable}</p>
            ) : translationLoading ? (
              <div className="vas-loading">
                <span className="vas-spinner" aria-hidden="true" />
                <span>{t.mushaf.translationLoading}</span>
              </div>
            ) : translationError ? (
              <p className="vas-error" role="alert">
                {translationError}
              </p>
            ) : translation ? (
              <p className="vas-translation" lang="en" dir="ltr">
                {translation}
              </p>
            ) : (
              <p className="vas-empty">{t.mushaf.translationUnavailable}</p>
            )}
          </section>

          {/* ── Tafsir ── */}
          <section className="vas-section">
            <h4 className="vas-section-title">{t.mushaf.tafsir}</h4>
            {tafsirLoading ? (
              <div className="vas-loading">
                <span className="vas-spinner" aria-hidden="true" />
                <span>{t.mushaf.tafsirLoading}</span>
              </div>
            ) : tafsirError ? (
              <p className="vas-error" role="alert">
                {tafsirError}
              </p>
            ) : tafsir ? (
              <p className="vas-tafsir">{tafsir}</p>
            ) : (
              <p className="vas-empty">{t.mushaf.tafsirUnavailable}</p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
};

export default VerseActionSheet;
