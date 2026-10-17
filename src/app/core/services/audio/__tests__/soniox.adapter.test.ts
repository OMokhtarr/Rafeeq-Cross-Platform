import { openSonioxStream } from "../stt/soniox.adapter";
import { fetchBrokerKey } from "../stt/broker";
import { startPcmCapture } from "../stt/pcm-capture";

jest.mock("../stt/broker");
jest.mock("../stt/pcm-capture", () => ({
  ...jest.requireActual("../stt/pcm-capture"),
  startPcmCapture: jest.fn(),
}));

/** Records what the adapter does to its socket; `open()` / `message()` /
 *  `serverClose()` play the server's side. */
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeSocket;

  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((msg: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string, public protocols: string[]) {
    FakeSocket.last = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  serverClose(code = 1000, reason = "") {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const EXPECTED_CONFIG = {
  model: "stt-rt-v5",
  audio_format: "pcm_s16le",
  sample_rate: 16000,
  num_channels: 1,
  language_hints: ["ar"],
  language_hints_strict: true,
  enable_endpoint_detection: true,
  max_endpoint_delay_ms: 500,
};

const realWebSocket = global.WebSocket;
let pushFrame: (frame: Float32Array) => void;
let captureStop: jest.Mock;

beforeEach(() => {
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  (fetchBrokerKey as jest.Mock).mockResolvedValue("snx_temp_x");
  captureStop = jest.fn();
  (startPcmCapture as jest.Mock).mockImplementation(async (onFrame: (f: Float32Array) => void) => {
    pushFrame = onFrame;
    return { stop: captureStop };
  });
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  (global as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
  jest.useRealTimers();
});

const open = async () => {
  const onEvent = jest.fn();
  const onError = jest.fn();
  const handle = await openSonioxStream(onEvent, onError);
  return { onEvent, onError, handle, socket: FakeSocket.last };
};

describe("openSonioxStream", () => {
  it("connects with the temporary key as a subprotocol and sends the config first", async () => {
    const { socket } = await open();
    expect(fetchBrokerKey).toHaveBeenCalledWith("/soniox/token");
    expect(socket.url).toBe("wss://stt-rt.soniox.com/transcribe-websocket");
    expect(socket.protocols).toEqual(["soniox-api-key", "snx_temp_x"]);
    socket.open();
    expect(typeof socket.sent[0]).toBe("string");
    expect(JSON.parse(socket.sent[0] as string)).toEqual(EXPECTED_CONFIG);
  });

  it("flushes frames captured before open in order, then streams Int16 PCM buffers", async () => {
    const { socket } = await open();
    pushFrame(new Float32Array([0.5]));
    pushFrame(new Float32Array([-1]));
    expect(socket.sent).toEqual([]);
    socket.open();
    pushFrame(new Float32Array([1]));

    const audio = socket.sent.slice(1);
    expect(audio).toHaveLength(3);
    audio.forEach((frame) => expect(frame).toBeInstanceOf(ArrayBuffer));
    expect(audio.map((frame) => Array.from(new Int16Array(frame as ArrayBuffer)))).toEqual([
      [16384],
      [-32767],
      [32767],
    ]);
  });

  it("forwards assembled events and logs finals", async () => {
    const { socket, onEvent } = await open();
    socket.open();
    socket.message({ tokens: [{ text: "الحمد", is_final: true, confidence: 0.8 }, { text: "<end>", is_final: true }] });
    expect(onEvent).toHaveBeenCalledWith({ text: "الحمد", isFinal: true, words: [{ word: "الحمد", confidence: 0.8 }] });
    expect(console.log).toHaveBeenCalledWith('[recite-stream] soniox final: "الحمد"');
  });

  it("reports a server error once, generically, and logs the raw message", async () => {
    const { socket, onError } = await open();
    socket.open();
    socket.message({ error_code: 401, error_type: "unauthenticated", error_message: "Invalid API key." });
    socket.serverClose();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Transcription stream error");
    expect(console.error).toHaveBeenCalledWith("[recite-stream] soniox error 401: Invalid API key.");
  });

  it("reports and logs an unexpected close before stop", async () => {
    const { socket, onError } = await open();
    socket.open();
    socket.serverClose(1006, "abnormal");
    expect(onError).toHaveBeenCalledWith("Transcription stream closed");
    expect(console.log).toHaveBeenCalledWith("[recite-stream] soniox closed: code=1006 reason=abnormal");
  });

  it("finalizes on stop and ignores messages and close after stop", async () => {
    jest.useFakeTimers();
    const { socket, onEvent, onError, handle } = await open();
    socket.open();
    handle.stop();
    expect(captureStop).toHaveBeenCalled();
    expect(socket.sent.slice(1)).toEqual(['{"type":"finalize"}', ""]);
    expect(socket.closed).toBe(false);

    socket.message({ tokens: [{ text: "مالك", is_final: true }, { text: "<fin>", is_final: true }] });
    socket.message({ error_code: 500, error_type: "internal", error_message: "boom" });
    socket.serverClose();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("soniox closed"));
  });

  it("closes the socket 2 s after stop if the server has not", async () => {
    jest.useFakeTimers();
    const { socket, handle } = await open();
    socket.open();
    handle.stop();
    jest.advanceTimersByTime(1999);
    expect(socket.closed).toBe(false);
    jest.advanceTimersByTime(1);
    expect(socket.closed).toBe(true);
  });

  it("does not open the mic when the broker fails", async () => {
    (fetchBrokerKey as jest.Mock).mockRejectedValue(new Error("Speech recognition is not available right now"));
    await expect(openSonioxStream(jest.fn(), jest.fn())).rejects.toThrow("not available");
    expect(startPcmCapture).not.toHaveBeenCalled();
  });
});
