/**
 * STT ENGINE REGISTRY
 *
 * Which speech-recognition engine drives Recite Mode. The Settings page
 * renders `RECITE_ENGINE_OPTIONS` as a dropdown. Deepgram is currently the
 * only engine — the registry is kept in this shape (rather than inlined)
 * so a future engine is just a new entry here plus its own driver folder
 * under core/hooks/recite/, without reshaping Settings or its persisted
 * `reciteEngine` field.
 */

export type ReciteEngineChoice = "deepgram";

export const DEFAULT_RECITE_ENGINE: ReciteEngineChoice = "deepgram";

export const RECITE_ENGINE_OPTIONS: {
  value: ReciteEngineChoice;
  labelAr: string;
  labelEn: string;
}[] = [
  { value: "deepgram", labelAr: "Deepgram — بث فوري", labelEn: "Deepgram — live streaming" },
];
