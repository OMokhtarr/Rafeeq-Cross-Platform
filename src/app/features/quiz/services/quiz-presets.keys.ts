/**
 * Preset storage key and shape check, kept dependency-free so the sync layer
 * can import them without pulling in the service (and its write hook).
 */

import type { QuizRangePreset } from "../../../shared/models/verse.model";

export const PRESETS_KEY = "quizRangePresets";

export function isPreset(value: unknown): value is QuizRangePreset {
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
