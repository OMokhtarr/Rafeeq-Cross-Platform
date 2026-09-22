/**
 * ADVANCED RANGE PICKER
 *
 * Builds a quiz scope from a mixed list of juz, surahs and page spans, and
 * manages the shared library of saved sets.
 *
 * The range list and the save decision are owned by the parent setup page,
 * which is what actually starts the quiz; this component only edits them. That
 * split is what lets all three setups share it without branching.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useIonToast } from "@ionic/react";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../../../core/services/data/metadata.service";
import { toHindiNumbers as toHindi } from "../../../../core/utils/arabic.util";
import { useLang } from "../../../../core/context/LanguageContext";
import InlineSelect from "../../../../shared/components/inline-select/InlineSelect";
import type {
  QuizRange,
  QuizRangePreset,
} from "../../../../shared/models/verse.model";
import {
  rangeKey,
  rangeLabel,
  deriveName,
  type RangeLabels,
} from "../../services/quiz-range-format";
import { normalizeRanges } from "../../services/quiz-ranges.service";
import {
  listPresets,
  deletePreset,
  restorePreset,
  renamePreset,
} from "../../services/quiz-presets.service";
import "./AdvancedRangePicker.css";

export type SaveIntent =
  | { mode: "none" }
  | { mode: "new"; name: string }
  | { mode: "update"; id: string; name: string };

interface Props {
  ranges: QuizRange[];
  onRangesChange: (ranges: QuizRange[]) => void;
  saveIntent: SaveIntent;
  onSaveIntentChange: (intent: SaveIntent) => void;
}

type AddKind = "juz" | "surah" | "pages";

const JUZS = Array.from({ length: 30 }, (_, i) => i + 1);

const AdvancedRangePicker: React.FC<Props> = ({
  ranges,
  onRangesChange,
  saveIntent,
  onSaveIntentChange,
}) => {
  const { t, isRTL } = useLang();
  const tq = t.quizSetup;
  const [presentToast] = useIonToast();

  const [addKind, setAddKind] = useState<AddKind>("juz");
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(10);
  const [presets, setPresets] = useState<QuizRangePreset[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");

  const toNum = useCallback(
    (n: number) => (isRTL ? toHindi(n) : String(n)),
    [isRTL],
  );

  const labels: RangeLabels = useMemo(
    () => ({
      juzWord: tq.juzWord,
      pageWord: tq.pageWord,
      others: tq.othersWord,
      juzPlural: tq.juzPlural,
      surahPlural: tq.surahPlural,
      pagePlural: tq.pagePlural,
      surahName: (n: number) =>
        isRTL ? getSurahNameArabic(n) : getSurahNameEnglish(n),
      toNum,
    }),
    [tq, isRTL, toNum],
  );

  const refreshPresets = useCallback(async () => {
    setPresets(await listPresets());
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const surahNames = useMemo(() => {
    const chapters = getChapters();
    return chapters.map((ch, i) => ({
      num: i + 1,
      arabic: ch.name_arabic,
      english: getSurahNameEnglish(i + 1),
    }));
  }, []);

  const pageOptions = useMemo(
    () =>
      Array.from({ length: 604 }, (_, i) => ({
        value: String(i + 1),
        label: toNum(i + 1),
      })),
    [toNum],
  );

  /** Append a range, or shake the existing row when it is already there. */
  const addRange = (range: QuizRange) => {
    const key = rangeKey(range);
    if (ranges.some((r) => rangeKey(r) === key)) {
      setShakeKey(key);
      window.setTimeout(() => setShakeKey(null), 400);
      return;
    }
    onRangesChange(normalizeRanges([...ranges, range]));
  };

  const removeRange = (key: string) =>
    onRangesChange(ranges.filter((r) => rangeKey(r) !== key));

  const loadPreset = (preset: QuizRangePreset) => {
    onRangesChange(normalizeRanges(preset.ranges));
    setLoadedId(preset.id);
    onSaveIntentChange({ mode: "none" });
  };

  const handleDelete = async (preset: QuizRangePreset) => {
    await deletePreset(preset.id);
    if (loadedId === preset.id) setLoadedId(null);
    await refreshPresets();
    presentToast({
      message: tq.deletedToast,
      duration: 5000,
      buttons: [
        {
          text: tq.undo,
          handler: () => {
            restorePreset(preset).then(refreshPresets);
          },
        },
      ],
    });
  };

  const commitRename = async (id: string) => {
    setRenaming(false);
    const next = renameText.trim();
    if (!next) return;
    await renamePreset(id, next);
    await refreshPresets();
  };

  const loadedPreset = presets.find((p) => p.id === loadedId) ?? null;

  // A loaded set that has not been touched has nothing to save.
  const isUnchangedFromLoaded =
    loadedPreset !== null &&
    loadedPreset.ranges.length === ranges.length &&
    loadedPreset.ranges.every((r, i) => rangeKey(r) === rangeKey(ranges[i]));

  const canSave = ranges.length > 0 && !isUnchangedFromLoaded;

  const suggestedName = useMemo(
    () =>
      deriveName(
        ranges,
        labels,
        presets.map((p) => p.name),
      ),
    [ranges, labels, presets],
  );

  const toggleSave = (checked: boolean) => {
    if (!checked) {
      onSaveIntentChange({ mode: "none" });
      return;
    }
    onSaveIntentChange(
      loadedPreset
        ? { mode: "update", id: loadedPreset.id, name: loadedPreset.name }
        : { mode: "new", name: suggestedName },
    );
  };

  const pageCount = ranges.reduce(
    (sum, r) => (r.kind === "pages" ? sum + (r.to - r.from + 1) : sum),
    0,
  );

  return (
    <div className="arp-root" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Zone 1: the list being built ── */}
      <div className="arp-section">
        <div className="arp-label">
          {tq.yourRanges}
          {ranges.length > 0 && (
            <span className="arp-count">{toNum(ranges.length)}</span>
          )}
        </div>

        {ranges.length === 0 ? (
          <p className="arp-hint">{tq.noRangesHint}</p>
        ) : (
          <ul className="arp-range-list">
            {ranges.map((r) => {
              const key = rangeKey(r);
              return (
                <li
                  key={key}
                  className={`arp-range-row${shakeKey === key ? " shake" : ""}`}
                >
                  <span className={`arp-spine arp-spine-${r.kind}`} />
                  <span className="arp-range-text">{rangeLabel(r, labels)}</span>
                  <button
                    className="arp-range-remove"
                    onClick={() => removeRange(key)}
                    aria-label={tq.removeRange}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {ranges.length > 0 && (
          <p className="arp-totals">
            {tq.rangeTotals}: {toNum(ranges.length)}
            {pageCount > 0 && ` · ${toNum(pageCount)} ${tq.pagePlural}`}
          </p>
        )}

        {/* Save is a checkbox, applied on Start — not a button. */}
        {canSave && (
          <div className="arp-save-row">
            <label className="arp-save-check">
              <input
                type="checkbox"
                checked={saveIntent.mode !== "none"}
                onChange={(e) => toggleSave(e.target.checked)}
              />
              <span>{tq.saveThisSet}</span>
            </label>

            {saveIntent.mode !== "none" && (
              <>
                {loadedPreset && (
                  <div className="arp-save-mode">
                    <button
                      className={`arp-save-mode-btn${saveIntent.mode === "update" ? " active" : ""}`}
                      onClick={() =>
                        onSaveIntentChange({
                          mode: "update",
                          id: loadedPreset.id,
                          name: loadedPreset.name,
                        })
                      }
                    >
                      {tq.updateSet}
                    </button>
                    <button
                      className={`arp-save-mode-btn${saveIntent.mode === "new" ? " active" : ""}`}
                      onClick={() =>
                        onSaveIntentChange({ mode: "new", name: suggestedName })
                      }
                    >
                      {tq.saveAsNew}
                    </button>
                  </div>
                )}
                {saveIntent.mode === "new" && (
                  <input
                    className="arp-save-name"
                    value={saveIntent.name}
                    onChange={(e) =>
                      onSaveIntentChange({ mode: "new", name: e.target.value })
                    }
                    aria-label={tq.saveThisSet}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Zone 2: add a range ── */}
      <div className="arp-section">
        <div className="arp-label">{tq.addRange}</div>
        <div className="arp-kind-row">
          {[
            { key: "juz" as const, label: tq.scopeJuz },
            { key: "surah" as const, label: tq.scopeSurah },
            { key: "pages" as const, label: tq.scopePages },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`arp-kind-btn${addKind === opt.key ? " active" : ""}`}
              onClick={() => setAddKind(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {addKind === "juz" && (
          <div className="arp-juz-grid">
            {JUZS.map((j) => {
              const added = ranges.some(
                (r) => r.kind === "juz" && r.juz === j,
              );
              return (
                <button
                  key={j}
                  className={`arp-juz-chip${added ? " added" : ""}`}
                  onClick={() => addRange({ kind: "juz", juz: j })}
                >
                  <span className="arp-juz-label">{tq.juzWord}</span>
                  <span className="arp-juz-num">{toNum(j)}</span>
                </button>
              );
            })}
          </div>
        )}

        {addKind === "surah" && (
          <div className="arp-surah-grid">
            {surahNames.map((s) => {
              const added = ranges.some(
                (r) => r.kind === "surah" && r.surah === s.num,
              );
              return (
                <button
                  key={s.num}
                  className={`arp-surah-chip${added ? " added" : ""}`}
                  onClick={() => addRange({ kind: "surah", surah: s.num })}
                >
                  <span className="arp-chip-text">
                    {isRTL ? (
                      <>
                        <span className="arp-chip-name" lang="ar" dir="rtl">
                          {s.arabic}
                        </span>
                        <span className="arp-chip-en">{s.english}</span>
                      </>
                    ) : (
                      <>
                        <span className="arp-chip-en">{s.english}</span>
                        <span className="arp-chip-name" lang="ar" dir="rtl">
                          {s.arabic}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="arp-chip-num">{toNum(s.num)}</span>
                </button>
              );
            })}
          </div>
        )}

        {addKind === "pages" && (
          <div className="arp-page-bar">
            <div className="arp-page-row">
              <div className="arp-page-input">
                <span>{tq.from}</span>
                <InlineSelect
                  value={String(pageFrom)}
                  options={pageOptions}
                  onChange={(v) => {
                    const n = Number(v);
                    setPageFrom(n);
                    if (n > pageTo) setPageTo(n);
                  }}
                  fullWidth
                />
              </div>
              <div className="arp-page-input">
                <span>{tq.to}</span>
                <InlineSelect
                  value={String(pageTo)}
                  options={pageOptions.filter(
                    (o) => Number(o.value) >= pageFrom,
                  )}
                  onChange={(v) => setPageTo(Number(v))}
                  fullWidth
                />
              </div>
            </div>
            <button
              className="arp-page-add"
              onClick={() =>
                addRange({ kind: "pages", from: pageFrom, to: pageTo })
              }
            >
              {tq.addPageRange}
            </button>
          </div>
        )}
      </div>

      {/* ── Zone 3: saved sets ── */}
      {presets.length > 0 && (
        <div className="arp-section">
          <div className="arp-label">{tq.savedSets}</div>
          <div className="arp-preset-row">
            {presets.map((p) => {
              const isLoaded = p.id === loadedId;
              return (
                <div
                  key={p.id}
                  className={`arp-preset-chip${isLoaded ? " loaded" : ""}`}
                >
                  {isLoaded && renaming ? (
                    <input
                      className="arp-preset-rename"
                      value={renameText}
                      autoFocus
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => commitRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(p.id);
                      }}
                      aria-label={tq.renameSet}
                    />
                  ) : (
                    <button
                      className="arp-preset-name"
                      onClick={() => {
                        // First tap loads; only the loaded chip opens rename,
                        // so a plain tap never means two things at once.
                        if (isLoaded) {
                          setRenameText(p.name);
                          setRenaming(true);
                        } else {
                          loadPreset(p);
                        }
                      }}
                    >
                      {p.name}
                    </button>
                  )}
                  <button
                    className="arp-preset-delete"
                    onClick={() => handleDelete(p)}
                    aria-label={tq.deleteSet}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedRangePicker;
