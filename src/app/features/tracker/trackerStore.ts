/**
 * WORSHIP TRACKER STORE
 * Local-only persistence: which items were ticked on each tracking day, and
 * which sections count. Every day is kept (a few bytes each) so the
 * calendar can show any past day.
 */
import { ItemId, SectionId, OPTIONAL_SECTIONS } from "./trackerCatalog";

const DAYS_KEY = "rafeeq.tracker.days";
const SETTINGS_KEY = "rafeeq.tracker.settings";

function readObject(key: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadDays(): Record<string, ItemId[]> {
  const raw = readObject(DAYS_KEY);
  const days: Record<string, ItemId[]> = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (Array.isArray(v)) days[k] = v.filter((x): x is ItemId => typeof x === "string");
  });
  return days;
}

export function toggleItem(dayKey: string, id: ItemId): Record<string, ItemId[]> {
  const days = loadDays();
  const current = days[dayKey] ?? [];
  days[dayKey] = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(days));
  } catch {
    // Storage full or blocked: the tick still shows for this session.
  }
  return days;
}

export function loadSettings(): Record<SectionId, boolean> {
  const raw = readObject(SETTINGS_KEY);
  const settings = { prayers: true } as Record<SectionId, boolean>;
  OPTIONAL_SECTIONS.forEach((id) => (settings[id] = raw[id] !== false));
  return settings;
}

export function saveSettings(s: Record<SectionId, boolean>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, prayers: true }));
  } catch {
    // Non-fatal: settings fall back to defaults next launch.
  }
}
