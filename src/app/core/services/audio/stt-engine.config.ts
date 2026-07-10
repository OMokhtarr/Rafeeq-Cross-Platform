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

export type ReciteEngineChoice = "deepgram" | "groq";

export const DEFAULT_RECITE_ENGINE: ReciteEngineChoice = "deepgram";

export const RECITE_ENGINE_OPTIONS: {
  value: ReciteEngineChoice;
  labelAr: string;
  labelEn: string;
}[] = [
  { value: "deepgram", labelAr: "Deepgram — بث فوري", labelEn: "Deepgram — live streaming" },
  { value: "groq", labelAr: "Groq Whisper — مقاطع صوتية", labelEn: "Groq Whisper — chunked" },
];

export function resolveReciteEngine(
  choice: string | undefined,
): ReciteEngineChoice {
  if (choice === "groq") return "groq";
  // Deepgram (also the default for unset/retired values like the old
  // "auto") — streaming needs its key in the build to actually run.
  return isStreamingSttAvailable() ? "deepgram" : "groq";
}
