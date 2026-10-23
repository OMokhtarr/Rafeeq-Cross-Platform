/**
 * STREAMING SPEECH-TO-TEXT SERVICE
 *
 * Dispatcher for Recite Mode's speech engines. `openSttStream` reads the
 * Settings choice at every session start and hands off to that engine's
 * adapter under ./stt/. All adapters emit the same `SttStreamEvent`
 * contract, so the recite drivers never care which engine is behind it.
 */

import { readReciteEngine } from "./stt-engine.config";
import { openDeepgramStream } from "./stt/deepgram.adapter";
import { openSonioxStream } from "./stt/soniox.adapter";
import type { OpenStream } from "./stt/types";

export type { SttWord, SttStreamEvent, SttStreamHandle, OpenStream } from "./stt/types";
export { parseStreamMessage } from "./stt/deepgram.adapter";

export const openSttStream: OpenStream = (onEvent, onError) => {
  switch (readReciteEngine()) {
    case "deepgram":
      return openDeepgramStream(onEvent, onError);
    case "soniox":
      return openSonioxStream(onEvent, onError);
  }
};
