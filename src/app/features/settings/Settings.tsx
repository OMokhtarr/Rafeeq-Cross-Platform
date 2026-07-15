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
import InlineSelect from "../../shared/components/inline-select/InlineSelect";
import {
  MUSHAFS,
  DEFAULT_MUSHAF,
  type MushafKind,
} from "../../core/services/api/mushaf.config";
import {
  RECITE_ENGINE_OPTIONS,
  DEFAULT_RECITE_ENGINE,
  type ReciteEngineChoice,
} from "../../core/services/audio/stt-engine.config";
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
  /** Recite Mode STT engine. */
  reciteEngine: ReciteEngineChoice;
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
  reciteEngine: DEFAULT_RECITE_ENGINE,
  quizDifficulty: "medium",
  showHintsDefault: true,
  soundEffects: true,
  azkarVibration: true,
  azkarCounterSound: false,
  prayerReminders: false,
  azkarReminders: false,
};

const STORAGE_KEY = "rafiq_settings_v1";

// Only the Tajweed mushaf is offered in Settings for now; the other rendering
// kinds are kept in mushaf.config but hidden from the dropdown.
const MUSHAF_OPTIONS = [MUSHAFS.qpc_v4_tajweed];

// Strip the trailing "(KFGQPC V4)"-style parenthetical from a mushaf label.
const cleanMushafLabel = (label: string) =>
  label.replace(/\s*\([^)]*\)\s*$/, "").trim();

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULTS, ...JSON.parse(raw) } as AppSettings;
      // Migrate retired mushaf kinds (e.g. "qpc_v1") to the current default.
      if (!(merged.mushaf in MUSHAFS)) merged.mushaf = DEFAULT_MUSHAF;
      // Migrate retired engine values (e.g. the removed "groq"/"auto").
      if (!RECITE_ENGINE_OPTIONS.some((e) => e.value === merged.reciteEngine)) {
        merged.reciteEngine = DEFAULT_RECITE_ENGINE;
      }
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

// ── Tajweed Info Modal ────────────────────────────────────────────────────────
interface TajweedRule {
  color: string;
  titleAr: string;
  subtitleAr: string;
  bodyAr: string;
  titleEn: string;
  subtitleEn: string;
  bodyEn: string;
}

const TAJWEED_RULES: TajweedRule[] = [
  {
    color: "#c0392b",
    titleAr: "مد ٦ حركات",
    subtitleAr: "مد لازم",
    bodyAr:
      'يشير اللون الأحمر الداكن إلى المد اللازم بمقدار ٦ حركات. مثال: "الضَّالِّين"',
    titleEn: "Madd: 6",
    subtitleEn: "Necessary Prolongation",
    bodyEn:
      'The dark red color indicates necessary prolongation, where the elongation is 6 vowels. This applies in cases like مد لازم (Madd Laazim). Example: "الضَّالِّين"',
  },
  {
    color: "#e91e8c",
    titleAr: "مد ٤ أو ٥ حركات",
    subtitleAr: "مد واجب",
    bodyAr: 'يشير اللون الزهري للمد بمقدار ٤ أو ٥ حركات. مثال: "سماء"',
    titleEn: "Madd: 4 or 5",
    subtitleEn: "Obligatory Prolongation",
    bodyEn:
      'The pink color signifies obligatory prolongation, typically 4 or 5 vowels, depending on the context. This could include مد واجب متصل (Madd Wajib Muttasil). Example: Words like "سماء"',
  },
  {
    color: "#e67e22",
    titleAr: "مد ٢ أو ٤ أو ٦ حركات",
    subtitleAr: "مد جائز",
    bodyAr:
      'اللون البرتقالي يشير لإمكانية المد بمقدار حركتين أو ٤ أو ٦ حركات في حالة المد العارض للسكون. مثال: عند الوقف على كلمة "العالمين"',
    titleEn: "Madd: 2, 4, or 6",
    subtitleEn: "Permissible Prolongation",
    bodyEn:
      'The orange color marks elongations that vary between 2, 4, or 6 vowels. This occurs in situations like مد عارض للسكون (Madd \'Aarid Li-Sukoon). Example: At the end of "العالمين" when stopping.',
  },
  {
    color: "#f0c040",
    titleAr: "مد طبيعي حركتين",
    subtitleAr: "مد طبيعي",
    bodyAr: 'اللون الأصفر يمثل المد الطبيعي بمقدار حركتين. مثال: "عَظِيم"',
    titleEn: "Madd: 2",
    subtitleEn: "Normal Prolongation",
    bodyEn:
      'The yellow color represents a simple elongation of 2 vowels. This applies to مد طبيعي (Madd Tabee\'i). Example: "عَظِيم"',
  },
  {
    color: "#27ae60",
    titleAr: "غنة",
    subtitleAr: "صوت الغنة مع أحكام النون والميم",
    bodyAr:
      "يشير اللون الأخضر لصوت الغنة الذي يخرج من الخيشوم عند النطق بحرفي النون والميم. يُقدر زمنها عادة بمقدار حركتين وتحدث مع أحكام النون الساكنة والتنوين وأحكام الميم الساكنة:\n\n• في حالة النون والميم المشددتين، مثل (فَإِنَّهم)\n\n• في حالة الإقلاب عندما تأتي باء (ب) بعد نون ساكنة أو تنوين (نٌ / ـٌ)، يتم تحويل النون الساكنة/ التنوين إلى ميم مع إعطائها زمن للغنة\nأمثلة:\n(مِن بَعد) قلب النون لميم فتنطق (مِمـبَعد)\n(سَمِيعٌ بَصِير) نقلب التنوين لميم فتنطق (سَميعـمـبَصير)\n\n• في حالة الإخفاء الحقيقي عندما يأتي حرف من حروف الإخفاء الخمسة عشر (ص، ذ، ث، ك، ج، ش، ق، س، د، ط، ز، ف، ت، ض، ظ) بعد نون ساكنة أو تنوين (نٌ / ـٌ) يتم إخفاء صوت النون مع الإبقاء على صوت الغنة\nأمثلة:\n(أَن تَخشَوه) تخفى النون مع إعطاء زمن للغنة ثم يتم نطق التاء (أَ ـتَخشَوه)\n(كُتُبٌ قَيِّمَة) تخفى النون مع إعطاء زمن للغنة ثم يتم نطق القاف (كُتُبٌـقَيِّمَة)\n\n• في حالة الإدغام عندما يأتي حرف من حروف الإدغام الجزئي (ينمو) بعد نون ساكنة أو تنوين (ن / ـٌ) فتدغم النون الساكنة بما بعدها إدغاما جزئيًا\nأمثلة:\n(مَن يَقُول) تدغم النون بالياء مع إعطاء زمن للغنة فتنطق (مِيـيَقول)\n(رَحِيمٌ وَدُود) يدغم التنوين في الواو مع إعطاء زمن للغنة فتنطق (رَحِيمُـوَدود)\n\n• في حالة الإخفاء الشفوي عندما تأتي (ب) بعد ميم ساكنة (م) يتم نطقها مع إعطاء زمن للغنة\nأمثلة:\n(وَآمَنتُم بِرَسُلي) يتم إعطاء لغنة الميم فتنطق (وَآمـتُمـبِرَسُلي)",
    titleEn: "Ghunnah",
    subtitleEn: "Nasalization",
    bodyEn:
      'The green color indicates Ghunnah, a nasal sound that resonates from the nose and lasts for two vowels. Ghunnah occurs in several cases:\n\n• When ن (Noon) or م (Meem) carries shaddah (emphasis), such as in فَإِنَّهُم.\n\n• When Noon Sakinah (نْ) or Tanween (ـٌ) is followed by Baa (ب), a small Meem (م) is added and pronounced with Ghunnah. This is known as Iqlaab (inversion).\nExamples:\nمِن بَعد — Pronounced as "Mimba\'d", with Ghunnah on the second Meem (م).\nسَمِيعٌ بَصِير — Pronounced as "Sami\'um Basir", where the Tanween is converted into Meem with Ghunnah.\n\n• When Noon Sakinah (نْ) or Tanween (ـٌ) is followed by one of the fifteen letters of Ikhfaa\' (ث، ج، د، ذ، ز، س، ش، ص، ض، ط، ظ، ف، ق، ك، ت). In these cases, the sound of the Noon (ن) or Tanween (ـٌ) is hidden (the tongue does not touch the roof of the mouth) and it is pronounced instead with Ghunnah.\nExamples:\nأَن تَخشَوه\nكُتُبٌ قَيِّمَة\n\n• When the letters of Idghaam with Ghunnah (Yaa ي, Noon ن, Meem م, and Waw و) follow a Noon Sakinah (نْ) or Tanween (ـٌ), they are pronounced with Ghunnah.\nExamples:\nمَن يَقُول — Pronounced as "Mayyaqool" (Noon merges into Yaa with Ghunnah).\nرَحِيمٌ وَدُود — Pronounced as "Rahiimuw-waduud" (Tanween merges into Waw with Ghunnah).\n\n• When Meem Sakinah (مْ) is followed by a Baa (ب), it is pronounced with a nasalized Meem sound (م). Known as Ikhfaa\' Shafawi, an example of this is: وَآمَنتُم بِرَسُلي',
  },
  {
    color: "#5dade2",
    titleAr: "قلقلة",
    subtitleAr: "صوت صدى",
    bodyAr:
      'يوضح اللون السماوي حروف القلقلة المجموعة في (قطب جد) عندما تكون ساكنة (مثل، "أحد"). عند النطق بها يصاحبها نبرة قوية، خصوصا عندما تكون في آخر الكلمة ويتم الوقف عليها.',
    titleEn: "Qalqala",
    subtitleEn: "Echoing Sound",
    bodyEn:
      'The light blue color identifies the letters of Qalqala (ق ط ب ج د) when they have سكون (e.g., "أحد"). These letters are pronounced with a slight echo or bouncing sound, especially at the end of a verse or pause.',
  },
  {
    color: "#2980b9",
    titleAr: "تفخيم",
    subtitleAr: "ثقل في النطق بالحروف المفخمة",
    bodyAr:
      'يوضح اللون الأزرق مواضع تفخيم حرف الراء بالإضافة لجميع حروف الاستعلاء المجموعة في (خص ضغط قظ) والتي دائما ما تكون مفخمة. أمثلة: "المستقيم"، "الصالحات"، "خالدين"، "الحرام".',
    titleEn: "Tafkhim",
    subtitleEn: "Emphatic Pronunciation of Heavy Letters",
    bodyEn:
      'The dark blue color highlights ر (Ra\') when pronounced with tafkhim (a heavy, emphatic sound), as well as all other letters of isti\'laa (elevation), which include: خ، ص، ض، غ، ط، ق، ظ. These letters are pronounced with a full, resonant sound. Examples: "الحرام", "خالدين", "الصالحات","المستقيم".',
  },
  {
    color: "#95a5a6",
    titleAr: "حرف لا ينطق",
    subtitleAr: "حرف مهمل في النطق",
    bodyAr:
      "يوضح اللون الرمادي الحروف والتشكيل الذي لا يُنطق ويتم إدغامه/استيعابه ولا يساهم بصوت أثناء التلاوة. أمثلة: لام الشمس في (الشمس)، ونون كان لم (كان لم يسجد) تُنطق كـ (كاللم).",
    titleEn: "Silent",
    subtitleEn: "Unannounced Pronunciation",
    bodyEn:
      "The grey color highlights letters that are silent and diacritics that are merged/assimilated and do not contribute any sound during recitation. Examples include the ل in الشمس and the ن in كان لم pronounced as كالّم instead.",
  },
];

interface TajweedInfoModalProps {
  open: boolean;
  onClose: () => void;
  isNight: boolean;
  lang: string;
  isRTL: boolean;
}

const TajweedInfoModal: React.FC<TajweedInfoModalProps> = ({
  open,
  onClose,
  isNight,
  lang,
  isRTL,
}) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isAr = lang === "ar";

  return (
    <div
      className={"tjm-backdrop" + (isNight ? " tjm--night" : "")}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="tjm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tjm-handle" />
        <div className="tjm-header">
          <span className="tjm-title">
            {isAr ? "دليل ألوان التجويد" : "Tajweed Color Guide"}
          </span>
          <button className="tjm-close" onClick={onClose} aria-label="Close">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="tjm-body">
          {TAJWEED_RULES.map((rule, i) => {
            const isOpen = expanded === i;
            return (
              <div
                key={i}
                className={"tjm-rule" + (isOpen ? " tjm-rule--open" : "")}
              >
                <button
                  className="tjm-rule-header"
                  onClick={() => setExpanded(isOpen ? null : i)}
                >
                  <span
                    className="tjm-dot"
                    style={{ background: rule.color }}
                  />
                  <div className="tjm-rule-titles">
                    <span className="tjm-rule-title">
                      {isAr ? rule.titleAr : rule.titleEn}
                    </span>
                    <span className="tjm-rule-subtitle">
                      {isAr ? rule.subtitleAr : rule.subtitleEn}
                    </span>
                  </div>
                  <svg
                    className="tjm-chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="tjm-rule-body">
                    {(isAr ? rule.bodyAr : rule.bodyEn)
                      .split("\n")
                      .map((line, j) =>
                        line === "" ? <br key={j} /> : <p key={j}>{line}</p>,
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────
interface ToggleRowProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  onInfo?: () => void;
}
const ToggleRow: React.FC<ToggleRowProps> = ({
  icon,
  label,
  desc,
  checked,
  onChange,
  onInfo,
}) => (
  <div className="settings-row">
    <div className="settings-row-info">
      <span className="settings-row-icon">{icon}</span>
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {desc && <p className="settings-row-desc">{desc}</p>}
      </div>
    </div>
    <div className="settings-row-controls">
      {onInfo && (
        <button
          type="button"
          className="settings-info-btn"
          onClick={onInfo}
          aria-label="Info"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line
              x1="12"
              y1="8"
              x2="12"
              y2="8"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line x1="12" y1="12" x2="12" y2="16" />
          </svg>
        </button>
      )}
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-toggle-slider" />
      </label>
    </div>
  </div>
);

interface SelectRowProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  night?: boolean;
}
const SelectRow: React.FC<SelectRowProps> = ({
  icon,
  label,
  desc,
  value,
  options,
  onChange,
  night,
}) => (
  <div className="settings-row settings-row--select">
    <div className="settings-row-info">
      <span className="settings-row-icon">{icon}</span>
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {desc && <p className="settings-row-desc">{desc}</p>}
      </div>
    </div>
    <InlineSelect
      value={value}
      options={options}
      onChange={onChange}
      night={night}
    />
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
  const [tajweedInfoOpen, setTajweedInfoOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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
            {/* ── Header ── */}
            <div className="settings-header">
              <div className="settings-header-text">
                <h1>{lang === "ar" ? "الإعدادات" : "Settings"}</h1>
                <p>{lang === "ar" ? "تخصيص التطبيق" : "Customize your experience"}</p>
              </div>
            </div>

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
                  label={ts.mushafLabel}
                  desc={ts.mushafLabelDesc}
                  value={s.mushaf}
                  options={MUSHAF_OPTIONS.map((m) => ({
                    value: m.kind,
                    label: cleanMushafLabel(
                      lang === "ar" ? m.labelAr : m.labelEn,
                    ),
                  }))}
                  onChange={(v) => set("mushaf", v as MushafKind)}
                  night={isNight}
                />
                <ToggleRow
                  icon={ICONS.palette}
                  label={ts.tajweed}
                  desc={ts.tajweedDesc}
                  checked={s.showTajweedColors}
                  onChange={(v) => set("showTajweedColors", v)}
                  onInfo={() => setTajweedInfoOpen(true)}
                />
              </div>
            </div>

            {/* ── Recitation (Recite Mode) ── */}
            <div className="settings-section">
              <p className="settings-section-title">{ts.sectionRecite}</p>
              <div className="settings-card">
                <SelectRow
                  icon={ICONS.mic}
                  label={ts.reciteEngine}
                  desc={ts.reciteEngineDesc}
                  value={s.reciteEngine}
                  options={RECITE_ENGINE_OPTIONS.map((e) => ({
                    value: e.value,
                    label: lang === "ar" ? e.labelAr : e.labelEn,
                  }))}
                  onChange={(v) => set("reciteEngine", v as ReciteEngineChoice)}
                  night={isNight}
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

            {/* ── Notifications (coming soon — controls disabled) ── */}
            <div className="settings-section">
              <p className="settings-section-title">
                {ts.sectionNotifications}
              </p>
              <div className="settings-card settings-card--coming-soon">
                <span className="settings-coming-soon-badge">
                  {ts.comingSoon}
                </span>
                <div className="settings-card-disabled" aria-hidden="true">
                  <ToggleRow
                    icon={ICONS.mosque}
                    label={ts.prayerReminders}
                    desc={ts.prayerRemindersDesc}
                    checked={s.prayerReminders}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    icon={ICONS.beads}
                    label={ts.azkarReminders}
                    desc={ts.azkarRemindersDesc}
                    checked={s.azkarReminders}
                    onChange={() => {}}
                  />
                </div>
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
                  <button
                    className="settings-action-btn"
                    onClick={() => setResetConfirmOpen(true)}
                  >
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
            </div>
          </div>
          <BottomNavBar active="settings" />
        </div>
      </IonContent>
      <TajweedInfoModal
        open={tajweedInfoOpen}
        onClose={() => setTajweedInfoOpen(false)}
        isNight={isNight}
        lang={lang}
        isRTL={isRTL}
      />
      {resetConfirmOpen && (
        <div
          className="settings-confirm-backdrop"
          onClick={() => setResetConfirmOpen(false)}
          dir={isRTL ? "rtl" : "ltr"}
        >
          <div
            className="settings-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <p className="settings-confirm-title">{ts.resetConfirmTitle}</p>
            <p className="settings-confirm-body">{ts.resetConfirmMessage}</p>
            <div className="settings-confirm-actions">
              <button
                className="settings-confirm-cancel"
                onClick={() => setResetConfirmOpen(false)}
              >
                {ts.resetConfirmCancel}
              </button>
              <button
                className="settings-confirm-yes"
                onClick={() => {
                  setResetConfirmOpen(false);
                  resetAll();
                }}
              >
                {ts.resetConfirmYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </IonPage>
  );
};

export default Settings;
