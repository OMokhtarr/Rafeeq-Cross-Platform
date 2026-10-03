/**
 * SWITCH
 * Rafeeq's on/off switch — the one Settings has always used: a grey track
 * that turns the app's green when on. Shared so every page's switches look
 * and behave alike instead of each page drawing its own.
 *
 * A real checkbox with role="switch" underneath, so screen readers announce
 * it as a switch and keyboard Space toggles it. Styles live in
 * src/styles/controls.css.
 */

import React from "react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read out by screen readers; the visible label sits beside the switch. */
  label: string;
  disabled?: boolean;
}

export const Switch: React.FC<Props> = ({ checked, onChange, label, disabled }) => (
  <label className={"rf-switch" + (disabled ? " is-disabled" : "")}>
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="rf-switch-track" aria-hidden="true" />
  </label>
);
