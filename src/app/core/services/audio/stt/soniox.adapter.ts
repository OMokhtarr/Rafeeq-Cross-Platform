/**
 * SONIOX ADAPTER
 *
 * Real-time transcription for Recite Mode over Soniox's websocket API
 * (stt-rt-v5, Arabic). The mic is streamed as raw 16 kHz PCM; Soniox answers
 * with token messages that the assembler turns into the shared interim /
 * final window events.
 */

import { fetchBrokerKey } from "./broker";
import { logText } from "./log-text";
import { floatToPcm16, PCM_SAMPLE_RATE, startPcmCapture } from "./pcm-capture";
import { createSonioxAssembler } from "./soniox.assembler";
import type { SonioxToken } from "./soniox.assembler";
import type { OpenStream } from "./types";

const STREAM_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

/** The first text frame of every session. The key travels in the
 *  subprotocol list, never in here. */
const STREAM_CONFIG = {
  model: "stt-rt-v5",
  audio_format: "pcm_s16le",
  sample_rate: PCM_SAMPLE_RATE,
  num_channels: 1,
  language_hints: ["ar"],
  language_hints_strict: true,
  enable_endpoint_detection: true,
  max_endpoint_delay_ms: 500,
};

/** How long `stop()` lets the server finish before closing the socket itself. */
const CLOSE_GRACE_MS = 2000;

/** The parts of a Soniox response this adapter reads. */
interface SonioxMessage {
  tokens?: SonioxToken[];
  error_code?: number;
  error_message?: string;
}

/**
 * Opens the mic and a Soniox live-transcription socket, forwarding assembled
 * events to `onEvent`. Rejects if the broker or the mic is unavailable;
 * transport and server errors after that surface once through `onError` (the
 * caller should stop the session — the stream does not auto-reconnect).
 */
export const openSonioxStream: OpenStream = async (onEvent, onError) => {
  // Mint the temporary key before opening the mic, so a broker failure
  // doesn't leave the recording indicator on while we bail out.
  const key = await fetchBrokerKey("/soniox/token");

  let stopped = false;
  // One error per session: a server error is followed by the server closing
  // the socket, which must not report a second time.
  let failed = false;
  const fail = (message: string) => {
    if (stopped || failed) return;
    failed = true;
    onError(message);
  };

  // Audio captured before the socket exists or finishes its handshake —
  // flushed on open so the first words of the recitation aren't lost.
  const preOpen: ArrayBuffer[] = [];
  let socket: WebSocket | null = null;

  const capture = await startPcmCapture((frame) => {
    if (stopped) return;
    const pcm = floatToPcm16(frame).buffer;
    if (socket?.readyState === WebSocket.OPEN) socket.send(pcm);
    else if (!socket || socket.readyState === WebSocket.CONNECTING) preOpen.push(pcm);
  });

  // Browser WebSockets can't set an Authorization header; Soniox takes the
  // key through the subprotocol list instead.
  let ws: WebSocket;
  try {
    ws = new WebSocket(STREAM_URL, ["soniox-api-key", key]);
  } catch (err) {
    capture.stop();
    throw err;
  }
  socket = ws;

  const assembler = createSonioxAssembler();
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  ws.onopen = () => {
    if (stopped) return;
    ws.send(JSON.stringify(STREAM_CONFIG));
    for (const pcm of preOpen) ws.send(pcm);
    preOpen.length = 0;
  };
  ws.onmessage = (msg: MessageEvent) => {
    if (stopped || failed) return;
    let data: SonioxMessage;
    try {
      data = JSON.parse(String(msg.data)) as SonioxMessage;
    } catch {
      return;
    }
    if (data.error_code !== undefined || data.error_message !== undefined) {
      // Soniox's wording is for developers (and can name key state), so the
      // user gets the generic message and the console gets the real one.
      console.error(
        `[recite-stream] soniox error ${logText(data.error_code)}: ${logText(data.error_message)}`,
      );
      fail("Transcription stream error");
      return;
    }
    if (!Array.isArray(data.tokens)) return;
    for (const event of assembler.push(data.tokens)) {
      // Dev logging (finals only — interims arrive several times a second).
      if (event.isFinal && event.text) {
        console.log(`[recite-stream] soniox final: "${event.text}"`);
      }
      onEvent(event);
    }
  };
  ws.onerror = () => fail("Transcription stream error");
  ws.onclose = (event: CloseEvent) => {
    if (closeTimer) clearTimeout(closeTimer);
    if (!stopped) {
      console.log(`[recite-stream] soniox closed: code=${event.code} reason=${logText(event.reason)}`);
    }
    // A close the caller didn't ask for (auth rejection, network drop)
    // means no more words will ever arrive — the session must not sit
    // there looking alive.
    fail("Transcription stream closed");
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    capture.stop();
    preOpen.length = 0;
    if (ws.readyState !== WebSocket.OPEN) {
      ws.close();
      return;
    }
    try {
      // Ask Soniox to settle what it has, then signal end of audio; it
      // closes the socket itself once done.
      ws.send(JSON.stringify({ type: "finalize" }));
      ws.send("");
    } catch {
      // Socket died first — the close below still applies.
    }
    closeTimer = setTimeout(() => ws.close(), CLOSE_GRACE_MS);
  };

  return { stop };
};
