import { useCallback, useRef, useState } from "react";

/**
 * USE MIC CHUNKS
 *
 * Captures microphone audio via the web MediaRecorder API and emits one
 * Blob every `chunkMs` milliseconds while listening, so callers (Recite
 * Mode) can transcribe near-live instead of waiting for the user to stop
 * speaking. Runs the same way in the browser and inside a Capacitor
 * WebView on iOS/Android — no native plugin required.
 *
 * Chunks overlap by half their length (two recorders on the same
 * MediaStream, started staggered) instead of butting up edge-to-edge —
 * a word spoken right at a boundary would otherwise get clipped in half
 * with no surrounding context for either fragment, which is a common
 * cause of garbled transcription at chunk edges.
 *
 * `start(true)` gates the chunk clock on actual speech: until the mic
 * level crosses a threshold, a short rolling pre-roll recorder is
 * restarted continuously (and its audio discarded), so leading silence
 * never eats into the first chunk. On detection the current pre-roll
 * recorder is *promoted* into chunk #1 — it keeps recording for the full
 * chunk length from that moment — so the onset of the first word (already
 * inside the pre-roll) is never clipped by detection latency.
 */

const CHUNK_MS = 6000;
const OVERLAP_MS = CHUNK_MS / 2;

/** Speech-gate tuning. RMS is of the analyser's time-domain signal (0..1);
 *  quiet room noise sits well under 0.01 while voice at phone distance is
 *  several times the threshold. Two consecutive hits are required so a
 *  single transient (tap, click) can't open the gate. If the gate is wrong
 *  in either direction it degrades gracefully: noise opening it early just
 *  reproduces today's behavior, and a never-opening gate is ended by the
 *  caller's silence timeout. */
const GATE_POLL_MS = 50;
const GATE_HITS_TO_OPEN = 2;
const GATE_RMS_THRESHOLD = 0.02;
const GATE_PREROLL_MS = 400;

interface GateRecorder {
  recorder: MediaRecorder;
  /** Mutable promotion flag read at stop time — pre-roll recorders that were
   *  never promoted discard their blob instead of delivering it. */
  promoted: { v: boolean };
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return "";
}

export interface UseMicChunksResult {
  listening: boolean;
  error: string | null;
  /** `waitForSpeech: true` delays the chunk clock until the mic actually
   *  hears something, so leading silence doesn't consume the first chunk. */
  start: (waitForSpeech?: boolean) => Promise<void>;
  stop: () => void;
  /** Switches to a new chunk length, restarting the recording cycle at the new cadence. No-op if not currently listening. */
  setChunkMs: (ms: number) => void;
}

export function useMicChunks(
  onChunk: (blob: Blob) => void,
  initialChunkMs: number = CHUNK_MS,
  initialOverlapMs: number = OVERLAP_MS,
): UseMicChunksResult {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordersRef = useRef<Set<MediaRecorder>>(new Set());
  const mimeTypeRef = useRef<string>("");
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const activeRef = useRef(false);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const chunkMsRef = useRef(initialChunkMs);
  const overlapMsRef = useRef(initialOverlapMs);
  // Speech-gate state (only used for start(true)).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gateRestartRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gateRecorderRef = useRef<GateRecorder | null>(null);
  const gateHitsRef = useRef(0);

  // MediaRecorder's `timeslice` argument only splits one continuous
  // recording into fragments — every fragment after the first is missing
  // the WebM/MP4 container header, so it can't be decoded standalone by
  // any STT API. Instead, each cycle starts a fresh recorder on the same
  // MediaStream and stop()s it after the current chunk length, which
  // always finalizes a complete, self-contained file. Two recorders run
  // staggered by half a chunk so consecutive chunks overlap instead of
  // butting up edge-to-edge.
  const recordOneChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;

    const recorder = new MediaRecorder(
      stream,
      mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined,
    );
    recordersRef.current.add(recorder);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) onChunkRef.current(e.data);
    };
    recorder.onerror = () => setError("Recording error");
    recorder.start();

    const stopTimeout = setTimeout(() => {
      recorder.stop();
      recordersRef.current.delete(recorder);
      stopTimeoutsRef.current.delete(stopTimeout);
    }, chunkMsRef.current);
    stopTimeoutsRef.current.add(stopTimeout);
  }, []);

  // Tears down the speech-gate (level polling, pre-roll restart loop, audio
  // graph). `discardRecorder` also stops the un-promoted pre-roll recorder —
  // promotion handles its own recorder and passes false.
  const clearGate = useCallback((discardRecorder: boolean) => {
    if (gatePollRef.current !== null) {
      clearInterval(gatePollRef.current);
      gatePollRef.current = null;
    }
    if (gateRestartRef.current !== null) {
      clearInterval(gateRestartRef.current);
      gateRestartRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (discardRecorder && gateRecorderRef.current) {
      gateRecorderRef.current.recorder.stop(); // never promoted → blob discarded
      gateRecorderRef.current = null;
    }
    gateHitsRef.current = 0;
  }, []);

  // Cancels the recording cadence (cycle interval + pending stagger/stop
  // timers) without releasing the mic stream, so it can be restarted at a
  // different cadence via setChunkMs without re-prompting for permission.
  const stopCycle = useCallback(() => {
    clearGate(true);
    if (cycleIntervalRef.current !== null) {
      clearInterval(cycleIntervalRef.current);
      cycleIntervalRef.current = null;
    }
    if (staggerTimeoutRef.current !== null) {
      clearTimeout(staggerTimeoutRef.current);
      staggerTimeoutRef.current = null;
    }
    stopTimeoutsRef.current.forEach((t) => clearTimeout(t));
    stopTimeoutsRef.current.clear();
    recordersRef.current.forEach((r) => r.stop());
    recordersRef.current.clear();
  }, [clearGate]);

  // Kicks off the staggered second recorder and the steady interval — the
  // shared tail of both the ungated cycle (whose first recorder is
  // recordOneChunk) and the gated cycle (whose first recorder is the
  // promoted pre-roll).
  const startStagger = useCallback(() => {
    staggerTimeoutRef.current = setTimeout(() => {
      staggerTimeoutRef.current = null;
      if (!activeRef.current) return;
      recordOneChunk();
      cycleIntervalRef.current = setInterval(recordOneChunk, chunkMsRef.current);
    }, overlapMsRef.current);
  }, [recordOneChunk]);

  const startCycle = useCallback(() => {
    recordOneChunk();
    startStagger();
  }, [recordOneChunk, startStagger]);

  // Starts (or restarts) the rolling pre-roll recorder. Each pre-roll is
  // discarded unless promoted, so at promotion time the live one holds at
  // most GATE_PREROLL_MS of trailing silence plus the speech onset.
  const beginGateRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;
    if (gateRecorderRef.current) gateRecorderRef.current.recorder.stop();

    const promoted = { v: false };
    const recorder = new MediaRecorder(
      stream,
      mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined,
    );
    recorder.ondataavailable = (e: BlobEvent) => {
      if (promoted.v && e.data && e.data.size > 0) onChunkRef.current(e.data);
    };
    recorder.onerror = () => setError("Recording error");
    recorder.start();
    gateRecorderRef.current = { recorder, promoted };
  }, []);

  // Speech detected: the live pre-roll recorder becomes chunk #1 — it keeps
  // recording for a full chunk length from *now*, so the chunk clock
  // effectively starts at the reciter's first word, not at mic-open.
  const promoteGateRecorder = useCallback(() => {
    const gate = gateRecorderRef.current;
    gateRecorderRef.current = null;
    clearGate(false);
    if (!activeRef.current) return;
    if (!gate) {
      startCycle();
      return;
    }

    gate.promoted.v = true;
    recordersRef.current.add(gate.recorder);
    const stopTimeout = setTimeout(() => {
      gate.recorder.stop();
      recordersRef.current.delete(gate.recorder);
      stopTimeoutsRef.current.delete(stopTimeout);
    }, chunkMsRef.current);
    stopTimeoutsRef.current.add(stopTimeout);
    startStagger();
  }, [clearGate, startCycle, startStagger]);

  // Watches the mic level and opens the gate on sustained sound. If the
  // audio graph can't be built (old WebView), falls back to the ungated
  // cycle — worse first-chunk alignment, but never a dead mic.
  const startGatedCycle = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;
    try {
      type AudioContextCtor = typeof AudioContext;
      const Ctor: AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
      const ctx = new Ctor();
      ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;

      const samples = new Uint8Array(analyser.fftSize);
      beginGateRecorder();
      gateRestartRef.current = setInterval(beginGateRecorder, GATE_PREROLL_MS);
      gatePollRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const d = (samples[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / samples.length);
        gateHitsRef.current = rms >= GATE_RMS_THRESHOLD ? gateHitsRef.current + 1 : 0;
        if (gateHitsRef.current >= GATE_HITS_TO_OPEN) promoteGateRecorder();
      }, GATE_POLL_MS);
    } catch {
      clearGate(true);
      startCycle();
    }
  }, [beginGateRecorder, promoteGateRecorder, clearGate, startCycle]);

  const stop = useCallback(() => {
    activeRef.current = false;
    stopCycle();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setListening(false);
  }, [stopCycle]);

  const start = useCallback(
    async (waitForSpeech: boolean = false) => {
      if (activeRef.current) return; // already listening
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        mimeTypeRef.current = pickMimeType();
        activeRef.current = true;

        if (waitForSpeech) startGatedCycle();
        else startCycle();

        setListening(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Microphone access denied");
        setListening(false);
      }
    },
    [startCycle, startGatedCycle],
  );

  const setChunkMs = useCallback(
    (ms: number) => {
      if (chunkMsRef.current === ms) return;
      chunkMsRef.current = ms;
      overlapMsRef.current = ms / 2;
      if (!activeRef.current) return;
      stopCycle();
      startCycle();
    },
    [stopCycle, startCycle],
  );

  return { listening, error, start, stop, setChunkMs };
}
