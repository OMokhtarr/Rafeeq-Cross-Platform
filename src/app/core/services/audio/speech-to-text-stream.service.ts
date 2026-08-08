/**
 * STREAMING SPEECH-TO-TEXT SERVICE
 *
 * Real-time transcription for Recite Mode over Deepgram's websocket
 * streaming API (nova-3, Arabic). Words arrive a few hundred ms after
 * they're spoken — first as `interim` revisions of the current utterance
 * window, then as a settled `final`.
 */

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";

const STREAM_URL = "wss://api.deepgram.com/v1/listen";

/**
 * Fetch a short-lived Deepgram JWT from our token broker.
 *
 * The raw Deepgram API key must never reach the client: CRA inlines
 * REACT_APP_* values into the bundle, so a key here is extractable from any
 * installed APK. The broker holds the key as a Worker secret and mints a JWT
 * that is only needed for the WebSocket handshake.
 */
async function fetchDeepgramToken(): Promise<string> {
  if (!TOKEN_BROKER_URL) {
    throw new Error("Token broker is not configured");
  }
  // TOKEN_BROKER_URL may or may not carry a trailing slash.
  const base = TOKEN_BROKER_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/deepgram/token`, { method: "POST" });
  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? "Speech recognition is not available right now"
        : `Could not start speech recognition (${res.status})`,
    );
  }
  const { access_token: accessToken } = (await res.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Speech recognition token was empty");
  return accessToken;
}

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
  // Mint the token before opening the mic, so a broker failure doesn't leave
  // the recording indicator on while we bail out.
  const deepgramToken = await fetchDeepgramToken();

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
