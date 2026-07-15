/**
 * STREAMING SPEECH-TO-TEXT SERVICE
 *
 * Real-time transcription for Recite Mode over Deepgram's websocket
 * streaming API (nova-3, Arabic). Words arrive a few hundred ms after
 * they're spoken — first as `interim` revisions of the current utterance
 * window, then as a settled `final`.
 */

const DEEPGRAM_API_KEY = process.env.REACT_APP_DEEPGRAM_API_KEY ?? "";

const STREAM_URL = "wss://api.deepgram.com/v1/listen";

/** MediaRecorder delivery cadence. Deepgram accepts containerized
 *  webm/opus fragments directly, so small timeslices stream near-live
 *  without any PCM re-encoding. */
const RECORDER_TIMESLICE_MS = 250;

export interface SttStreamEvent {
  /** Transcript of the current utterance window. Interims are cumulative
   *  revisions of this window (each one replaces the last); a final settles
   *  the window and the next event starts a fresh one. */
  text: string;
  isFinal: boolean;
}

export interface SttStreamHandle {
  /** Closes the socket and releases the mic. Safe to call more than once. */
  stop: () => void;
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
export async function openSttStream(
  onEvent: (event: SttStreamEvent) => void,
  onError: (message: string) => void,
): Promise<SttStreamHandle> {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("Deepgram API key is not configured");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const params = new URLSearchParams({
    model: "nova-3",
    language: "ar",
    interim_results: "true",
    punctuate: "false",
    smart_format: "false",
    endpointing: "300",
  });
  // Browser WebSockets can't set an Authorization header; Deepgram accepts
  // the key through the subprotocol list instead.
  const socket = new WebSocket(`${STREAM_URL}?${params.toString()}`, [
    "token",
    DEEPGRAM_API_KEY,
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
    try {
      const data = JSON.parse(String(msg.data));
      if (data.type !== "Results") return;
      const alt = data.channel?.alternatives?.[0];
      if (!alt) return;
      const text = typeof alt.transcript === "string" ? alt.transcript : "";
      // Dev logging (finals only — interims arrive several times a second).
      if (data.is_final === true && text.trim()) {
        console.log(`[recite-stream] final: "${text.trim()}"`);
      }
      onEvent({ text, isFinal: data.is_final === true });
    } catch {
      // Non-JSON frame — ignore.
    }
  };
  socket.onerror = () => {
    if (!stopped) onError("Transcription stream error");
  };
  socket.onclose = () => {
    // A close the caller didn't ask for (auth rejection, network drop)
    // means no more words will ever arrive — the session must not sit
    // there looking alive.
    if (!stopped) onError("Transcription stream closed");
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
}
