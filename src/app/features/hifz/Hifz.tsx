import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useHistory } from "react-router-dom";
import { IonPage, IonContent, useIonViewDidEnter } from "@ionic/react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  loadPlan,
  loadPlanAsync,
  savePlan,
  savePlanAsync,
  clearPlan,
  clearPlanAsync,
  generateSessions,
  juzToPages,
  countMemorizedPages,
  computeStreak,
  countSessionsToday,
  countActiveDays,
  computeMaxSessionsPerDay,
  loadBestPlan,
  loadBestPlanAsync,
  saveBestPlan,
  saveBestPlanAsync,
  saveHifzReadingSession,
  saveHifzReadingSessionAsync,
  loadHifzReadingSession,
  loadHifzReadingSessionAsync,
  clearHifzReadingSession,
  clearHifzReadingSessionAsync,
  sessionReadProgress,
  isSessionFullyRead,
  HifzPlan,
  HifzGoal,
  BestPlanRecord,
  MemorizedUnit,
  PlanSession,
  PageRange,
  SessionUnit,
  unitToPageCount,
} from "./hifz.service";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
  getSurahStartPage,
  getSurahEndPage,
  getPageStart,
  initMetadata,
} from "../../core/services/data/metadata.service";
import "./Hifz.css";

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Persist to both localStorage (immediate UI update) and native storage (background)
function persistPlan(plan: HifzPlan): void {
  savePlan(plan);
  savePlanAsync(plan).catch(() => {}); // Fire and forget for native
}

function persistBestPlan(record: BestPlanRecord): void {
  saveBestPlan(record);
  saveBestPlanAsync(record).catch(() => {}); // Fire and forget for native
}

function persistHifzReadingSession(session: any): void {
  saveHifzReadingSession(session);
  saveHifzReadingSessionAsync(session).catch(() => {}); // Fire and forget for native
}

// ─── Sub-component: AddMemorizedSheet ────────────────────────────────────────

interface AddSheetProps {
  onAddMany: (units: MemorizedUnit[]) => void;
  onClose: () => void;
  memorized: MemorizedUnit[];
  lang: "ar" | "en";
  t: any;
  night: boolean;
}

const AddMemorizedSheet: React.FC<AddSheetProps> = ({
  onAddMany,
  onClose,
  memorized,
  lang,
  t,
  night,
}) => {
  const [mode, setMode] = useState<"juz" | "surah" | "pages">("juz");
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // multi-select sets for juz and surah
  const [selectedJuzs, setSelectedJuzs] = useState<Set<number>>(new Set());
  const [selectedSurahs, setSelectedSurahs] = useState<Set<number>>(new Set());

  // pages mode: pick a surah first, then constrained from/to
  const [pagesSurahId, setPagesSurahId] = useState<number | null>(null);
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(1);

  const h = t.hifz;

  // Pages covered by currently selected juzs (pending, not yet saved)
  const selectedJuzPageSet = useMemo(() => {
    const pages = new Set<number>();
    selectedJuzs.forEach((j) => {
      const { from, to } = juzToPages(j);
      for (let p = from; p <= to; p++) pages.add(p);
    });
    return pages;
  }, [selectedJuzs]);

  // Pages covered by currently selected surahs (pending, not yet saved)
  const selectedSurahPageSet = useMemo(() => {
    const pages = new Set<number>();
    selectedSurahs.forEach((s) => {
      for (let p = getSurahStartPage(s); p <= getSurahEndPage(s); p++) pages.add(p);
    });
    return pages;
  }, [selectedSurahs]);

  // Juzs cross-disabled by pending surah selections (fully covered → can't select again)
  // Does NOT include selectedJuzs themselves so they remain tappable to deselect
  const takenJuzSet = useMemo(() => {
    const taken = new Set<number>();
    for (let j = 1; j <= 30; j++) {
      if (selectedJuzs.has(j)) continue; // active, not disabled
      const { from, to } = juzToPages(j);
      let fullyCovered = true;
      for (let p = from; p <= to; p++) {
        if (!selectedSurahPageSet.has(p)) { fullyCovered = false; break; }
      }
      if (fullyCovered) taken.add(j);
    }
    return taken;
  }, [selectedJuzs, selectedSurahPageSet]);

  // Surahs cross-disabled by pending juz selections (fully covered → can't select again)
  // Does NOT include selectedSurahs themselves so they remain tappable to deselect
  // pagesDisabledSurahSet (used in Pages tab) also includes selectedSurahs for cross-tab awareness
  const takenSurahSet = useMemo(() => {
    const taken = new Set<number>();
    for (let s = 1; s <= 114; s++) {
      if (selectedSurahs.has(s)) continue; // active, not disabled
      const sf = getSurahStartPage(s);
      const se = getSurahEndPage(s);
      let coveredBySelectedJuz = true;
      for (let p = sf; p <= se; p++) {
        if (!selectedJuzPageSet.has(p)) { coveredBySelectedJuz = false; break; }
      }
      if (coveredBySelectedJuz) taken.add(s);
    }
    return taken;
  }, [selectedSurahs, selectedJuzPageSet]);

  // Pages tab surah picker: disabled = juz-covered OR already selected in Surah tab
  const pagesDisabledSurahSet = useMemo(() => {
    const taken = new Set(takenSurahSet);
    selectedSurahs.forEach((s) => taken.add(s));
    return taken;
  }, [takenSurahSet, selectedSurahs]);

  const toggleJuz = (j: number) => {
    setSelectedJuzs((prev) => {
      const next = new Set(prev);
      next.has(j) ? next.delete(j) : next.add(j);
      return next;
    });
  };

  const toggleSurah = (s: number) => {
    setSelectedSurahs((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const handlePagesSurahChange = (s: number) => {
    if (pagesSurahId === s) {
      setPagesSurahId(null);
      return;
    }
    const sf = getSurahStartPage(s);
    const se = getSurahEndPage(s);
    setPagesSurahId(s);
    setFromPage(sf);
    setToPage(se);
  };

  const pagesSurahStart = pagesSurahId != null ? getSurahStartPage(pagesSurahId) : 1;
  const pagesSurahEnd = pagesSurahId != null ? getSurahEndPage(pagesSurahId) : 1;

  const fromPageOptions = useMemo(
    () =>
      Array.from({ length: pagesSurahEnd - pagesSurahStart + 1 }, (_, i) => ({
        value: String(pagesSurahStart + i),
        label: String(pagesSurahStart + i),
      })),
    [pagesSurahStart, pagesSurahEnd]
  );

  const toPageOptions = useMemo(
    () =>
      fromPageOptions.filter((o) => Number(o.value) >= fromPage),
    [fromPageOptions, fromPage]
  );

  const handleAdd = () => {
    const units: MemorizedUnit[] = [];
    if (mode === "juz") {
      selectedJuzs.forEach((j) => units.push({ type: "juz", juz: j }));
    } else if (mode === "surah") {
      selectedSurahs.forEach((s) => units.push({ type: "surah", surah: s }));
    } else if (mode === "pages") {
      units.push({ type: "pages", from: Math.min(fromPage, toPage), to: Math.max(fromPage, toPage) });
    }
    if (units.length > 0) {
      onAddMany(units);
      onClose();
    }
  };

  const canAdd =
    (mode === "juz" && selectedJuzs.size > 0) ||
    (mode === "surah" && selectedSurahs.size > 0) ||
    (mode === "pages" && pagesSurahId != null);

  const surahChipGrid = (
    onToggle: (s: number) => void,
    activeSet: Set<number>,
    disabledSet: Set<number>,
    showPages = false
  ) => (
    <div className="hifz-surah-grid">
      {Array.from({ length: 114 }, (_, i) => {
        const s = i + 1;
        const isActive = activeSet.has(s);
        const isDisabled = disabledSet.has(s);
        const sf = showPages ? getSurahStartPage(s) : 0;
        const se = showPages ? getSurahEndPage(s) : 0;
        return (
          <button
            key={s}
            className={`hifz-surah-chip${isActive ? " active" : ""}${isDisabled ? " taken" : ""}`}
            onClick={() => !isDisabled && onToggle(s)}
            disabled={isDisabled}
          >
            <span className="hifz-chip-text">
              <span className="hifz-chip-name" lang="ar" dir="rtl">
                {getSurahNameArabic(s)}
              </span>
              {lang === "en" && (
                <span className="hifz-chip-en">{getSurahNameEnglish(s)}</span>
              )}
              {showPages && (
                <span className="hifz-chip-pages">{sf}–{se}</span>
              )}
            </span>
            <span className="hifz-chip-badge">{s}</span>
          </button>
        );
      })}
    </div>
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStart(e.touches[0].clientY);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStart === null) return;
    const current = e.touches[0].clientY;
    const offset = Math.max(0, current - dragStart);
    setDragOffset(offset);
  };

  const handleTouchEnd = () => {
    if (dragOffset > 80) {
      onClose();
    }
    setDragStart(null);
    setDragOffset(0);
  };

  return (
    <div className="hifz-sheet-backdrop" onClick={onClose}>
      <div
        className="hifz-sheet"
        onClick={(e) => e.stopPropagation()}
        dir={lang === "ar" ? "rtl" : "ltr"}
        style={{ transform: `translateY(${dragOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="hifz-sheet-handle" />
        <p className="hifz-sheet-title">{h.addMemorized}</p>

        {/* Mode tabs — always visible */}
        <div className="hifz-mode-tabs">
          <button
            className={`hifz-mode-tab${mode === "juz" ? " active" : ""}`}
            onClick={() => setMode("juz")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" />
            </svg>
            {h.addByJuz}
          </button>
          <button
            className={`hifz-mode-tab${mode === "surah" ? " active" : ""}`}
            onClick={() => setMode("surah")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 2.61 1.4 4.9 3.5 6.19V17h7v-1.81C17.6 13.9 19 11.61 19 9c0-3.87-3.13-7-7-7z" />
              <rect x="8" y="17" width="8" height="2" rx="1" />
              <rect x="9" y="19" width="6" height="2" rx="1" />
            </svg>
            {h.addBySurah}
          </button>
          <button
            className={`hifz-mode-tab${mode === "pages" ? " active" : ""}`}
            onClick={() => setMode("pages")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {h.addByPages}
          </button>
        </div>

        {/* Juz multi-select grid */}
        {mode === "juz" && (
          <div className="hifz-chip-section">
            <div className="hifz-juz-grid">
              {Array.from({ length: 30 }, (_, i) => {
                const j = i + 1;
                const taken = takenJuzSet.has(j);
                const active = selectedJuzs.has(j);
                return (
                  <button
                    key={j}
                    className={`hifz-juz-chip${active ? " active" : ""}${taken ? " taken" : ""}`}
                    onClick={() => !taken && toggleJuz(j)}
                    disabled={taken}
                  >
                    <span className="hifz-chip-word">
                      {lang === "ar" ? "جزء" : "Juz"}
                    </span>
                    <span className="hifz-chip-num">{j}</span>
                  </button>
                );
              })}
            </div>
            {selectedJuzs.size > 0 && (
              <p className="hifz-hint hifz-hint-center">
                {Array.from(selectedJuzs).sort((a, b) => a - b).map((j) => {
                  const { from, to } = juzToPages(j);
                  return lang === "ar" ? `جزء ${j} (ص ${from}–${to})` : `Juz ${j} (Pg. ${from}–${to})`;
                }).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* Surah multi-select grid */}
        {mode === "surah" && (
          <div className="hifz-chip-section">
            {surahChipGrid(toggleSurah, selectedSurahs, takenSurahSet)}
            {selectedSurahs.size > 0 && (
              <p className="hifz-hint hifz-hint-center">
                {Array.from(selectedSurahs).sort((a, b) => a - b).map((s) => {
                  const name = lang === "ar" ? getSurahNameArabic(s) : getSurahNameEnglish(s);
                  const sf = getSurahStartPage(s);
                  const se = getSurahEndPage(s);
                  return `${name} (${lang === "ar" ? `ص ${sf}–${se}` : `Pg. ${sf}–${se}`})`;
                }).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* Pages mode: pick surah → constrained from/to dropdowns */}
        {mode === "pages" && (
          <div className="hifz-pages-panel">
            <label className="hifz-label">{lang === "ar" ? "السورة" : "Surah"}</label>
            <div className="hifz-chip-section hifz-chip-section-pages">
              {surahChipGrid(handlePagesSurahChange, pagesSurahId != null ? new Set([pagesSurahId]) : new Set(), pagesDisabledSurahSet, true)}
            </div>
            {pagesSurahId != null && (
              <div className="hifz-pages-row">
                <div className="hifz-pages-col">
                  <label className="hifz-label">{h.fromPage}</label>
                  <InlineSelect
                    value={String(fromPage)}
                    options={fromPageOptions}
                    onChange={(v) => {
                      const n = Number(v);
                      setFromPage(n);
                      if (toPage < n) setToPage(n);
                    }}
                    night={night}
                    fullWidth
                  />
                </div>
                <div className="hifz-pages-col">
                  <label className="hifz-label">{h.toPage}</label>
                  <InlineSelect
                    value={String(toPage)}
                    options={toPageOptions}
                    onChange={(v) => setToPage(Number(v))}
                    night={night}
                    fullWidth
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button
          className="hifz-add-confirm-btn"
          onClick={handleAdd}
          disabled={!canAdd}
        >
          {h.addMemorized}
          {(mode === "juz" && selectedJuzs.size > 1) ||
          (mode === "surah" && selectedSurahs.size > 1)
            ? ` (${mode === "juz" ? selectedJuzs.size : selectedSurahs.size})`
            : ""}
        </button>
      </div>
    </div>
  );
};

// ─── Sub-component: DonutChart ────────────────────────────────────────────────

interface DonutChartProps {
  percent: number;
  color: string;
  label: string;
  sublabel?: string;
  size?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({
  percent,
  color,
  label,
  sublabel,
  size = 118,
}) => {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference * (1 - (animated ? clamped : 0) / 100);

  return (
    <div className="hifz-donut-col">
      <div className="hifz-donut-wrap" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--color-progress-track)"
            strokeWidth="11"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: animated
                ? "stroke-dashoffset 1.1s cubic-bezier(.25,.8,.25,1)"
                : "none",
            }}
          />
        </svg>
        <div className="hifz-donut-center">
          <span className="hifz-donut-pct">{Math.round(clamped)}%</span>
        </div>
      </div>
      <span className="hifz-donut-label">{label}</span>
      {sublabel && <span className="hifz-donut-sub">{sublabel}</span>}
    </div>
  );
};

// ─── Sub-component: SetupView ─────────────────────────────────────────────────

interface SetupViewProps {
  memorized: MemorizedUnit[];
  goal: HifzGoal;
  onUpdateMemorized: (m: MemorizedUnit[]) => void;
  onUpdateGoal: (g: HifzGoal) => void;
  onGenerate: () => void;
  onOpenAddSheet: () => void;
  lang: "ar" | "en";
  t: any;
  chapters: any[];
  isEditing: boolean;
}

const SetupView: React.FC<SetupViewProps> = ({
  memorized,
  goal,
  onUpdateMemorized,
  onUpdateGoal,
  onGenerate,
  onOpenAddSheet,
  lang,
  t,
  chapters,
  isEditing,
}) => {
  const h = t.hifz;

  // Local mirror of the quantity field so it can be cleared/edited freely.
  // We only clamp to a valid number on blur, not on every keystroke — otherwise
  // clearing the box snaps it straight back to 1 and you can't type a new value.
  const [quantityInput, setQuantityInput] = useState(String(goal.quantity));
  useEffect(() => {
    setQuantityInput(String(goal.quantity));
  }, [goal.quantity]);

  const labelForUnit = (u: MemorizedUnit): { primary: string; secondary: string } => {
    if (u.type === "juz") {
      const { from, to } = juzToPages(u.juz);
      return {
        primary: lang === "ar" ? `الجزء ${u.juz}` : `Juz ${u.juz}`,
        secondary: lang === "ar" ? `ص ${from} – ${to}` : `Pg. ${from}–${to}`,
      };
    }
    if (u.type === "surah") {
      const name = lang === "ar" ? getSurahNameArabic(u.surah) : getSurahNameEnglish(u.surah);
      const from = getSurahStartPage(u.surah);
      const to = getSurahEndPage(u.surah);
      return {
        primary: `${lang === "ar" ? "سورة" : "Surah"} ${name}`,
        secondary: lang === "ar" ? `ص ${from} – ${to}` : `Pg. ${from}–${to}`,
      };
    }
    return {
      primary: lang === "ar" ? `ص ${u.from} – ${u.to}` : `Pg. ${u.from}–${u.to}`,
      secondary: "",
    };
  };

  const removeUnit = (idx: number) => {
    onUpdateMemorized(memorized.filter((_, i) => i !== idx));
  };

  // The box must hold a valid number too — an empty/invalid field disables generate.
  const quantityValid = (() => {
    const v = parseInt(quantityInput, 10);
    return !isNaN(v) && v >= 1 && v <= 999;
  })();
  const canGenerate = memorized.length > 0 && quantityValid;

  return (
    <div className="hifz-setup" dir={lang === "ar" ? "rtl" : "ltr"}>


      {/* Memorized content */}
      <section className="hifz-section">
        <h2 className="hifz-section-title">{h.memorizedSection}</h2>
        {memorized.length === 0 ? (
          <p className="hifz-empty-hint">{h.noMemorized}</p>
        ) : (
          <ul className="hifz-memorized-list">
            {memorized.map((u, i) => {
              const { primary, secondary } = labelForUnit(u);
              return (
                <li key={i} className="hifz-memorized-item">
                  <span className="hifz-memorized-label">
                    <span className="hifz-memorized-primary">{primary}</span>
                    {secondary && (
                      <span className="hifz-memorized-secondary">{secondary}</span>
                    )}
                  </span>
                  <button
                    className="hifz-remove-btn"
                    onClick={() => removeUnit(i)}
                    aria-label={h.remove}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          className="hifz-add-btn"
          onClick={onOpenAddSheet}
        >
          + {h.addMemorized}
        </button>
      </section>

      {/* Goal */}
      <section className="hifz-section">
        <h2 className="hifz-section-title">{h.goalSection}</h2>
        <p className="hifz-goal-desc">{h.goalSectionDesc}</p>

        <label className="hifz-label">{h.quantityPerSession}</label>
        <div className="hifz-goal-row">
          <input
            type="number"
            inputMode="numeric"
            className="hifz-input hifz-input-sm"
            min={1}
            max={999}
            value={quantityInput}
            onChange={(e) => {
              const raw = e.target.value;
              setQuantityInput(raw);
              // Push valid in-range numbers through immediately; leave the field
              // alone while it's empty or mid-edit (clamped on blur instead).
              const v = parseInt(raw, 10);
              if (!isNaN(v) && v >= 1 && v <= 999) {
                onUpdateGoal({ ...goal, quantity: v });
              }
            }}
            onBlur={() => {
              const v = parseInt(quantityInput, 10);
              const clamped = isNaN(v) || v < 1 ? 1 : v > 999 ? 999 : v;
              setQuantityInput(String(clamped));
              onUpdateGoal({ ...goal, quantity: clamped });
            }}
          />
          <div className="hifz-toggle-group hifz-unit-group">
            {(["pages", "rub", "hizb", "juz"] as SessionUnit[]).map((u) => (
              <button
                key={u}
                className={`hifz-toggle-btn${goal.unit === u ? " active" : ""}`}
                onClick={() => onUpdateGoal({ ...goal, unit: u })}
              >
                {u === "pages" ? h.unitPages : u === "rub" ? h.unitRub : u === "hizb" ? h.unitHizb : h.unitJuz}
              </button>
            ))}
          </div>
        </div>
      </section>

      <button
        className="hifz-generate-btn"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        {isEditing ? h.updatePlan : h.generatePlan}
      </button>

    </div>
  );
};

// ─── Sub-component: SessionCard ──────────────────────────────────────────────

interface SessionCardProps {
  session: PlanSession;
  variant: "next" | "remaining" | "done";
  onToggle: (id: string) => void;
  onOpenPage: (page: number, session?: PlanSession) => void;
  onQuiz: (session: PlanSession) => void;
  lang: "ar" | "en";
  h: any;
  chapters: any[];
  readPages?: number[];
}

const OpenBookIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={size} height={size}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const QuizIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={size} height={size} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const SessionCard: React.FC<SessionCardProps> = ({
  session: s,
  variant,
  onToggle,
  onOpenPage,
  onQuiz,
  lang,
  h,
  chapters,
  readPages = [],
}) => {
  // Resolve effective ranges — fall back to single range for old saved plans
  const effectiveRanges: PageRange[] = s.ranges ?? [{ from: s.fromPage, to: s.toPage }];
  const multiRange = effectiveRanges.length > 1;
  // Derive the surahs shown on the card. When the session was built from the
  // user's selected units, honour their intent: a picked *surah* shows only that
  // surah's name (never the neighbours that merely share its first/last page); a
  // picked *juz* or *page range* shows all surahs its pages cover. Falls back to
  // range-intersection for old plans that have no selectedUnits.
  const surahs = useMemo(() => {
    type Seg = {
      id: number;
      nameAr: string;
      nameEn: string;
      from: number;
      to: number;
      rangeFrom: number;
    };
    // Candidate surah spans (before clamping to this session's pages). For a
    // picked surah, only that surah; for a juz/page unit, every surah in it;
    // for old plans (no units), every surah — all clamped below.
    const candidates: number[] = [];
    if (s.selectedUnits && s.selectedUnits.length > 0) {
      for (const unit of s.selectedUnits) {
        if (unit.type === "surah") {
          candidates.push(unit.surah);
        } else {
          const { from, to } =
            unit.type === "juz"
              ? juzToPages(unit.juz)
              : { from: unit.from, to: unit.to };
          for (let sura = 1; sura <= 114; sura++) {
            const sf = getSurahStartPage(sura);
            const se = getSurahEndPage(sura);
            if (sf <= to && se >= from) candidates.push(sura);
          }
        }
      }
    } else {
      for (let sura = 1; sura <= 114; sura++) candidates.push(sura);
    }

    // Clamp each candidate surah to the session's actual page ranges, so the
    // card shows only the pages this session covers — not the whole surah.
    const segs: Seg[] = [];
    const seen = new Set<number>();
    for (const sura of candidates) {
      if (seen.has(sura)) continue;
      const sf = getSurahStartPage(sura);
      const se = getSurahEndPage(sura);
      for (const r of effectiveRanges) {
        if (sf > r.to || se < r.from) continue;
        seen.add(sura);
        segs.push({
          id: sura,
          nameAr: getSurahNameArabic(sura),
          nameEn: getSurahNameEnglish(sura),
          from: Math.max(sf, r.from),
          to: Math.min(se, r.to),
          rangeFrom: r.from,
        });
        break; // one segment per surah, in the first range it overlaps
      }
    }

    segs.sort((a, b) => a.from - b.from || a.id - b.id);
    return segs;
  }, [s.selectedUnits, effectiveRanges, chapters]);
  // Each page in the session owns an equal slice of the bar, in order. A slice
  // fills only if that specific page has been read, so the position reflects
  // exactly which page was read (page 4 of 3–4 fills the right half, not the
  // left). Rendered as adjacent slices with no gaps, so it reads as one
  // continuous bar — "segmented as progress only".
  const readSet = new Set(readPages);
  const sessionPages: number[] = [];
  for (const r of effectiveRanges) {
    for (let p = r.from; p <= r.to; p++) sessionPages.push(p);
  }
  const readCount = sessionPages.filter((p) => readSet.has(p)).length;
  const progress = s.done
    ? 100
    : sessionPages.length > 0
    ? Math.round((readCount / sessionPages.length) * 100)
    : 0;

  // First page the user hasn't read yet — opening jumps straight there so they
  // resume where they left off. Falls back to the start when all pages are read.
  const firstUnreadPage = (pages: number[], fallback: number): number =>
    pages.find((p) => !readSet.has(p)) ?? fallback;
  // First unread page across the whole session (for the single open button).
  const resumePage = firstUnreadPage(sessionPages, s.fromPage);

  // Group surahs by which range they belong to (for multi-range display)
  const rangeGroups: Array<{ range: PageRange; surahs: typeof surahs }> = multiRange
    ? effectiveRanges.map((r) => ({
        range: r,
        surahs: surahs.filter((su) => su.rangeFrom === r.from),
      }))
    : [];

  return (
    <div className={`hifz-session hifz-session-${variant}${multiRange ? " hifz-session-multi" : ""}`}>
      <div className="hifz-session-body">
        <div className="hifz-session-info">
          <span className="hifz-session-label">{h.planSession(s.label)}</span>

          {multiRange ? (
            // Non-contiguous session: one tappable block per range
            <div className="hifz-session-ranges">
              {rangeGroups.map(({ range, surahs: rSurahs }) => (
                <button
                  key={range.from}
                  className="hifz-session-range-btn"
                  onClick={() =>
                    onOpenPage(
                      firstUnreadPage(
                        Array.from(
                          { length: range.to - range.from + 1 },
                          (_, i) => range.from + i,
                        ),
                        range.from,
                      ),
                      s,
                    )
                  }
                  title={h.openInQuran}
                >
                  <span className="hifz-session-range-surahs">
                    {rSurahs.length > 0 ? (
                      rSurahs.map((su) => (
                        <span key={su.id} className="hifz-session-surah-item">
                          <span
                            className="hifz-session-surah-name"
                            {...(lang === "ar" ? { lang: "ar", dir: "rtl" } : {})}
                          >
                            {lang === "ar" ? su.nameAr : su.nameEn}
                          </span>
                          <span className="hifz-session-surah-pages" dir="ltr">
                            {lang === "ar" ? `ص ${su.from}–${su.to}` : `pg. ${su.from}–${su.to}`}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="hifz-session-surah-pages" dir="ltr">
                        {lang === "ar" ? `ص ${range.from}–${range.to}` : `pg. ${range.from}–${range.to}`}
                      </span>
                    )}
                  </span>
                  <span className="hifz-session-range-open">
                    <OpenBookIcon size={14} />
                  </span>
                </button>
              ))}
            </div>
          ) : surahs.length > 0 ? (
            // Single contiguous range: plain labels, single open button in actions
            <div className="hifz-session-surahs">
              {surahs.map((su) => (
                <span key={su.id} className="hifz-session-surah-item">
                  <span
                    className="hifz-session-surah-name"
                    {...(lang === "ar" ? { lang: "ar", dir: "rtl" } : {})}
                  >
                    {lang === "ar" ? su.nameAr : su.nameEn}
                  </span>
                  <span className="hifz-session-surah-pages" dir="ltr">
                    {lang === "ar" ? `ص ${su.from}–${su.to}` : `pg. ${su.from}–${su.to}`}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span className="hifz-session-pages">
              {lang === "ar"
                ? `ص ${s.fromPage} – ${s.toPage}`
                : `Pg. ${s.fromPage}–${s.toPage}`}
            </span>
          )}

          {s.doneDate && <span className="hifz-session-date">{s.doneDate}</span>}
        </div>

        <div className="hifz-session-actions">
          {s.done && (
            <button
              className="hifz-session-quiz-btn"
              onClick={() => onQuiz(s)}
              aria-label={h.quizFromSession}
              title={h.quizFromSession}
            >
              <QuizIcon />
            </button>
          )}
          {!multiRange && (
            <button
              className="hifz-session-open-btn"
              onClick={() => onOpenPage(resumePage, s)}
              aria-label={h.openInQuran}
              title={h.openInQuran}
            >
              <OpenBookIcon />
            </button>
          )}
          <button
            className={`hifz-session-check${s.done ? " checked" : ""}`}
            onClick={() => onToggle(s.id)}
            aria-label={s.done ? h.planUndone : h.planDone}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="hifz-session-bar-track"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {sessionPages.map((p) => (
          <span
            key={p}
            className={`hifz-session-bar-slice${s.done || readSet.has(p) ? " filled" : ""}`}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Sub-component: DashboardView ────────────────────────────────────────────

interface DashboardViewProps {
  plan: HifzPlan;
  chapters: any[];
  onToggleSession: (id: string) => void;
  onReset: () => void;
  onEdit: () => void;
  onOpenPage: (page: number, session?: PlanSession) => void;
  onQuiz: (session: PlanSession) => void;
  onStartNewRound: () => void;
  bestPlan: BestPlanRecord | null;
  lang: "ar" | "en";
  t: any;
  readPages: number[];
  showResetConfirm: boolean;
  setShowResetConfirm: (v: boolean) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  plan,
  chapters,
  onToggleSession,
  onReset,
  onEdit,
  onOpenPage,
  onQuiz,
  onStartNewRound,
  bestPlan,
  lang,
  t,
  readPages,
  showResetConfirm,
  setShowResetConfirm,
}) => {
  const h = t.hifz;
  const [showNewRoundConfirm, setShowNewRoundConfirm] = useState(false);
  const [heroPage, setHeroPage] = useState(0);
  const heroScrollRef = React.useRef<HTMLDivElement>(null);
  const sessions = plan.sessions;
  const doneSessions = sessions.filter((s) => s.done).length;
  const totalSessions = sessions.length;
  const planPct = totalSessions ? (doneSessions / totalSessions) * 100 : 0;
  const memorizedPages = countMemorizedPages(plan.memorized, chapters);
  const quranPct = (memorizedPages / 604) * 100;
  const streak = computeStreak(sessions);
  const todaySessions = countSessionsToday(sessions);
  const daysActive = countActiveDays(plan);
  const maxSessionsPerDay = computeMaxSessionsPerDay(sessions);

  const incomplete = sessions.filter((s) => !s.done);
  const nextSession = incomplete[0] ?? null;
  const comingUpSession = incomplete[1] ?? null;
  // "Previous" shows the most recently completed session — by doneDate, then by
  // session order for ties — not simply the last done one in list order.
  const doneList = sessions.filter((s) => s.done);
  const lastDoneSession =
    doneList.length > 0
      ? doneList.reduce((latest, s) => {
          const sd = s.doneDate ?? "";
          const ld = latest.doneDate ?? "";
          if (sd > ld) return s;
          if (sd < ld) return latest;
          // Same (or missing) date → prefer the later session in plan order.
          return sessions.indexOf(s) > sessions.indexOf(latest) ? s : latest;
        })
      : null;

  return (
    <div className="hifz-plan" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* ── Reset confirmation dialog ── */}
      {showResetConfirm && (
        <div className="hifz-confirm-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="hifz-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="hifz-confirm-title">{h.resetConfirmTitle}</p>
            <p className="hifz-confirm-body">{h.resetConfirmBody}</p>
            <div className="hifz-confirm-actions">
              <button className="hifz-confirm-cancel" onClick={() => setShowResetConfirm(false)}>
                {h.resetConfirmNo}
              </button>
              <button className="hifz-confirm-yes" onClick={() => { setShowResetConfirm(false); onReset(); }}>
                {h.resetConfirmYes}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero card: horizontally scrollable pages of charts ── */}
      <div
        className="hifz-hero-scroll"
        ref={heroScrollRef}
        onScroll={() => {
          const el = heroScrollRef.current;
          if (!el) return;
          const page = Math.round(el.scrollLeft / el.offsetWidth);
          setHeroPage(page);
        }}
      >
        {/* Page 1: Plan + Quran donuts */}
        <div className="hifz-hero-page">
          <DonutChart
            percent={quranPct}
            color="var(--color-quran)"
            label={h.quranMemorized}
            sublabel={`${memorizedPages} / 604`}
            size={100}
          />
          <DonutChart
            percent={planPct}
            color="#5b8dd9"
            label={h.planCompletion}
            sublabel={`${doneSessions} / ${totalSessions}`}
            size={100}
          />
        </div>
        {/* Page 2: Days active + best plan */}
        <div className="hifz-hero-page hifz-hero-page-stats">
          <div className="hifz-hero-big-stat">
            <span className="hifz-hero-big-num">{daysActive}</span>
            <span className="hifz-hero-big-lbl">{h.daysActive}</span>
          </div>
          <div className="hifz-hero-stat-divider" />
          <div className="hifz-hero-big-stat">
            {bestPlan ? (
              <>
                <span className="hifz-hero-big-num">{bestPlan.daysToFinish}<span className="hifz-hero-big-unit">{h.bestPlanDays}</span></span>
                <span className="hifz-hero-big-lbl">{h.bestPlan}</span>
                <span className="hifz-hero-big-sub">{bestPlan.totalPages}{h.bestPlanPages} · {bestPlan.totalSessions} sessions</span>
              </>
            ) : (
              <>
                <span className="hifz-hero-big-num">—</span>
                <span className="hifz-hero-big-lbl">{h.bestPlan}</span>
                <span className="hifz-hero-big-sub">{h.bestPlanNone}</span>
              </>
            )}
          </div>
        </div>
        {/* Page 3: Today's sessions + best day */}
        <div className="hifz-hero-page hifz-hero-page-stats">
          <div className="hifz-hero-big-stat">
            <span className="hifz-hero-big-num">{todaySessions}</span>
            <span className="hifz-hero-big-lbl">{h.heroToday}</span>
          </div>
          <div className="hifz-hero-stat-divider" />
          <div className="hifz-hero-big-stat">
            <span className="hifz-hero-big-num">{maxSessionsPerDay || "—"}</span>
            <span className="hifz-hero-big-lbl">{h.heroBestDay}</span>
          </div>
        </div>
      </div>
      {/* Scroll indicator dots */}
      <div className="hifz-hero-dots" aria-hidden="true">
        <span className={`hifz-hero-dot${heroPage === 0 ? " hifz-hero-dot-active" : ""}`} />
        <span className={`hifz-hero-dot${heroPage === 1 ? " hifz-hero-dot-active" : ""}`} />
        <span className={`hifz-hero-dot${heroPage === 2 ? " hifz-hero-dot-active" : ""}`} />
      </div>

      {/* ── 4-chip stat row ── */}
      <div className="hifz-stat-row">
        <div className="hifz-stat-chip">
          <div className="hifz-stat-icon hifz-stat-icon-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="hifz-stat-num">{doneSessions}</span>
          <span className="hifz-stat-lbl">{h.sessionsDone}</span>
        </div>
        <div className="hifz-stat-chip">
          <div className="hifz-stat-icon hifz-stat-icon-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="hifz-stat-num">{totalSessions - doneSessions}</span>
          <span className="hifz-stat-lbl">{h.sessionsLeft}</span>
        </div>
        <div className="hifz-stat-chip">
          <div className="hifz-stat-icon hifz-stat-icon-pages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <span className="hifz-stat-num">{todaySessions}</span>
          <span className="hifz-stat-lbl">{h.todaySessions}</span>
        </div>
        <div className="hifz-stat-chip hifz-stat-chip-streak">
          <div className="hifz-stat-icon hifz-stat-icon-streak">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6" />
            </svg>
          </div>
          <span className="hifz-stat-num">{streak}</span>
          <span className="hifz-stat-lbl">{h.streakDays}</span>
        </div>
      </div>

      {/* ── Session context row: previous / up next / coming up ── */}
      {sessions.length === 0 && (
        <p className="hifz-empty-hint">{h.planEmpty}</p>
      )}

      {incomplete.length === 0 && sessions.length > 0 && (
        <div className="hifz-all-done-block">
          <div className="hifz-all-done-banner">
            {lang === "ar" ? "🎉 أحسنت! اكتملت جميع الجلسات" : "🎉 Well done! All sessions complete"}
          </div>
          <button
            className="hifz-new-round-btn"
            onClick={() => setShowNewRoundConfirm(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {h.startNewRound}
          </button>
          {showNewRoundConfirm && (
            <div className="hifz-confirm-backdrop" onClick={() => setShowNewRoundConfirm(false)}>
              <div className="hifz-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <p className="hifz-confirm-title">{h.newRoundConfirmTitle}</p>
                <p className="hifz-confirm-body">{h.newRoundConfirmBody}</p>
                <div className="hifz-confirm-actions">
                  <button className="hifz-confirm-cancel" onClick={() => setShowNewRoundConfirm(false)}>
                    {h.newRoundConfirmNo}
                  </button>
                  <button className="hifz-confirm-yes" onClick={() => { setShowNewRoundConfirm(false); onStartNewRound(); }}>
                    {h.newRoundConfirmYes}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {sessions.length > 0 && incomplete.length > 0 && (
        <div className="hifz-session-row">
          {lastDoneSession && (
            <div className="hifz-session-col">
              <span className="hifz-session-col-label hifz-section-done-title">{h.sessionPrevious}</span>
              <SessionCard
                session={lastDoneSession}
                variant="done"
                onToggle={onToggleSession}
                onOpenPage={onOpenPage}
                onQuiz={onQuiz}
                lang={lang}
                h={h}
                chapters={chapters}
                readPages={readPages}
              />
            </div>
          )}
          {nextSession && (
            <div className="hifz-session-col">
              <span className="hifz-session-col-label hifz-section-today">{h.sessionNext}</span>
              <SessionCard
                session={nextSession}
                variant="next"
                onToggle={onToggleSession}
                onOpenPage={onOpenPage}
                onQuiz={onQuiz}
                lang={lang}
                h={h}
                chapters={chapters}
                readPages={readPages}
              />
            </div>
          )}
          {comingUpSession && (
            <div className="hifz-session-col">
              <span className="hifz-session-col-label">{h.sessionRemaining}</span>
              <SessionCard
                session={comingUpSession}
                variant="remaining"
                onToggle={onToggleSession}
                onOpenPage={onOpenPage}
                onQuiz={onQuiz}
                lang={lang}
                h={h}
                chapters={chapters}
                readPages={readPages}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
};

// ─── Sub-component: HifzSessionsView ────────────────────────────────────────

interface HifzSessionsViewProps {
  plan: HifzPlan;
  chapters: any[];
  onToggleSession: (id: string) => void;
  onBack: () => void;
  onOpenPage: (page: number, session?: PlanSession) => void;
  onQuiz: (session: PlanSession) => void;
  lang: "ar" | "en";
  t: any;
  readPages: number[];
}

const HifzSessionsView: React.FC<HifzSessionsViewProps> = ({
  plan,
  chapters,
  onToggleSession,
  onBack,
  onOpenPage,
  onQuiz,
  lang,
  t,
  readPages,
}) => {
  const h = t.hifz;
  const sessions = plan.sessions;
  const doneCount = sessions.filter((s) => s.done).length;
  const total = sessions.length;
  const [completedOpen, setCompletedOpen] = useState(false);

  const incomplete = sessions.filter((s) => !s.done);
  const done = sessions.filter((s) => s.done);

  const getVariant = (s: PlanSession): "next" | "remaining" | "done" => {
    if (s.done) return "done";
    const firstIncomplete = sessions.find((x) => !x.done);
    return firstIncomplete?.id === s.id ? "next" : "remaining";
  };

  return (
    <div className="hifz-sessions-view" dir={lang === "ar" ? "rtl" : "ltr"}>

      {/* Uncompleted sessions */}
      {incomplete.length > 0 && (
        <div className="hifz-sessions-section">
          <div className="hifz-sessions-section-label">
            <span>{h.sessionsUncompleted}</span>
            <span className="hifz-sessions-section-count">{incomplete.length}</span>
          </div>
          <div className="hifz-sessions-list">
            {incomplete.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                variant={getVariant(s)}
                onToggle={onToggleSession}
                onOpenPage={onOpenPage}
                onQuiz={onQuiz}
                lang={lang}
                h={h}
                chapters={chapters}
                readPages={readPages}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed sessions — collapsible */}
      {done.length > 0 && (
        <div className="hifz-sessions-section hifz-sessions-section-done">
          <button
            className="hifz-sessions-section-label hifz-sessions-section-toggle"
            onClick={() => setCompletedOpen((o) => !o)}
            aria-expanded={completedOpen}
          >
            <span>{h.sessionsCompleted}</span>
            <span className="hifz-sessions-section-count">{done.length}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              width="14"
              height="14"
              className={`hifz-sessions-chevron${completedOpen ? " open" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {completedOpen && (
            <div className="hifz-sessions-list">
              {done.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  variant="done"
                  onToggle={onToggleSession}
                  onOpenPage={onOpenPage}
                  onQuiz={onQuiz}
                  lang={lang}
                  h={h}
                  chapters={chapters}
                  readPages={readPages}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Hifz: React.FC = () => {
  const { t, lang } = useLang();
  const { isNight } = useTheme();
  const history = useHistory();

  const [plan, setPlan] = useState<HifzPlan | null>(null);
  const [view, setView] = useState<"setup" | "plan" | "sessions">("setup");
  const [chapters, setChapters] = useState<any[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [bestPlan, setBestPlan] = useState<BestPlanRecord | null>(null);
  const [readPages, setReadPages] = useState<number[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [memorized, setMemorized] = useState<MemorizedUnit[]>([]);
  const [goal, setGoal] = useState<HifzGoal>({
    quantity: 5,
    unit: "pages",
  });

  // Sync read pages when the user returns from the viewer. Read sync localStorage
  // first for an instant update, then reconcile against the async (native) store
  // which is the source of truth on Android.
  useIonViewDidEnter(() => {
    const rs = loadHifzReadingSession();
    if (rs) setReadPages(rs.readPages);
    loadHifzReadingSessionAsync()
      .then((async) => {
        if (async) setReadPages(async.readPages);
      })
      .catch(() => {});
  });

  // Refresh progress the instant a page is marked read in the viewer — this
  // avoids any race between the async cache write and the view-enter lifecycle.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<number[]>).detail;
      if (Array.isArray(detail)) setReadPages(detail);
    };
    window.addEventListener("hifz-read-pages-changed", onChange);
    return () => window.removeEventListener("hifz-read-pages-changed", onChange);
  }, []);

  // Auto-complete: when every page of a session has been read, mark it done.
  useEffect(() => {
    if (!plan) return;
    let changed = false;
    const today = todayStr();
    const sessions = plan.sessions.map((s) => {
      if (!s.done && isSessionFullyRead(s, readPages)) {
        changed = true;
        return { ...s, done: true, doneDate: today };
      }
      return s;
    });
    if (!changed) return;

    const updated = { ...plan, sessions };
    savePlan(updated);
    savePlanAsync(updated).catch(() => {});
    setPlan(updated);

    // If this completed the whole plan, record a best run.
    if (sessions.every((s) => s.done)) {
      const days = countActiveDays(updated);
      const pages = countMemorizedPages(updated.memorized, chapters);
      const record: BestPlanRecord = {
        completedAt: today,
        daysToFinish: days,
        totalPages: pages,
        totalSessions: sessions.length,
      };
      const existing = loadBestPlan();
      if (!existing || days < existing.daysToFinish) {
        persistBestPlan(record);
        setBestPlan(record);
      }
    }
  }, [readPages, plan, chapters]);

  useEffect(() => {
    // Load saved plan from storage (web localStorage or native Capacitor Preferences)
    const loadInitial = async () => {
      const saved = await loadPlanAsync();
      if (saved) {
        setPlan(saved);
        setMemorized(saved.memorized);
        setGoal(saved.goal);
        setView("plan");
      }
      const best = await loadBestPlanAsync();
      setBestPlan(best);
      // Populate read pages on mount so progress bars are correct immediately,
      // not only after a view re-enter.
      const rs = await loadHifzReadingSessionAsync();
      if (rs) setReadPages(rs.readPages);
    };

    loadInitial();

    // Fetch metadata in parallel; if offline, chapters will fail but plan is already loaded
    initMetadata()
      .then(() => {
        const chs = getChapters();
        setChapters(chs);
      })
      .catch(() => {
        // Offline or error fetching metadata — already loaded plan from storage above
      });
  }, []);

  const handleGenerate = useCallback(() => {
    const sessions = generateSessions(memorized, goal, chapters);
    // When editing an existing plan, preserve done state for sessions that still match
    const existingDoneMap = new Map(
      (plan?.sessions ?? [])
        .filter((s) => s.done)
        .map((s) => [`${s.fromPage}-${s.toPage}`, s]),
    );
    const mergedSessions = sessions.map((s) => {
      const key = `${s.fromPage}-${s.toPage}`;
      const prev = existingDoneMap.get(key);
      return prev ? { ...s, done: prev.done, doneDate: prev.doneDate } : s;
    });
    const newPlan: HifzPlan = {
      memorized,
      goal,
      sessions: mergedSessions,
      createdAt: plan?.createdAt ?? new Date().toISOString(),
    };
    persistPlan(newPlan);
    setPlan(newPlan);
    setView("plan");
  }, [memorized, goal, chapters, plan]);

  const handleToggleSession = useCallback(
    (id: string) => {
      if (!plan) return;
      const today = todayStr();
      const target = plan.sessions.find((s) => s.id === id);
      const nowDone = target ? !target.done : false;
      const sessions = plan.sessions.map((s) =>
        s.id === id
          ? { ...s, done: !s.done, doneDate: !s.done ? today : undefined }
          : s,
      );
      const updated = { ...plan, sessions };
      savePlan(updated);
      savePlanAsync(updated).catch(() => {});
      setPlan(updated);

      // Keep the read-pages cache in sync with the manual checkmark: marking a
      // session done fills its pages, un-marking clears them, so the progress
      // bars (which are driven by readPages) always match the done state.
      if (target) {
        const ranges = target.ranges ?? [{ from: target.fromPage, to: target.toPage }];
        const sessionPages: number[] = [];
        for (const r of ranges) {
          for (let p = r.from; p <= r.to; p++) sessionPages.push(p);
        }
        setReadPages((prev) => {
          const next = nowDone
            ? Array.from(new Set([...prev, ...sessionPages]))
            : prev.filter((p) => !sessionPages.includes(p));
          const existing = loadHifzReadingSession();
          persistHifzReadingSession({
            ranges: existing?.ranges ?? ranges,
            readPages: next,
            sessionIds: existing?.sessionIds ?? [id],
          });
          return next;
        });
      }

      // Check if plan just completed — save best record
      const allDone = sessions.every((s) => s.done);
      if (allDone) {
        const days = countActiveDays(updated);
        const pages = countMemorizedPages(updated.memorized, chapters);
        const record: BestPlanRecord = {
          completedAt: today,
          daysToFinish: days,
          totalPages: pages,
          totalSessions: sessions.length,
        };
        const existing = loadBestPlan();
        if (!existing || days < existing.daysToFinish) {
          persistBestPlan(record);
          setBestPlan(record);
        }
      }
    },
    [plan, chapters],
  );

  const handleReset = useCallback(() => {
    if (!plan) return;
    const sessions = plan.sessions.map((s) => ({
      ...s,
      done: false,
      doneDate: undefined,
    }));
    const updated = { ...plan, sessions };
    savePlan(updated);
    setPlan(updated);
    // Wipe the saved read-pages cache so every progress bar resets to 0%.
    clearHifzReadingSession();
    clearHifzReadingSessionAsync().catch(() => {});
    setReadPages([]);
  }, [plan]);

  // Delete the whole plan and its read-pages cache, returning to the empty
  // create-plan setup screen.
  const handleDeletePlan = useCallback(() => {
    clearPlan();
    clearPlanAsync().catch(() => {});
    clearHifzReadingSession();
    clearHifzReadingSessionAsync().catch(() => {});
    setReadPages([]);
    setPlan(null);
    setMemorized([]);
    setView("setup");
  }, []);

  const handleStartNewRound = useCallback(() => {
    if (!plan) return;
    // Save best plan record before resetting if this completion is the best
    const days = countActiveDays(plan);
    const pages = countMemorizedPages(plan.memorized, chapters);
    const record: BestPlanRecord = {
      completedAt: todayStr(),
      daysToFinish: days,
      totalPages: pages,
      totalSessions: plan.sessions.length,
    };
    const existing = loadBestPlan();
    if (!existing || days < existing.daysToFinish) {
      saveBestPlan(record);
      setBestPlan(record);
    }
    // Reset all sessions and start fresh from today
    const sessions = plan.sessions.map((s) => ({
      ...s,
      done: false,
      doneDate: undefined,
    }));
    const updated = { ...plan, sessions, createdAt: new Date().toISOString() };
    savePlan(updated);
    setPlan(updated);
    // Wipe the saved read-pages cache so every progress bar resets to 0%.
    clearHifzReadingSession();
    clearHifzReadingSessionAsync().catch(() => {});
    setReadPages([]);
  }, [plan, chapters]);

  const handleEdit = useCallback(() => {
    setView("setup");
  }, []);

  const handleOpenPage = useCallback(
    (page: number, session?: PlanSession) => {
      if (session && plan) {
        // Build a contiguous reading window: from this session through all immediately
        // following sessions whose pages are contiguous (gap === 1 page or less).
        const allSessions = plan.sessions;
        const startIdx = allSessions.findIndex((s) => s.id === session.id);
        const ranges: PageRange[] = [];
        const sessionIds: string[] = [];
        let expectedNext = session.fromPage;
        for (let i = startIdx; i < allSessions.length; i++) {
          const s = allSessions[i];
          if (s.fromPage > expectedNext + 1) break;
          ranges.push({ from: s.fromPage, to: s.toPage });
          sessionIds.push(s.id);
          expectedNext = s.toPage + 1;
        }
        // Preserve previously-read pages so already-read sessions keep their
        // progress bar filled; only the tracked window (ranges/sessionIds) is
        // swapped to the session being opened now.
        const prev = loadHifzReadingSession();
        const carriedReadPages = prev?.readPages ?? [];
        persistHifzReadingSession({ ranges, readPages: carriedReadPages, sessionIds });
        setReadPages(carriedReadPages);
      }
      // Prefer the session's exact start verse (rub'/hizb boundaries fall
      // mid-page); otherwise open at the first verse of the page.
      const startVerse =
        session?.startVerse && session.fromPage === page
          ? session.startVerse
          : getPageStart(page);
      const vParam = startVerse ? `&v=${startVerse.sura}:${startVerse.aya}` : "";
      // Open the reader as a fresh root: it's the main "Quran" tab page and must
      // never go back (no swipe, no hardware back to Hifz). replace swaps the
      // current entry instead of stacking, so there's nothing to go back to.
      history.replace(`/viewer?page=${page}${vParam}`);
    },
    [history, plan],
  );

  // Open the quiz list pre-loaded with this session's page range so the user can
  // quiz themselves on what they just revised. Use replace so the quiz list
  // becomes a fresh root (same as opening it from the Quiz tab) — this prevents
  // the back stack from looping back through Hifz.
  const handleQuizFromSession = useCallback(
    (session: PlanSession) => {
      history.replace(`/quiz-list?fromPage=${session.fromPage}&toPage=${session.toPage}`);
    },
    [history],
  );

  const h = t.hifz;
  const isRTL = lang === "ar";

  // Compute plan stats for header subtitle
  const planDone = plan?.sessions.filter((s) => s.done).length ?? 0;
  const planTotal = plan?.sessions.length ?? 0;
  const sessionsDone = plan?.sessions.filter((s) => s.done).length ?? 0;
  const sessionsTotal = plan?.sessions.length ?? 0;

  const headerTitle =
    view === "sessions" ? h.sessionsAll :
    view === "plan"     ? h.planTitle :
                          h.setupTitle;

  const headerSubtitle =
    view === "sessions"
      ? (lang === "ar" ? `${sessionsDone} / ${sessionsTotal} مكتملة` : `${sessionsDone} / ${sessionsTotal} done`)
      : view === "plan" && plan
      ? (lang === "ar" ? `${planDone} / ${planTotal} مكتملة` : `${planDone} / ${planTotal} done`)
      : h.setupSubtitle;

  // Back: sessions → plan, setup-editing → plan, otherwise → app back
  const handleHeaderBack = () => {
    if (view === "sessions") { setView("plan"); return; }
    if (view === "setup" && plan !== null) { setView("plan"); return; }
    history.replace("/");
  };

  // Right slot: edit + reset on plan view, spacer elsewhere
  const headerRight = view === "plan" ? (
    <div className="hifz-header-right">
      <button
        className="hifz-header-action-btn hifz-header-action-btn--edit"
        onClick={() => setView("setup")}
        aria-label={h.planEdit}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        className="hifz-header-action-btn hifz-header-action-btn--reset"
        onClick={() => setShowResetConfirm(true)}
        aria-label={h.planReset}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
      <button
        className="hifz-header-action-btn hifz-header-action-btn--delete"
        onClick={() => setShowDeleteConfirm(true)}
        aria-label={h.planDelete}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>
  ) : <div className="hifz-header-right" />;

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="hifz-page">
          {/* ── Shared page header ── */}
          <div className="hifz-page-header">
            {(view === "sessions" || (view === "setup" && plan !== null)) ? (
              <button
                className="hifz-back-btn"
                onClick={handleHeaderBack}
                aria-label={isRTL ? "رجوع" : "Back"}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M5 12h14M13 5l7 7-7 7" /> : <path d="M19 12H5M12 5l-7 7 7 7" />}
                </svg>
              </button>
            ) : view === "plan" && plan ? (
              <button
                className="hifz-header-action-btn hifz-header-action-btn--all"
                onClick={() => setView("sessions")}
                aria-label={h.viewAllSessions}
                title={h.viewAllSessions}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" strokeWidth="3" />
                  <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" strokeWidth="3" />
                  <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" strokeWidth="3" />
                </svg>
              </button>
            ) : <div style={{ width: 44 }} />}
            <div className="hifz-page-header-text">
              <h1>{headerTitle}</h1>
              <p>{headerSubtitle}</p>
            </div>
            {headerRight}
          </div>

          {view === "setup" && (
            <SetupView
              memorized={memorized}
              goal={goal}
              onUpdateMemorized={setMemorized}
              onUpdateGoal={setGoal}
              onGenerate={handleGenerate}
              onOpenAddSheet={() => setShowAddSheet(true)}
              lang={lang as "ar" | "en"}
              t={t}
              chapters={chapters}
              isEditing={plan !== null}
            />
          )}
          {view === "plan" && plan && (
            <DashboardView
              plan={plan}
              chapters={chapters}
              onToggleSession={handleToggleSession}
              onReset={handleReset}
              onEdit={handleEdit}
              onOpenPage={handleOpenPage}
              onQuiz={handleQuizFromSession}
              onStartNewRound={handleStartNewRound}
              bestPlan={bestPlan}
              lang={lang as "ar" | "en"}
              t={t}
              readPages={readPages}
              showResetConfirm={showResetConfirm}
              setShowResetConfirm={setShowResetConfirm}
            />
          )}
          {view === "sessions" && plan && (
            <HifzSessionsView
              plan={plan}
              chapters={chapters}
              onToggleSession={handleToggleSession}
              onBack={() => setView("plan")}
              onOpenPage={handleOpenPage}
              onQuiz={handleQuizFromSession}
              lang={lang as "ar" | "en"}
              t={t}
              readPages={readPages}
            />
          )}

          {/* ── Delete-plan confirmation dialog ── */}
          {showDeleteConfirm && (
            <div className="hifz-confirm-backdrop" onClick={() => setShowDeleteConfirm(false)}>
              <div className="hifz-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <p className="hifz-confirm-title">{t.hifz.deleteConfirmTitle}</p>
                <p className="hifz-confirm-body">{t.hifz.deleteConfirmBody}</p>
                <div className="hifz-confirm-actions">
                  <button className="hifz-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>
                    {t.hifz.deleteConfirmNo}
                  </button>
                  <button
                    className="hifz-confirm-yes"
                    onClick={() => { setShowDeleteConfirm(false); handleDeletePlan(); }}
                  >
                    {t.hifz.deleteConfirmYes}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </IonContent>
      {showAddSheet && (
        <AddMemorizedSheet
          onAddMany={(units) => setMemorized((prev) => [...prev, ...units])}
          onClose={() => setShowAddSheet(false)}
          memorized={memorized}
          lang={lang as "ar" | "en"}
          t={t}
          night={isNight}
        />
      )}
      <BottomNavBar active="hifz" fixed />
    </IonPage>
  );
};

export default Hifz;
