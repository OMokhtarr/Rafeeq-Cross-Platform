/**
 * ALARM EDITOR
 * One alarm's settings, shown inside the Alarms sheet in place of the list.
 *
 * The offset is entered as a direction (before / after the prayer) and a
 * size, rather than a signed number: "30 minutes before Fajr" is how the
 * alarm is thought of, and a minus sign is easy to miss on a phone. The
 * native side previews the next ring as the fields change, so the user sees
 * the actual clock time they are setting, not only its distance from a
 * prayer.
 */

import React, { useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import { previewAlarm } from "../../core/services/prayer/prayer-alarms.service";
import {
  MAX_OFFSET,
  WEEK_FROM_SATURDAY,
  type PrayerAlarm,
} from "../../core/services/prayer/prayer-alarms.types";
import { formatWhen } from "./alarmFormat";

interface Props {
  alarm: PrayerAlarm;
  isNew: boolean;
  error: string | null;
  saving: boolean;
  onSave: (alarm: PrayerAlarm) => void;
  onDelete: () => void;
}

const STEPS = [-5, -1, 1, 5];
const PREVIEW_DELAY_MS = 250;

const AlarmEditor: React.FC<Props> = ({ alarm, isNew, error, saving, onSave, onDelete }) => {
  const { t, lang } = useLang();
  const s = t.prayerAlarms;

  const [direction, setDirection] = useState<"before" | "after">(
    alarm.offsetMinutes > 0 ? "after" : "before"
  );
  const [minutes, setMinutes] = useState(Math.abs(alarm.offsetMinutes));
  const [typing, setTyping] = useState(false);
  const [label, setLabel] = useState(alarm.label);
  const [days, setDays] = useState<number[]>(alarm.days);
  const [ramadanOnly, setRamadanOnly] = useState(alarm.ramadanOnly);
  const [next, setNext] = useState<Date | null | undefined>(undefined);

  const draft: PrayerAlarm = {
    ...alarm,
    offsetMinutes: direction === "before" ? -minutes : minutes,
    label: label.trim(),
    days,
    ramadanOnly,
    // Saving from the editor means the alarm is wanted, so it is switched on.
    enabled: true,
  };

  // Re-previewed after typing settles, not on every keystroke.
  const previewKey = `${draft.offsetMinutes}|${days.join(",")}|${ramadanOnly}`;
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      previewAlarm(draft)
        .then((at) => live && setNext(at))
        .catch(() => live && setNext(null));
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // Keyed on previewKey, not draft: draft is a new object every render.
  }, [previewKey]);

  const num = (n: number | string) => (lang === "ar" ? toHindiNumbers(n) : String(n));
  const hm = `${num(Math.floor(minutes / 60))}:${num(String(minutes % 60).padStart(2, "0"))}`;

  const step = (delta: number) =>
    setMinutes((m) => Math.min(MAX_OFFSET, Math.max(0, m + delta)));

  const toggleDay = (d: number) =>
    setDays((current) => {
      if (!current.includes(d)) return [...current, d].sort();
      // At least one day stays chosen: an alarm with no days would never
      // ring, and switching it off is how to silence it.
      return current.length === 1 ? current : current.filter((x) => x !== d);
    });

  return (
    <div className="as-editor">
      <div className="as-field">
        <div className="as-seg" role="group" aria-label={s.atPrayer}>
          {(["before", "after"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className={"as-seg-btn" + (direction === dir && minutes > 0 ? " is-active" : "")}
              aria-pressed={direction === dir && minutes > 0}
              onClick={() => setDirection(dir)}
            >
              {s[dir]}
            </button>
          ))}
        </div>

        <div className="as-stepper">
          {STEPS.slice(0, 2).map((d) => (
            <button
              key={d}
              type="button"
              className="as-step"
              aria-label={s.decrease}
              data-step={Math.abs(d)}
              onClick={() => step(d)}
              disabled={minutes === 0}
            >
              −{num(Math.abs(d))}
            </button>
          ))}

          {typing ? (
            <input
              className="as-minutes-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_OFFSET}
              autoFocus
              aria-label={s.minutes}
              defaultValue={minutes}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                setMinutes(Number.isNaN(v) ? minutes : Math.min(MAX_OFFSET, Math.max(0, v)));
                setTyping(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <button
              type="button"
              className="as-minutes"
              aria-label={s.minutes}
              onClick={() => setTyping(true)}
            >
              {minutes === 0 ? s.atPrayer : hm}
            </button>
          )}

          {STEPS.slice(2).map((d) => (
            <button
              key={d}
              type="button"
              className="as-step"
              aria-label={s.increase}
              data-step={d}
              onClick={() => step(d)}
              disabled={minutes === MAX_OFFSET}
            >
              +{num(d)}
            </button>
          ))}
        </div>
        <p className="as-hint">{s.offsetHint}</p>

        <p className="as-preview" aria-live="polite">
          {next === undefined
            ? " "
            : next === null
            ? s.neverRings
            : s.rings.replace("{when}", formatWhen(next, new Date(), lang, s))}
        </p>
      </div>

      <label className="as-field">
        <span className="as-field-label">{s.label}</span>
        <input
          className="as-text"
          type="text"
          maxLength={40}
          value={label}
          placeholder={s.labelPlaceholder}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>

      <div className="as-field">
        <span className="as-field-label">{s.repeat}</span>
        <div className="as-days" role="group" aria-label={s.repeat}>
          {WEEK_FROM_SATURDAY.map((d) => (
            <button
              key={d}
              type="button"
              className={"as-day" + (days.includes(d) ? " is-active" : "")}
              aria-pressed={days.includes(d)}
              aria-label={s.dayNames[d - 1]}
              onClick={() => toggleDay(d)}
            >
              {s.dayChips[d - 1]}
            </button>
          ))}
        </div>
      </div>

      <div className="sts-row as-switch-row">
        <span className="as-switch-text">
          <span className="sts-row-label">{s.ramadanOnly}</span>
          <span className="as-hint">{s.ramadanOnlyDesc}</span>
        </span>
        <label className="sts-toggle">
          <input
            type="checkbox"
            checked={ramadanOnly}
            onChange={() => setRamadanOnly((v) => !v)}
            aria-label={s.ramadanOnly}
          />
          <span className="sts-toggle-slider" />
        </label>
      </div>

      {error && (
        <p className="as-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="as-primary"
        disabled={saving}
        onClick={() => onSave(draft)}
      >
        {s.save}
      </button>

      {!isNew && (
        <button type="button" className="as-danger" disabled={saving} onClick={onDelete}>
          {s.delete}
        </button>
      )}
    </div>
  );
};

export default AlarmEditor;
