/**
 * SETTINGS PAGE
 * App-wide preferences: display, language, recitation, quiz, notifications.
 *
 * - Theme (day/night) is managed by ThemeContext and persisted there.
 * - Language (ar/en) is managed by LanguageContext and persisted there.
 * - All other prefs are persisted to localStorage under STORAGE_KEY.
 */

import React, { useState, useEffect } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useTheme } from "../../core/context/ThemeContext";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  MUSHAFS,
  DEFAULT_MUSHAF,
  type MushafKind,
} from "../../core/services/api/mushaf.config";
import "./Settings.css";

// ── Types ────────────────────────────────────────────────────────────────────
interface AppSettings {
  // Display
  arabicFontSize: number; // 14–32
  showTransliteration: boolean;
  // Quran
  mushaf: MushafKind;
  reciter: string;
  /** Translation edition identifier (e.g. "en.asad" or numeric id as string). Empty = none. */
  translation: string;
  /** Whether the PageViewer should render the translation panel. */
  showTranslation: boolean;
  showTajweedColors: boolean;
  autoNextPage: boolean;
  // Quiz
  quizDifficulty: string;
  showHintsDefault: boolean;
  soundEffects: boolean;
  // Azkar
  azkarVibration: boolean;
  azkarCounterSound: boolean;
  // Notifications (future)
  prayerReminders: boolean;
  azkarReminders: boolean;
}

const DEFAULTS: AppSettings = {
  arabicFontSize: 22,
  showTransliteration: false,
  mushaf: DEFAULT_MUSHAF,
  reciter: "husary",
  translation: "",
  showTranslation: false,
  showTajweedColors: true,
  autoNextPage: false,
  quizDifficulty: "medium",
  showHintsDefault: true,
  soundEffects: true,
  azkarVibration: true,
  azkarCounterSound: false,
  prayerReminders: false,
  azkarReminders: false,
};

const STORAGE_KEY = "rafiq_settings_v1";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULTS, ...JSON.parse(raw) } as AppSettings;
      // Migrate retired mushaf kinds (e.g. "qpc_v1") to the current default.
      if (!(merged.mushaf in MUSHAFS)) merged.mushaf = DEFAULT_MUSHAF;
      return merged;
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Notify same-tab listeners (the `storage` event only fires cross-tab).
    // MushafPage subscribes to this so toggles like "Tajweed colors" take
    // effect without leaving the Settings screen.
    window.dispatchEvent(new CustomEvent("rafiq-settings-changed"));
  } catch (_) {}
}

// ── Icon set ──────────────────────────────────────────────────────────────────
const SvgIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const ICONS = {
  fontSize: (
    <SvgIcon>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </SvgIcon>
  ),
  moon: (
    <SvgIcon>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </SvgIcon>
  ),
  type: (
    <SvgIcon>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </SvgIcon>
  ),
  globe: (
    <SvgIcon>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
    </SvgIcon>
  ),
  mic: (
    <SvgIcon>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </SvgIcon>
  ),
  palette: (
    <SvgIcon>
      <circle cx="13.5" cy="6.5" r="1" />
      <circle cx="17.5" cy="10.5" r="1" />
      <circle cx="8.5" cy="7.5" r="1" />
      <circle cx="6.5" cy="12.5" r="1" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-10-10-10z" />
    </SvgIcon>
  ),
  book: (
    <SvgIcon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </SvgIcon>
  ),
  trophy: (
    <SvgIcon>
      <path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
      <path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
      <path d="M6 4h12v6a6 6 0 0 1-12 0V4z" />
      <line x1="12" y1="15" x2="12" y2="20" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </SvgIcon>
  ),
  bulb: (
    <SvgIcon>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z" />
    </SvgIcon>
  ),
  speaker: (
    <SvgIcon>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </SvgIcon>
  ),
  vibrate: (
    <SvgIcon>
      <rect x="8" y="3" width="8" height="18" rx="1" />
      <line x1="3" y1="9" x2="3" y2="15" />
      <line x1="21" y1="9" x2="21" y2="15" />
    </SvgIcon>
  ),
  bell: (
    <SvgIcon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </SvgIcon>
  ),
  mosque: (
    <SvgIcon>
      <path d="M3 21V12a9 9 0 0 1 18 0v9" />
      <path d="M12 3v3" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
    </SvgIcon>
  ),
  beads: (
    <SvgIcon>
      <circle cx="12" cy="5" r="2" />
      <circle cx="18" cy="9" r="2" />
      <circle cx="18" cy="15" r="2" />
      <circle cx="12" cy="19" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="6" cy="9" r="2" />
    </SvgIcon>
  ),
  refresh: (
    <SvgIcon>
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
      <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14" />
    </SvgIcon>
  ),
};

// ── Sub-components ────────────────────────────────────────────────────────────
interface ToggleRowProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
const ToggleRow: React.FC<ToggleRowProps> = ({
  icon,
  label,
  desc,
  checked,
  onChange,
}) => (
  <div className="settings-row">
    <div className="settings-row-info">
      <span className="settings-row-icon">{icon}</span>
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {desc && <p className="settings-row-desc">{desc}</p>}
      </div>
    </div>
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-slider" />
    </label>
  </div>
);

interface SelectRowProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}
const SelectRow: React.FC<SelectRowProps> = ({
  icon,
  label,
  desc,
  value,
  options,
  onChange,
}) => (
  <div className="settings-row">
    <div className="settings-row-info">
      <span className="settings-row-icon">{icon}</span>
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {desc && <p className="settings-row-desc">{desc}</p>}
      </div>
    </div>
    <select
      className="settings-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

interface SliderRowProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}
const SliderRow: React.FC<SliderRowProps> = ({
  icon,
  label,
  desc,
  value,
  min,
  max,
  unit,
  onChange,
}) => (
  <div className="settings-row settings-row-slider">
    <div className="settings-row-info">
      <span className="settings-row-icon">{icon}</span>
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {desc && <p className="settings-row-desc">{desc}</p>}
      </div>
    </div>
    <div className="settings-slider-wrap" dir="ltr">
      <input
        type="range"
        className="settings-slider"
        min={min}
        max={max}
        step={1}
        value={value}
        // Force LTR direction so dragging right always increases the value,
        // regardless of the page's RTL document direction.
        dir="ltr"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="settings-slider-val">
        {value}
        {unit}
      </span>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const Settings: React.FC = () => {
  const history = useHistory();
  const { isNight, setTheme } = useTheme();
  const { lang, setLang, t, isRTL } = useLang();
  const [s, setS] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  // Debounced auto-save — avoids hammering localStorage during slider drags
  // and prevents the "saved ✓" flag from flicker-restarting on every tick.
  useEffect(() => {
    const writeT = setTimeout(() => {
      saveSettings(s);
      setSaved(true);
    }, 250);
    const clearT = setTimeout(() => setSaved(false), 1500);
    return () => {
      clearTimeout(writeT);
      clearTimeout(clearT);
    };
  }, [s]);

  const set = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) =>
    setS((prev) => ({ ...prev, [key]: val }));

  const resetAll = () => {
    setS({ ...DEFAULTS });
    setTheme("night");
    setLang("ar");
  };

  const ts = t.settings;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="settings-page-wrapper">
          <div className="settings-container">
            {/* ── Language — two-button row per design index.html ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionLanguage}</p>
              <div className="settings-card">
                <div className="settings-row settings-row-stack">
                  <p className="settings-row-label">{ts.language}</p>
                  <div className="settings-lang-row">
                    <button
                      type="button"
                      className={
                        "settings-lang-btn" +
                        (lang === "ar" ? " is-active" : "")
                      }
                      onClick={() => setLang("ar")}
                    >
                      {ts.arabic}
                    </button>
                    <button
                      type="button"
                      className={
                        "settings-lang-btn" +
                        (lang === "en" ? " is-active" : "")
                      }
                      onClick={() => setLang("en")}
                    >
                      {ts.english}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Appearance ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionAppearance}</p>
              <div className="settings-card">
                <ToggleRow
                  icon={ICONS.moon}
                  label={ts.nightMode}
                  desc={ts.nightModeDesc}
                  checked={isNight}
                  onChange={(v) => setTheme(v ? "night" : "day")}
                />
              </div>
            </div>

            {/* ── Quran ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionQuran}</p>
              <div className="settings-card">
                <SelectRow
                  icon={ICONS.book}
                  label="المصحف"
                  desc="اختر طريقة عرض المصحف"
                  value={s.mushaf}
                  options={Object.values(MUSHAFS).map((m) => ({
                    value: m.kind,
                    label: lang === "ar" ? m.labelAr : m.labelEn,
                  }))}
                  onChange={(v) => set("mushaf", v as MushafKind)}
                />
                <ToggleRow
                  icon={ICONS.palette}
                  label={ts.tajweed}
                  desc={ts.tajweedDesc}
                  checked={s.showTajweedColors}
                  onChange={(v) => set("showTajweedColors", v)}
                />
                <ToggleRow
                  icon={ICONS.book}
                  label={ts.autoNextPage}
                  desc={ts.autoNextPageDesc}
                  checked={s.autoNextPage}
                  onChange={(v) => set("autoNextPage", v)}
                />
              </div>
            </div>

            {/* ── Azkar ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionAzkar}</p>
              <div className="settings-card">
                <ToggleRow
                  icon={ICONS.vibrate}
                  label={ts.azkarVibration}
                  desc={ts.azkarVibrationDesc}
                  checked={s.azkarVibration}
                  onChange={(v) => set("azkarVibration", v)}
                />
                <ToggleRow
                  icon={ICONS.bell}
                  label={ts.azkarCounterSound}
                  desc={ts.azkarCounterSoundDesc}
                  checked={s.azkarCounterSound}
                  onChange={(v) => set("azkarCounterSound", v)}
                />
              </div>
            </div>

            {/* ── Notifications ── */}
            <div className="settings-section">
              <p className="settings-section-title">
                {ts.sectionNotifications}
              </p>
              <div className="settings-card">
                <ToggleRow
                  icon={ICONS.mosque}
                  label={ts.prayerReminders}
                  desc={ts.prayerRemindersDesc}
                  checked={s.prayerReminders}
                  onChange={(v) => set("prayerReminders", v)}
                />
                <ToggleRow
                  icon={ICONS.beads}
                  label={ts.azkarReminders}
                  desc={ts.azkarRemindersDesc}
                  checked={s.azkarReminders}
                  onChange={(v) => set("azkarReminders", v)}
                />
              </div>
            </div>

            {/* ── Reset ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionReset}</p>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-icon">{ICONS.refresh}</span>
                    <div className="settings-row-text">
                      <p className="settings-row-label">{ts.resetDefaults}</p>
                      <p className="settings-row-desc">
                        {ts.resetDefaultsDesc}
                      </p>
                    </div>
                  </div>
                  <button className="settings-action-btn" onClick={resetAll}>
                    {ts.resetButton}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Version ── */}
            <div className="settings-version">
              <p>
                <strong>{t.appName}</strong>
              </p>
              <p>{ts.version}</p>
              <p>{ts.quote}</p>
            </div>
          </div>
          <BottomNavBar active="settings" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Settings;
