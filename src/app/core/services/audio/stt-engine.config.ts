/**
 * STT ENGINE REGISTRY
 *
 * Which speech-recognition engine drives Recite Mode. The Settings page
 * renders `RECITE_ENGINE_OPTIONS` as a dropdown (adding a future engine =
 * adding an entry here plus its branch in useReciteMode), and
 * `resolveReciteEngine` turns the persisted choice into the engine actually
 * used — falling back to the chunked pipeline when a streaming engine's key
 * isn't configured in the build, so a stale setting can never dead-end
 * recite mode.
 */

import { isStreamingSttAvailable } from "./speech-to-text-stream.service";

/** Persisted setting values ("auto" defers to key availability). */
export type ReciteEngineChoice = "auto" | "deepgram" | "groq";

/** Engines the hook can actually run. */
export type ResolvedReciteEngine = "deepgram" | "groq";

export const RECITE_ENGINE_OPTIONS: {
  value: ReciteEngineChoice;
  labelAr: string;
  labelEn: string;
}[] = [
  { value: "auto", labelAr: "تلقائي (مستحسن)", labelEn: "Auto (recommended)" },
  { value: "deepgram", labelAr: "Deepgram — بث فوري", labelEn: "Deepgram — live streaming" },
  { value: "groq", labelAr: "Groq Whisper — مقاطع صوتية", labelEn: "Groq Whisper — chunked" },
];

export function resolveReciteEngine(
  choice: string | undefined,
): ResolvedReciteEngine {
  if (choice === "groq") return "groq";
  // "deepgram" and "auto" both want streaming — possible only with a key.
  return isStreamingSttAvailable() ? "deepgram" : "groq";
}
