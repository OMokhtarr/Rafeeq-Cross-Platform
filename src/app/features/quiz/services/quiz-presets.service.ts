/**
 * QUIZ RANGE PRESETS
 *
 * The only module that touches preset storage. One key holds the whole
 * library as a JSON array, shared by all three quiz types — a range is a range
 * regardless of what consumes it, and the point of saving one is to avoid
 * building it three times.
 */

import { Preferences } from "@capacitor/preferences";
import type {
  QuizRange,
  QuizRangePreset,
} from "../../../shared/models/verse.model";

export const PRESETS_KEY = "quizRangePresets";

function isPreset(value: unknown): value is QuizRangePreset {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<QuizRangePreset>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    Array.isArray(p.ranges) &&
    typeof p.createdAt === "number" &&
    typeof p.updatedAt === "number"
  );
}

/**
 * Every read funnels through here. Absent, malformed or partially corrupt
 * storage degrades to whatever is still readable rather than throwing.
 */
async function readAll(): Promise<QuizRangePreset[]> {
  try {
    const { value } = await Preferences.get({ key: PRESETS_KEY });
    if (!value) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPreset);
  } catch {
    return [];
  }
}

async function writeAll(presets: QuizRangePreset[]): Promise<void> {
  await Preferences.set({ key: PRESETS_KEY, value: JSON.stringify(presets) });
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

/** The library, newest-updated first. */
export async function listPresets(): Promise<QuizRangePreset[]> {
  const all = await readAll();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Store a new set under an already-derived name. */
export async function savePreset(
  ranges: QuizRange[],
  name: string,
): Promise<QuizRangePreset> {
  const now = Date.now();
  const preset: QuizRangePreset = {
    id: newId(),
    name,
    ranges: [...ranges],
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  await writeAll([preset, ...all]);
  return preset;
}

/** Replace an existing set's ranges, keeping its name and id. */
export async function updatePreset(
  id: string,
  ranges: QuizRange[],
): Promise<void> {
  const all = await readAll();
  const next = all.map((p) =>
    p.id === id ? { ...p, ranges: [...ranges], updatedAt: Date.now() } : p,
  );
  await writeAll(next);
}

export async function renamePreset(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const all = await readAll();
  const next = all.map((p) =>
    p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
  );
  await writeAll(next);
}

export async function deletePreset(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((p) => p.id !== id));
}

/**
 * Put a deleted preset back, identity intact.
 *
 * Undo keeps no trash bin in storage: the caller holds the removed object for
 * the lifetime of its toast. If the user navigates away first the delete
 * simply stands, which is correct and costs no code.
 */
export async function restorePreset(preset: QuizRangePreset): Promise<void> {
  const all = await readAll();
  if (all.some((p) => p.id === preset.id)) return;
  await writeAll([preset, ...all]);
}
