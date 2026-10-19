/**
 * DEEPGRAM ADAPTER
 *
 * Real-time transcription for Recite Mode over Deepgram's websocket
 * streaming API (nova-3, Arabic). Words arrive a few hundred ms after
 * they're spoken — first as `interim` revisions of the current utterance
 * window, then as a settled `final`.
 */

import { fetchBrokerKey } from "./broker";
import { logText } from "./log-text";
import type { OpenStream, SttStreamEvent } from "./types";

const STREAM_URL = "wss://api.deepgram.com/v1/listen";

/** MediaRecorder delivery cadence. Deepgram accepts containerized
 *  webm/opus fragments directly, so small timeslices stream near-live
 *  without any PCM re-encoding. */
const RECORDER_TIMESLICE_MS = 250;

/** The parts of a Deepgram `Results` frame this service reads. */
interface DeepgramResults {
  type?: string;
  is_final?: boolean;
  channel?: {
    alternatives?: {
      transcript?: unknown;
      words?: { word?: unknown; confidence?: unknown }[];
    }[];
  };
}

/** Parses one websocket frame into an event, or null for frames that are not
 *  transcription results (metadata, keep-alives, malformed text). */
export function parseStreamMessage(raw: string): SttStreamEvent | null {
  let data: DeepgramResults;
  try {
    data = JSON.parse(raw) as DeepgramResults;
  } catch {
    return null;
  }
  if (data?.type !== "Results") return null;
  const alt = data.channel?.alternatives?.[0];
  if (!alt) return null;
  const text = typeof alt.transcript === "string" ? alt.transcript : "";
  const words = Array.isArray(alt.words)
    ? alt.words.map((w) => ({
        word: typeof w.word === "string" ? w.word : "",
        confidence: typeof w.confidence === "number" ? w.confidence : 1,
      }))
    : undefined;
  return { text, isFinal: data.is_final === true, words };
}

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return "";
}

/**
 * Opens the mic and a Deepgram live-transcription socket, forwarding every
 * Results frame to `onEvent`. Rejects if the mic is unavailable; transport
 * problems after that surface through `onError` (the caller should stop
 * the session — the stream does not auto-reconnect).
 */
export const openDeepgramStream: OpenStream = async (onEvent, onError) => {
  // Mint the token before opening the mic, so a broker failure doesn't leave
  // the recording indicator on while we bail out.
  const deepgramToken = await fetchBrokerKey("/deepgram/token");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const params = new URLSearchParams({
    model: "nova-3",
    language: "ar",
    interim_results: "true",
    punctuate: "false",
    smart_format: "false",
    endpointing: "300",
  });
  // Browser WebSockets can't set an Authorization header; Deepgram accepts the
  // credential through the subprotocol list instead. Ephemeral JWTs use
  // "bearer" — "token" is for raw API keys and 401s with a JWT (verified
  // against the live API).
  const socket = new WebSocket(`${STREAM_URL}?${params.toString()}`, [
    "bearer",
    deepgramToken,
  ]);

  let stopped = false;
  // Audio produced before the socket finishes its handshake — flushed on
  // open so the first words of the recitation aren't lost.
  const preOpen: Blob[] = [];

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e: BlobEvent) => {
    if (stopped || !e.data || e.data.size === 0) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
    else if (socket.readyState === WebSocket.CONNECTING) preOpen.push(e.data);
  };
  recorder.onerror = () => {
    if (!stopped) onError("Recording error");
  };
  recorder.start(RECORDER_TIMESLICE_MS);

  socket.onopen = () => {
    for (const blob of preOpen) socket.send(blob);
    preOpen.length = 0;
  };
  socket.onmessage = (msg: MessageEvent) => {
    if (stopped) return;
    const event = parseStreamMessage(String(msg.data));
    if (!event) return;
    // Dev logging (finals only — interims arrive several times a second).
    if (event.isFinal && event.text.trim()) {
      console.log(`[recite-stream] deepgram final: "${event.text.trim()}"`);
    }
    onEvent(event);
  };
  socket.onerror = () => {
    if (!stopped) onError("Transcription stream error");
  };
  socket.onclose = (event: CloseEvent) => {
    // A close the caller didn't ask for (auth rejection, network drop)
    // means no more words will ever arrive — the session must not sit
    // there looking alive.
    if (!stopped) {
      console.log(`[recite-stream] deepgram closed: code=${event.code} reason=${logText(event.reason)}`);
      onError("Transcription stream closed");
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      recorder.stop();
    } catch {
      // Already stopped — fine.
    }
    stream.getTracks().forEach((t) => t.stop());
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        // Socket died first — close() below still applies.
      }
    }
    socket.close();
  };

  return { stop };
};
