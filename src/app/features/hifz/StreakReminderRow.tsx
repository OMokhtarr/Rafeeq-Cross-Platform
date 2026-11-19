/**
 * STREAK REMINDER ROW
 * The daily hifz-streak reminder in the Hifz page's streak panel: a switch
 * and the time it fires, which opens the phone's own time picker.
 * Renders nothing off-device, where reminders do not exist.
 */

import React, { useRef } from "react";
import { STRINGS, type Lang } from "../../core/i18n/strings";
import { Switch } from "../../shared/components/controls/Switch";
import { formatClock } from "../prayer-times/alarmFormat";
import { useStreakReminder } from "./useStreakReminder";
import "./StreakReminderRow.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** 1260 → "21:00", the value an `<input type="time">` takes. */
const toInputValue = (minuteOfDay: number) =>
  `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;

/** "07:45" → 465; null for an empty or malformed value. */
const fromInputValue = (value: string): number | null => {
  const m = value.match(/^(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

interface TimeProps {
  minuteOfDay: number;
  lang: Lang;
  label: string;
  onChange: (minuteOfDay: number) => void;
}

/**
 * The time as a tappable button over a hidden time input, so it reads like
 * the app's other times but picks with the system's picker.
 */
export const StreakReminderTime: React.FC<TimeProps> = ({ minuteOfDay, lang, label, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const shown = formatClock(
    new Date(2026, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60),
    lang,
  );

  const open = () => {
    const el = input.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.click();
    }
  };

  return (
    <span className="streak-reminder-time">
      <button type="button" className="streak-reminder-time-btn" onClick={open} aria-label={`${label} ${shown}`}>
        {shown}
      </button>
      <input
        ref={input}
        type="time"
        step={60}
        className="streak-reminder-time-input"
        tabIndex={-1}
        aria-hidden="true"
        value={toInputValue(minuteOfDay)}
        onChange={(e) => {
          const minute = fromInputValue(e.target.value);
          if (minute !== null) onChange(minute);
        }}
      />
    </span>
  );
};

const StreakReminderRow: React.FC<{ lang: Lang }> = ({ lang }) => {
  const h = STRINGS[lang].hifz;
  const r = useStreakReminder();
  if (!r.visible) return null;

  return (
    <div className="streak-reminder">
      <div className="streak-reminder-row">
        <span className="streak-reminder-label">{h.streakReminder}</span>
        <Switch
          checked={r.enabled}
          label={h.streakReminder}
          onChange={(on) => {
            void r.toggle(on);
          }}
        />
      </div>
      <div className="streak-reminder-row">
        <span className="streak-reminder-label streak-reminder-label--muted">{h.streakReminderAt}</span>
        <StreakReminderTime
          minuteOfDay={r.minuteOfDay}
          lang={lang}
          label={h.streakReminderAt}
          onChange={(m) => {
            void r.setMinute(m);
          }}
        />
      </div>
      {r.denied && (
        <p className="streak-reminder-denied">{STRINGS[lang].settings.notificationsDenied}</p>
      )}
    </div>
  );
};

export default StreakReminderRow;
