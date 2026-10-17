/**
 * STT ENGINE CONFIG
 *
 * Which speech-recognition engines can drive Recite Mode. The Settings page
 * renders `RECITE_ENGINE_OPTIONS` as a dropdown and persists the pick in
 * `rafiq_settings_v1`.`reciteEngine`; the stream dispatcher
 * (speech-to-text-stream.service.ts) reads that choice back through
 * `readReciteEngine` at every session start. Deepgram is no longer the only
 * engine — each engine is an adapter under ./stt/.
 */

export type ReciteEngineChoice = "deepgram" | "soniox" | "cloudflare-whisper";

export const DEFAULT_RECITE_ENGINE: ReciteEngineChoice = "deepgram";

export const RECITE_ENGINE_OPTIONS: {
  value: ReciteEngineChoice;
  labelAr: string;
  labelEn: string;
}[] = [
  { value: "deepgram", labelAr: "Deepgram — بث فوري", labelEn: "Deepgram — live streaming" },
];

const SETTINGS_KEY = "rafiq_settings_v1";

// Validated against the full union, not the options array, so an engine reads
// back as soon as it exists even before its dropdown entry does.
const KNOWN_ENGINES: readonly string[] = ["deepgram", "soniox", "cloudflare-whisper"];

/** The saved engine, or the default when nothing valid is saved. */
export function readReciteEngine(): ReciteEngineChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")?.reciteEngine;
    if (typeof saved === "string" && KNOWN_ENGINES.includes(saved)) {
      return saved as ReciteEngineChoice;
    }
  } catch {
    // Unreadable settings — fall through to the default.
  }
  return DEFAULT_RECITE_ENGINE;
}
