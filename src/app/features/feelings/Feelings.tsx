/**
 * FEELINGS PAGE
 * "How are you feeling?" — a grid of feelings (/feelings); tapping one opens
 * its verses and duas (/feelings/:feelingId). One component, two routes, the
 * same split Azkar uses.
 *
 * A sub-page of More: entered with `push` and kept out of ROOT_TAB_PATHS, so
 * hardware back walks detail → grid → More. A verse card opens the mushaf at
 * that ayah with the same deep link search results use.
 *
 * Verse and dua text is Arabic in both languages; only the chrome (prompt,
 * headings, feeling names) follows the app language.
 */

import React, { useMemo } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { Redirect, useHistory, useParams } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import { FEELINGS } from "../../../data/feelingsData";
import {
  arabicIndic,
  getFeeling,
  resolveDuas,
  resolveVerses,
  ResolvedVerse,
} from "./feelingsContent";
import "./Feelings.css";

function ayahLabel(v: ResolvedVerse): string {
  return v.from === v.to
    ? `سورة ${v.surahName}، الآية ${arabicIndic(v.from)}`
    : `سورة ${v.surahName}، الآيات ${arabicIndic(v.from)}–${arabicIndic(v.to)}`;
}

const Feelings: React.FC = () => {
  const { feelingId } = useParams<{ feelingId?: string }>();
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tf = t.feelings;

  const feeling = feelingId ? getFeeling(feelingId) : undefined;
  const content = useMemo(
    () =>
      feeling
        ? { verses: resolveVerses(feeling), duas: resolveDuas(feeling) }
        : null,
    [feeling]
  );

  if (feelingId && !feeling) return <Redirect to="/feelings" />;

  const dir = isRTL ? "rtl" : "ltr";
  const lang = isRTL ? "ar" : "en";

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="feelings-page-wrapper">
          {feeling && content ? (
            <>
              <header className="feelings-header" dir={dir}>
                <button
                  className="feelings-back-btn"
                  onClick={() => history.goBack()}
                  aria-label={tf.back}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isRTL
                      ? <path d="M5 12h14M12 5l7 7-7 7" />
                      : <path d="M19 12H5M12 19l-7-7 7-7" />}
                  </svg>
                </button>
                <h1 className="feelings-header-title" lang={lang}>
                  <span className="feelings-header-emoji" aria-hidden="true">{feeling.emoji}</span>
                  {isRTL ? feeling.titleAr : feeling.titleEn}
                </h1>
                <div className="feelings-header-spacer" />
              </header>

              <div className="feelings-container" dir={dir}>
                <section className="feelings-section">
                  <h2 className="feelings-section-title" lang={lang}>{tf.verses}</h2>
                  {content.verses.map((v) => (
                    <button
                      key={v.ref}
                      className="feelings-card feelings-verse"
                      onClick={() =>
                        history.push(`/viewer?page=${v.page}&v=${encodeURIComponent(v.firstKey)}`)
                      }
                      aria-label={`${tf.openInMushaf}: ${ayahLabel(v)}`}
                    >
                      <p className="feelings-verse-text" dir="rtl" lang="ar">
                        <span className="feelings-verse-bracket">﴿</span>
                        {v.text}
                        <span className="feelings-verse-bracket">﴾</span>
                      </p>
                      <span className="feelings-verse-ref" dir="rtl" lang="ar">
                        {ayahLabel(v)}
                        <svg className="feelings-verse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 5a2 2 0 0 1 2-2h5.5v18H5a2 2 0 0 1-2-2V5z" />
                          <path d="M21 5a2 2 0 0 0-2-2h-5.5v18H19a2 2 0 0 0 2-2V5z" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </section>

                <section className="feelings-section">
                  <h2 className="feelings-section-title" lang={lang}>{tf.duas}</h2>
                  {content.duas.map((d) => (
                    <article key={d.text} className="feelings-card feelings-dua" dir="rtl" lang="ar">
                      <p className="feelings-dua-text">{d.text}</p>
                      {d.note && <p className="feelings-dua-note">{d.note}</p>}
                      <p className="feelings-dua-source">{d.source}</p>
                    </article>
                  ))}
                </section>
              </div>
            </>
          ) : (
            <div className="feelings-container" dir={dir}>
              <h1 className="feelings-prompt" lang={lang}>{tf.prompt}</h1>
              <div className="feelings-grid">
                {FEELINGS.map((f) => (
                  <button
                    key={f.id}
                    className="feelings-tile"
                    onClick={() => history.push(`/feelings/${f.id}`)}
                  >
                    <span className="feelings-tile-emoji" aria-hidden="true">{f.emoji}</span>
                    <span className="feelings-tile-label" lang={lang}>
                      {isRTL ? f.titleAr : f.titleEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </IonContent>
      <BottomNavBar active="more" fixed />
    </IonPage>
  );
};

export default Feelings;
