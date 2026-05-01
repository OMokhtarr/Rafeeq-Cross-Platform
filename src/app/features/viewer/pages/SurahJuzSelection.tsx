import React, { useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import { useLang } from "../../../core/context/LanguageContext";
import BottomNavBar from "../../../shared/components/bottom-nav/BottomNavBar";
import {
  getChapters,
  getSurahStartPage,
  getJuzStart,
} from "../../../core/services/data/metadata.service";
import "./SurahJuzSelection.css";

type Tab = "surah" | "juz";

// We'll keep a small constant for juz start pages for performance
const JUZ_START_PAGES: readonly number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

const SurahJuzSelection: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const [tab, setTab] = useState<Tab>("surah");

  const totalPages = 604;

  const surahs = useMemo(() => {
    const chapters = getChapters();
    return chapters.map((ch) => ({
      num: ch.id,
      ar: ch.name_arabic,
      en: ch.translated_name?.name ?? "",
      ayahs: ch.verses_count,
      revelation: ch.revelation_place === "makkah" ? "meccan" : "medinan",
      startPage: ch.pages[0],
    }));
  }, []);

  const juzs = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const juzNum = i + 1;
      const start = JUZ_START_PAGES[juzNum - 1];
      const end = juzNum < 30 ? JUZ_START_PAGES[juzNum] - 1 : totalPages;
      return { num: juzNum, start, end };
    });
  }, []);

  const goToPage = (page: number) => {
    history.push(`/viewer?page=${page}`);
  };

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/viewer");
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="sjs-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* ── Header ── */}
          <header className="sjs-header">
            <button
              className="sjs-back"
              onClick={handleBack}
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
            <div className="sjs-header-titles">
              <h1 className="sjs-title">
                {lang === "ar" ? "السور والأجزاء" : "Chapters & Juz"}
              </h1>
              <div className="sjs-subtitle">
                {lang === "ar" ? "انتقال سريع" : "Quick navigation"}
              </div>
            </div>
            <div
              className="sjs-back"
              aria-hidden="true"
              style={{ visibility: "hidden" }}
            />
          </header>

          {/* ── Tabs ── */}
          <div className="sjs-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "surah"}
              className={"sjs-tab" + (tab === "surah" ? " sjs-tab-active" : "")}
              onClick={() => setTab("surah")}
            >
              <span className="sjs-tab-ar">السور</span>
              <span className="sjs-tab-en">Chapters</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "juz"}
              className={"sjs-tab" + (tab === "juz" ? " sjs-tab-active" : "")}
              onClick={() => setTab("juz")}
            >
              <span className="sjs-tab-ar">الأجزاء</span>
              <span className="sjs-tab-en">Juz</span>
            </button>
          </div>

          {/* ── List ── */}
          <div className="sjs-list-wrap sjs-list-wrap-with-nav">
            {tab === "surah" ? (
              <ul className="sjs-list">
                {surahs.map((s) => (
                  <li key={s.num}>
                    <button
                      className="sjs-row sjs-row-surah"
                      onClick={() => goToPage(s.startPage)}
                    >
                      <span
                        className={
                          "sjs-num " +
                          (s.revelation === "meccan"
                            ? "sjs-num-meccan"
                            : "sjs-num-medinan")
                        }
                      >
                        {lang === "ar" ? toHindiNumbers(s.num) : s.num}
                      </span>

                      <span className="sjs-row-main">
                        <span className="sjs-name-ar" lang="ar">
                          {s.ar}
                        </span>
                        <span className="sjs-name-en">{s.en}</span>
                      </span>

                      <span className="sjs-row-meta">
                        <span
                          className={
                            "sjs-pill " +
                            (s.revelation === "meccan"
                              ? "sjs-pill-meccan"
                              : "sjs-pill-medinan")
                          }
                        >
                          {lang === "ar"
                            ? s.revelation === "meccan"
                              ? "مكية"
                              : "مدنية"
                            : s.revelation === "meccan"
                              ? "Meccan"
                              : "Medinan"}
                        </span>
                        <span className="sjs-ayahs">
                          {lang === "ar"
                            ? `${toHindiNumbers(s.ayahs)} آية`
                            : `${s.ayahs} ${s.ayahs === 1 ? "verse" : "verses"}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="sjs-list">
                {juzs.map((j) => (
                  <li key={j.num}>
                    <button
                      className="sjs-row sjs-row-juz"
                      onClick={() => goToPage(j.start)}
                    >
                      <span className="sjs-num sjs-num-juz">
                        {lang === "ar" ? toHindiNumbers(j.num) : j.num}
                      </span>
                      <span className="sjs-row-main">
                        <span className="sjs-name-ar" lang="ar">
                          {`الجزء ${toHindiNumbers(j.num)}`}
                        </span>
                        <span className="sjs-name-en">{`Juz ${j.num}`}</span>
                      </span>
                      <span className="sjs-row-meta">
                        <span className="sjs-ayahs">
                          {lang === "ar"
                            ? `${t.mushaf.page} ${toHindiNumbers(j.start)}–${toHindiNumbers(j.end)}`
                            : `${t.mushaf.page} ${j.start}–${j.end}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <BottomNavBar active="quran" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SurahJuzSelection;
