/**
 * STREAMING SPEECH-TO-TEXT SERVICE
 *
 * The one entry point the recite drivers open a speech session through.
 * Soniox is the only engine; its adapter lives under ./stt/ and emits the
 * shared `SttStreamEvent` contract. The Deepgram adapter and the Settings
 * engine picker are archived in archive/deepgram/ at the repo root.
 */

import { openSonioxStream } from "./stt/soniox.adapter";
import type { OpenStream } from "./stt/types";

export type { SttWord, SttStreamEvent, SttStreamHandle, OpenStream } from "./stt/types";

export const openSttStream: OpenStream = openSonioxStream;
