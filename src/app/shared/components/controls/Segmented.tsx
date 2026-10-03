/**
 * SEGMENTED
 * A row of pill options with one chosen, filled with the app's green — the
 * look of Hifz's mode tabs. For short, mutually exclusive choices (snooze
 * length, before/after) where a dropdown would hide the options.
 *
 * Each option is a button with aria-pressed; `value: null` shows none chosen.
 * Styles live in src/styles/controls.css.
 */

import React from "react";

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** Sized to its content rather than the full row, for use beside a label. */
  compact?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  compact,
}: Props<T>): React.ReactElement {
  return (
    <div className={"rf-seg" + (compact ? " rf-seg--compact" : "")} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"rf-seg-btn" + (o.value === value ? " is-active" : "")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
