import {
  createWhisperPipeline,
  openWhisperStream,
  transcribeSegment,
  WhisperResult,
} from "../stt/whisper/whisper.adapter";
import { brokerUrl } from "../stt/broker";
import { startPcmCapture } from "../stt/pcm-capture";
import type { AudioSegment } from "../stt/whisper/pause-segmenter";

jest.mock("../stt/broker", () => ({
  ...jest.requireActual("../stt/broker"),
  brokerUrl: jest.fn(),
}));
jest.mock("../stt/pcm-capture", () => ({
  ...jest.requireActual("../stt/pcm-capture"),
  startPcmCapture: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 0.5 s of zeros, all of it marked as speech. */
function seg(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    samples: new Float32Array(8000),
    speechSpans: [{ startMs: 0, endMs: 500 }],
    forced: false,
    startsWithOverlap: false,
    ...overrides,
  };
}

const texts = (onEvent: jest.Mock) => onEvent.mock.calls.map((c) => c[0].text);

describe("createWhisperPipeline", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("uploads each phrase as a 16 kHz WAV as soon as it is submitted", () => {
    const transcribe = jest.fn(() => new Promise<WhisperResult>(() => undefined));
    const p = createWhisperPipeline(transcribe, jest.fn(), jest.fn());
    p.submit(seg());
    p.submit(seg());
    expect(transcribe).toHaveBeenCalledTimes(2);
    const wav = (transcribe.mock.calls[0] as unknown[])[0] as Blob;
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 8000 * 2);
  });

  it("emits phrases in recording order even when the second returns first", async () => {
    const d = [deferred<WhisperResult>(), deferred<WhisperResult>()];
    let i = 0;
    const onEvent = jest.fn();
    const p = createWhisperPipeline(() => d[i++].promise, onEvent, jest.fn());
    p.submit(seg());
    p.submit(seg());
    d[1].resolve({ text: "الرحيم" });
    await flush();
    expect(onEvent).not.toHaveBeenCalled();
    d[0].resolve({ text: "الرحمن" });
    await flush();
    expect(texts(onEvent)).toEqual(["الرحمن", "الرحيم"]);
  });

  it("emits a final with every word at confidence 1", async () => {
    const onEvent = jest.fn();
    const p = createWhisperPipeline(async () => ({ text: " الحمد لله " }), onEvent, jest.fn());
    p.submit(seg());
    await flush();
    expect(onEvent).toHaveBeenCalledWith({
      text: "الحمد لله",
      isFinal: true,
      words: [
        { word: "الحمد", confidence: 1 },
        { word: "لله", confidence: 1 },
      ],
    });
  });

  it("stitches only overlapped segments", async () => {
    const results: WhisperResult[] = [{ text: "الرحمن الرحيم" }, { text: "الرحيم مالك" }];
    let i = 0;
    const onEvent = jest.fn();
    const p = createWhisperPipeline(async () => results[i++], onEvent, jest.fn());
    p.submit(seg());
    p.submit(seg({ forced: false, startsWithOverlap: true }));
    await flush();
    expect(texts(onEvent)).toEqual(["الرحمن الرحيم", "مالك"]);
  });

  it("keeps a repeated word at the start of a pause-cut phrase", async () => {
    const results: WhisperResult[] = [{ text: "ربكما تكذبان" }, { text: "تكذبان فبأي آلاء" }];
    let i = 0;
    const onEvent = jest.fn();
    const p = createWhisperPipeline(async () => results[i++], onEvent, jest.fn());
    p.submit(seg());
    p.submit(seg());
    await flush();
    expect(texts(onEvent)).toEqual(["ربكما تكذبان", "تكذبان فبأي آلاء"]);
  });

  it("reports the first failure once and stops emitting", async () => {
    const d = [deferred<WhisperResult>(), deferred<WhisperResult>(), deferred<WhisperResult>()];
    let i = 0;
    const onEvent = jest.fn();
    const onError = jest.fn();
    const p = createWhisperPipeline(() => d[i++].promise, onEvent, onError);
    p.submit(seg());
    p.submit(seg());
    p.submit(seg());
    d[0].reject(new Error("Speech recognition limit reached for today"));
    d[1].reject(new Error("boom"));
    d[2].resolve({ text: "مالك" });
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Speech recognition limit reached for today");
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores results that land after stop", async () => {
    const d = [deferred<WhisperResult>(), deferred<WhisperResult>()];
    let i = 0;
    const onEvent = jest.fn();
    const onError = jest.fn();
    const p = createWhisperPipeline(() => d[i++].promise, onEvent, onError);
    p.submit(seg());
    p.submit(seg());
    p.stop();
    d[0].resolve({ text: "الرحمن" });
    d[1].reject(new Error("boom"));
    await flush();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("emits nothing for a phrase whose words were all filtered", async () => {
    const onEvent = jest.fn();
    const p = createWhisperPipeline(
      async () => ({
        text: "ترجمة نانسي قنقر",
        segments: [{ text: "ترجمة نانسي قنقر", no_speech_prob: 0.9 }],
      }),
      onEvent,
      jest.fn(),
    );
    p.submit(seg());
    await flush();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("filters a text-only result like any other", async () => {
    const onEvent = jest.fn();
    const p = createWhisperPipeline(async () => ({ text: "ترجمة نانسي قنقر" }), onEvent, jest.fn());
    p.submit(seg());
    await flush();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reports a throwing event handler once instead of freezing", async () => {
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    const onEvent = jest.fn(() => {
      throw new Error("handler broke");
    });
    const onError = jest.fn();
    const p = createWhisperPipeline(async () => ({ text: "الرحمن" }), onEvent, onError);
    p.submit(seg());
    p.submit(seg());
    await flush();
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("handler broke");
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("gives up on an upload after 15 s", async () => {
    jest.useFakeTimers();
    let signal!: AbortSignal;
    const onError = jest.fn();
    const p = createWhisperPipeline(
      (_wav, s) => {
        signal = s;
        return new Promise<WhisperResult>(() => undefined);
      },
      jest.fn(),
      onError,
    );
    p.submit(seg());
    jest.advanceTimersByTime(14999);
    expect(signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    jest.useRealTimers();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Speech recognition timed out");
  });

  it("aborts uploads in flight on stop, without reporting it", async () => {
    const signals: AbortSignal[] = [];
    const onError = jest.fn();
    const p = createWhisperPipeline(
      (_wav, signal) =>
        new Promise<WhisperResult>((_, reject) => {
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      jest.fn(),
      onError,
    );
    p.submit(seg());
    p.submit(seg());
    p.stop();
    await flush();
    expect(signals.map((s) => s.aborted)).toEqual([true, true]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("logs each phrase with what the filters dropped", async () => {
    const p = createWhisperPipeline(
      async () => ({
        text: "قل أعوذ",
        segments: [
          {
            text: "قل أعوذ",
            words: [
              { word: "قل", start: 0.1, end: 0.4 },
              { word: "أعوذ", start: 2.0, end: 2.4 },
            ],
          },
        ],
      }),
      jest.fn(),
      jest.fn(),
    );
    p.submit(seg({ forced: true }));
    await flush();
    expect(console.log).toHaveBeenCalledWith(
      '[recite-stream] cloudflare-whisper phrase: raw="قل أعوذ" durationMs=500 forced=true ' +
        "startsWithOverlap=false speechMs=500 droppedHallucination=0 droppedSilence=1 " +
        'droppedSeam=0 cleaned="قل"',
    );
  });

  it("logs a phrase the filters emptied", async () => {
    const p = createWhisperPipeline(async () => ({ text: "ترجمة نانسي قنقر" }), jest.fn(), jest.fn());
    p.submit(seg());
    await flush();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("droppedHallucination=3"));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/cleaned=\(all filtered\)$/));
  });
});

describe("transcribeSegment", () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    (brokerUrl as jest.Mock).mockImplementation((path: string) => `https://broker.test${path}`);
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const respond = (status: number, body: unknown = {}) =>
    fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

  it("POSTs the WAV to the broker and returns the transcript", async () => {
    const segments = [{ text: "الحمد", start: 0, end: 0.4 }];
    respond(200, { text: "الحمد", segments });
    const wav = new Blob([new Uint8Array(4)], { type: "audio/wav" });
    const signal = new AbortController().signal;
    await expect(transcribeSegment(wav, signal)).resolves.toEqual({ text: "الحمد", segments });
    expect(fetchMock).toHaveBeenCalledWith("https://broker.test/whisper/transcribe", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: wav,
      signal,
    });
  });

  it("names the broker's unavailable and quota responses", async () => {
    const wav = new Blob([], { type: "audio/wav" });
    const signal = new AbortController().signal;
    respond(503);
    await expect(transcribeSegment(wav, signal)).rejects.toThrow("Speech recognition is not available right now");
    respond(429);
    await expect(transcribeSegment(wav, signal)).rejects.toThrow("Speech recognition limit reached for today");
    respond(502);
    await expect(transcribeSegment(wav, signal)).rejects.toThrow("502");
  });
});

describe("openWhisperStream", () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  let pushFrame: (frame: Float32Array) => void;
  let captureStop: jest.Mock;

  const tone = () => Float32Array.from({ length: 1024 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 440 * i) / 16000));
  const silence = () => new Float32Array(1024);
  /** ~640 ms of speech followed by a pause long enough to cut it. */
  const recitePhrase = () => {
    for (let n = 0; n < 10; n++) pushFrame(tone());
    for (let n = 0; n < 8; n++) pushFrame(silence());
  };

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "الحمد لله" }) });
    (brokerUrl as jest.Mock).mockImplementation((path: string) => `https://broker.test${path}`);
    captureStop = jest.fn();
    (startPcmCapture as jest.Mock).mockImplementation(async (onFrame: (f: Float32Array) => void) => {
      pushFrame = onFrame;
      return { stop: captureStop };
    });
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("transcribes a pause-cut phrase and logs the final", async () => {
    const onEvent = jest.fn();
    await openWhisperStream(onEvent, jest.fn());
    recitePhrase();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: "الحمد لله", isFinal: true }));
    expect(console.log).toHaveBeenCalledWith('[recite-stream] cloudflare-whisper final: "الحمد لله"');
  });

  it("stops the mic and drops phrases still uploading", async () => {
    const onEvent = jest.fn();
    const onError = jest.fn();
    const handle = await openWhisperStream(onEvent, onError);
    recitePhrase();
    handle.stop();
    await flush();
    expect(captureStop).toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not open the mic when the broker is not configured", async () => {
    (brokerUrl as jest.Mock).mockImplementation(() => {
      throw new Error("Token broker is not configured");
    });
    await expect(openWhisperStream(jest.fn(), jest.fn())).rejects.toThrow("not configured");
    expect(startPcmCapture).not.toHaveBeenCalled();
  });
});
