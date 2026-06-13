import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useHistory } from "react-router-dom";
import { IonPage, IonContent } from "@ionic/react";
import { useLang } from "../../core/context/LanguageContext";
import { useTheme } from "../../core/context/ThemeContext";
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  loadPlan,
  savePlan,
  clearPlan,
  generateSessions,
  juzToPages,
  countMemorizedPages,
  computeStreak,
  HifzPlan,
  HifzGoal,
  MemorizedUnit,
  PlanSession,
  SessionUnit,
  unitToPageCount,
} from "./hifz.service";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
  getSurahStartPage,
  getSurahEndPage,
  initMetadata,
} from "../../core/services/data/metadata.service";
import "./Hifz.css";

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  return (
    <div className="hifz-sheet-backdrop" onClick={onClose}>
      <div
        className="hifz-sheet"
        onClick={(e) => e.stopPropagation()}
        dir={lang === "ar" ? "rtl" : "ltr"}
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
}) => {
  const h = t.hifz;

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

  const canGenerate = memorized.length > 0 && goal.quantity >= 1;

  return (
    <div className="hifz-setup" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="hifz-setup-header">
        <h1 className="hifz-title">{h.setupTitle}</h1>
        <p className="hifz-subtitle">{h.setupSubtitle}</p>
      </div>

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
            value={goal.quantity}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onUpdateGoal({ ...goal, quantity: isNaN(v) || v < 1 ? 1 : v });
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
        {h.generatePlan}
      </button>

    </div>
  );
};

// ─── Sub-component: SessionCard ──────────────────────────────────────────────

interface SessionCardProps {
  session: PlanSession;
  variant: "next" | "remaining" | "done";
  onToggle: (id: string) => void;
  onOpenPage: (page: number) => void;
  lang: "ar" | "en";
  h: any;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session: s,
  variant,
  onToggle,
  onOpenPage,
  lang,
  h,
}) => (
  <div className={`hifz-session hifz-session-${variant}`}>
    <div className="hifz-session-body">
      <div className="hifz-session-info">
        <span className="hifz-session-label">{h.planSession(s.label)}</span>
        <span className="hifz-session-pages">
          {lang === "ar"
            ? `ص ${s.fromPage} – ${s.toPage}`
            : `Pg. ${s.fromPage}–${s.toPage}`}
        </span>
        {s.doneDate && <span className="hifz-session-date">{s.doneDate}</span>}
      </div>
      <div className="hifz-session-actions">
        <button
          className="hifz-session-open-btn"
          onClick={() => onOpenPage(s.fromPage)}
          aria-label={h.openInQuran}
          title={h.openInQuran}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="18"
            height="18"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </button>
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
    <div className="hifz-session-bar-track">
      <div
        className="hifz-session-bar-fill"
        style={{ width: s.done ? "100%" : "0%" }}
      />
    </div>
  </div>
);

// ─── Sub-component: DashboardView ────────────────────────────────────────────

interface DashboardViewProps {
  plan: HifzPlan;
  chapters: any[];
  onToggleSession: (id: string) => void;
  onReset: () => void;
  onEdit: () => void;
  onOpenPage: (page: number) => void;
  onViewAllSessions: () => void;
  lang: "ar" | "en";
  t: any;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  plan,
  chapters,
  onToggleSession,
  onReset,
  onEdit,
  onOpenPage,
  onViewAllSessions,
  lang,
  t,
}) => {
  const h = t.hifz;
  const sessions = plan.sessions;
  const doneSessions = sessions.filter((s) => s.done).length;
  const totalSessions = sessions.length;
  const planPct = totalSessions ? (doneSessions / totalSessions) * 100 : 0;
  const memorizedPages = countMemorizedPages(plan.memorized, chapters);
  const quranPct = (memorizedPages / 604) * 100;
  const streak = computeStreak(sessions);

  const incomplete = sessions.filter((s) => !s.done);
  const nextSession = incomplete[0] ?? null;
  const comingUpSession = incomplete[1] ?? null;
  const doneList = sessions.filter((s) => s.done);
  const lastDoneSession = doneList[doneList.length - 1] ?? null;

  return (
    <div className="hifz-plan" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="hifz-plan-header">
        <h1 className="hifz-title">{h.planTitle}</h1>
        <div className="hifz-plan-header-actions">
          <button className="hifz-edit-btn" onClick={onEdit} aria-label={h.planEdit}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="hifz-reset-btn" onClick={onReset} aria-label={h.planReset}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.48" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Hero card with charts ── */}
      <div className="hifz-hero-card">
        <DonutChart
          percent={quranPct}
          color="var(--color-hifz, #4a7c59)"
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
          <span className="hifz-stat-num">{plan.goal.quantity ?? plan.goal.pagesPerSession ?? 5}</span>
          <span className="hifz-stat-lbl">
            {plan.goal.unit === "rub" ? h.unitRub : plan.goal.unit === "hizb" ? h.unitHizb : plan.goal.unit === "juz" ? h.unitJuz : h.unitPages}
            {" "}{h.pagesPerSession}
          </span>
        </div>
        <div className="hifz-stat-chip hifz-stat-chip-streak">
          <div className="hifz-stat-icon hifz-stat-icon-streak">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C8 7 6 10 6 14a6 6 0 0 0 12 0c0-4-2-7-6-12zm0 18a4 4 0 0 1-4-4c0-2.5 1-4.5 4-8 3 3.5 4 5.5 4 8a4 4 0 0 1-4 4z" />
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
        <div className="hifz-all-done-banner">
          {lang === "ar" ? "🎉 أحسنت! اكتملت جميع الجلسات" : "🎉 Well done! All sessions complete"}
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
                lang={lang}
                h={h}
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
                lang={lang}
                h={h}
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
                lang={lang}
                h={h}
              />
            </div>
          )}
        </div>
      )}

      {/* ── View all sessions ── */}
      <button className="hifz-all-sessions-btn" onClick={onViewAllSessions}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" strokeWidth="3" />
          <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" strokeWidth="3" />
          <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" strokeWidth="3" />
        </svg>
        {h.viewAllSessions} ({totalSessions})
      </button>
    </div>
  );
};

// ─── Sub-component: HifzSessionsView ────────────────────────────────────────

interface HifzSessionsViewProps {
  plan: HifzPlan;
  onToggleSession: (id: string) => void;
  onBack: () => void;
  onOpenPage: (page: number) => void;
  lang: "ar" | "en";
  t: any;
}

const HifzSessionsView: React.FC<HifzSessionsViewProps> = ({
  plan,
  onToggleSession,
  onBack,
  onOpenPage,
  lang,
  t,
}) => {
  const h = t.hifz;
  const sessions = plan.sessions;
  const doneCount = sessions.filter((s) => s.done).length;
  const total = sessions.length;

  const getVariant = (s: PlanSession): "next" | "remaining" | "done" => {
    if (s.done) return "done";
    const firstIncomplete = sessions.find((x) => !x.done);
    return firstIncomplete?.id === s.id ? "next" : "remaining";
  };

  return (
    <div className="hifz-sessions-view" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="hifz-sessions-header">
        <button className="hifz-back-btn" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            width="20"
            height="20"
            style={{ transform: lang === "ar" ? "scaleX(-1)" : "none" }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="hifz-sessions-header-text">
          <h1 className="hifz-sessions-title">{h.sessionsAll}</h1>
          <span className="hifz-sessions-count">
            {lang === "ar"
              ? `${doneCount} / ${total} مكتملة`
              : `${doneCount} / ${total} done`}
          </span>
        </div>
      </div>

      <div className="hifz-sessions-list">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            variant={getVariant(s)}
            onToggle={onToggleSession}
            onOpenPage={onOpenPage}
            lang={lang}
            h={h}
          />
        ))}
      </div>
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

  const [memorized, setMemorized] = useState<MemorizedUnit[]>([]);
  const [goal, setGoal] = useState<HifzGoal>({
    quantity: 5,
    unit: "pages",
  });

  useEffect(() => {
    initMetadata().then(() => {
      setChapters(getChapters());
    });
    const saved = loadPlan();
    if (saved) {
      setPlan(saved);
      setMemorized(saved.memorized);
      setGoal(saved.goal);
      setView("plan");
    }
  }, []);

  const handleGenerate = useCallback(() => {
    const sessions = generateSessions(memorized, goal, chapters);
    const newPlan: HifzPlan = {
      memorized,
      goal,
      sessions,
      createdAt: new Date().toISOString(),
    };
    savePlan(newPlan);
    setPlan(newPlan);
    setView("plan");
  }, [memorized, goal, chapters]);

  const handleToggleSession = useCallback(
    (id: string) => {
      if (!plan) return;
      const today = todayStr();
      const sessions = plan.sessions.map((s) =>
        s.id === id
          ? { ...s, done: !s.done, doneDate: !s.done ? today : undefined }
          : s,
      );
      const updated = { ...plan, sessions };
      savePlan(updated);
      setPlan(updated);
    },
    [plan],
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
  }, [plan]);

  const handleEdit = useCallback(() => {
    setView("setup");
  }, []);

  const handleOpenPage = useCallback(
    (page: number) => {
      history.push(`/viewer?page=${page}`);
    },
    [history],
  );

  return (
    <IonPage>
      <IonContent>
        <div className="hifz-page">
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
              onViewAllSessions={() => setView("sessions")}
              lang={lang as "ar" | "en"}
              t={t}
            />
          )}
          {view === "sessions" && plan && (
            <HifzSessionsView
              plan={plan}
              onToggleSession={handleToggleSession}
              onBack={() => setView("plan")}
              onOpenPage={handleOpenPage}
              lang={lang as "ar" | "en"}
              t={t}
            />
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
