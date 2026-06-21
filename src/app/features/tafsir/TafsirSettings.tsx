import React, { useEffect, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import type { TafsirResource } from "../../core/services/api/quran-api.client";
import {
  getDownloadedTafsirIds,
  addDownloadedTafsir,
  removeDownloadedTafsir,
  getCachedTafsirResources,
  fetchAndCacheTafsirResources,
} from "../../core/services/data/tafsir-cache.service";
import "./TafsirSettings.css";

const TafsirSettings: React.FC = () => {
  const history = useHistory();
  const location = useLocation<{ returnVerseKey?: string }>();
  const returnVerseKey = location.state?.returnVerseKey ?? null;
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const ts = t.tafsirSettings;

  const nightCls = isNight ? " tfs--night" : "";

  const [allResources, setAllResources] = useState<TafsirResource[]>(
    () => getCachedTafsirResources() ?? [],
  );
  const [loading, setLoading] = useState(allResources.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<string[]>(
    getDownloadedTafsirIds,
  );
  // Track which IDs are currently mid-"save" animation
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchAndCacheTafsirResources()
      .then((list) => {
        if (!cancelled) {
          setAllResources(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          if (allResources.length === 0) setError("Could not load tafsir list");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for external changes (e.g. from the action sheet)
  useEffect(() => {
    const handler = () => setDownloadedIds(getDownloadedTafsirIds());
    window.addEventListener("rafiq-tafsir-downloads-changed", handler);
    return () => window.removeEventListener("rafiq-tafsir-downloads-changed", handler);
  }, []);

  const downloadedResources = allResources.filter((r) =>
    downloadedIds.includes(r.id),
  );

  const availableResources = allResources.filter(
    (r) => !downloadedIds.includes(r.id),
  );

  // Group available resources by language
  const byLanguage = availableResources.reduce<Record<string, TafsirResource[]>>(
    (acc, r) => {
      const lang = r.languageName ?? "Other";
      (acc[lang] ??= []).push(r);
      return acc;
    },
    {},
  );

  const sortedLanguages = Object.keys(byLanguage).sort((a, b) => {
    // Put Arabic first
    if (a.toLowerCase() === "arabic") return -1;
    if (b.toLowerCase() === "arabic") return 1;
    return a.localeCompare(b);
  });

  const handleSave = (id: string) => {
    setSaving((prev) => new Set(prev).add(id));
    setTimeout(() => {
      addDownloadedTafsir(id);
      setDownloadedIds(getDownloadedTafsirIds());
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 400);
  };

  const handleRemove = (id: string) => {
    removeDownloadedTafsir(id);
    setDownloadedIds(getDownloadedTafsirIds());
  };

  return (
    <IonPage>
      <IonContent>
        <div className={`tfs-wrapper${nightCls}`} dir={isRTL ? "rtl" : "ltr"}>
          {/* Header */}
          <header className={`tfs-header${nightCls}`}>
            <button
              className={`tfs-back-btn${nightCls}`}
              onClick={() =>
                returnVerseKey
                  ? history.replace("/viewer", { openVerseKey: returnVerseKey })
                  : history.goBack()
              }
              aria-label={ts.backLabel}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isRTL ? <path d="M5 12h14M12 5l7 7-7 7" /> : <path d="M19 12H5M12 19l-7-7 7-7" />}
              </svg>
            </button>
            <div className="tfs-header-text">
              <h1>{ts.title}</h1>
              <p>{ts.subtitle}</p>
            </div>
            <div style={{ width: 44 }} />
          </header>
          <div className="tfs-inner">

          <div className="tfs-content">
            {/* ── Downloaded section ── */}
            <div className="tfs-section">
              <p className="tfs-section-title">{ts.sectionDownloaded}</p>
              <div className={`tfs-card${nightCls}`}>
                {downloadedResources.length === 0 ? (
                  <div className="tfs-empty">
                    <p className="tfs-empty-title">{ts.noDownloads}</p>
                    <p className="tfs-empty-hint">{ts.noDownloadsHint}</p>
                  </div>
                ) : (
                  downloadedResources.map((r, i) => (
                    <div
                      key={r.id}
                      className={`tfs-row${i < downloadedResources.length - 1 ? " tfs-row--border" : ""}`}
                    >
                      <div className="tfs-row-info">
                        <p className="tfs-row-name">{r.name}</p>
                        {r.authorName && (
                          <p className="tfs-row-author">{r.authorName}</p>
                        )}
                        {r.languageName && (
                          <span className="tfs-row-lang">{r.languageName}</span>
                        )}
                      </div>
                      <button
                        className={`tfs-btn tfs-btn--remove${nightCls}`}
                        onClick={() => handleRemove(r.id)}
                        aria-label={ts.remove}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Available section ── */}
            <div className="tfs-section">
              <p className="tfs-section-title">{ts.sectionAvailable}</p>

              {loading && (
                <div className="tfs-loading">
                  <span className="tfs-spinner" aria-hidden="true" />
                </div>
              )}

              {error && !loading && (
                <p className="tfs-error">{error}</p>
              )}

              {!loading && !error && sortedLanguages.map((langName) => (
                <div key={langName} className="tfs-lang-group">
                  <p className={`tfs-lang-label${nightCls}`}>
                    {ts.languageGroup(langName)}
                  </p>
                  <div className={`tfs-card${nightCls}`}>
                    {byLanguage[langName].map((r, i) => {
                      const isSaving = saving.has(r.id);
                      const list = byLanguage[langName];
                      return (
                        <div
                          key={r.id}
                          className={`tfs-row${i < list.length - 1 ? " tfs-row--border" : ""}`}
                        >
                          <div className="tfs-row-info">
                            <p className="tfs-row-name">{r.name}</p>
                            {r.authorName && (
                              <p className="tfs-row-author">{r.authorName}</p>
                            )}
                          </div>
                          <button
                            className={`tfs-btn tfs-btn--save${nightCls}${isSaving ? " tfs-btn--saving" : ""}`}
                            onClick={() => handleSave(r.id)}
                            disabled={isSaving}
                            aria-label={isSaving ? ts.downloading : ts.download}
                          >
                            {isSaving ? "…" : "+"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default TafsirSettings;
