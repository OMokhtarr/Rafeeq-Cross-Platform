import { startPcmCapture } from "../stt/pcm-capture";

/** A context whose `resume()` lands in `state`, and whose node creation can
 *  be made to throw. */
function fakeContext(state: AudioContextState, failNodes = false) {
  const node = () => ({ connect: jest.fn(), disconnect: jest.fn(), onaudioprocess: null });
  return {
    state: "suspended" as AudioContextState,
    destination: {},
    resume: jest.fn(async function (this: { state: AudioContextState }) {
      this.state = state;
    }),
    close: jest.fn(async () => undefined),
    createMediaStreamSource: jest.fn(() => {
      if (failNodes) throw new Error("no source");
      return node();
    }),
    createScriptProcessor: jest.fn(node),
  };
}

const realAudioContext = (global as unknown as { AudioContext?: unknown }).AudioContext;
let track: { stop: jest.Mock };
let context: ReturnType<typeof fakeContext>;

function useContext(ctx: ReturnType<typeof fakeContext>) {
  context = ctx;
  (global as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ctx);
}

beforeEach(() => {
  track = { stop: jest.fn() };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [track] })) },
  });
});

afterEach(() => {
  (global as unknown as { AudioContext: unknown }).AudioContext = realAudioContext;
});

describe("startPcmCapture", () => {
  it("resumes the context and stops cleanly", async () => {
    useContext(fakeContext("running"));
    const capture = await startPcmCapture(jest.fn());
    expect(context.resume).toHaveBeenCalled();
    capture.stop();
    expect(context.close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("releases the mic when the audio graph cannot be built", async () => {
    useContext(fakeContext("running", true));
    await expect(startPcmCapture(jest.fn())).rejects.toThrow("no source");
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });

  it("refuses a context that stays suspended, releasing the mic", async () => {
    useContext(fakeContext("suspended"));
    await expect(startPcmCapture(jest.fn())).rejects.toThrow("Microphone audio could not start");
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });

  it("does not throw on stop when closing the context fails", async () => {
    useContext(fakeContext("running"));
    context.close.mockRejectedValue(new Error("already closed"));
    const capture = await startPcmCapture(jest.fn());
    expect(() => capture.stop()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
