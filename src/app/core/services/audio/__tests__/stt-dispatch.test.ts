import { readReciteEngine } from "../stt-engine.config";
import { openSttStream } from "../speech-to-text-stream.service";
import { openDeepgramStream } from "../stt/deepgram.adapter";
import { openSonioxStream } from "../stt/soniox.adapter";

jest.mock("../stt/deepgram.adapter");
jest.mock("../stt/soniox.adapter");

describe("readReciteEngine", () => {
  beforeEach(() => localStorage.clear());

  it("reads deepgram when nothing is saved", () => {
    expect(readReciteEngine()).toBe("deepgram");
  });

  it("reads the saved engine", () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "soniox" }));
    expect(readReciteEngine()).toBe("soniox");
  });

  it("falls back on an unknown engine or bad JSON", () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "groq" }));
    expect(readReciteEngine()).toBe("deepgram");
    localStorage.setItem("rafiq_settings_v1", "{oops");
    expect(readReciteEngine()).toBe("deepgram");
  });
});

describe("openSttStream", () => {
  beforeEach(() => {
    localStorage.clear();
    (openDeepgramStream as jest.Mock).mockResolvedValue({ stop: jest.fn() });
    (openSonioxStream as jest.Mock).mockResolvedValue({ stop: jest.fn() });
  });

  it("routes deepgram to the deepgram adapter, reading the setting per call", async () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "deepgram" }));
    await openSttStream(jest.fn(), jest.fn());
    expect(openDeepgramStream).toHaveBeenCalledTimes(1);
  });

  it("routes soniox to the soniox adapter", async () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "soniox" }));
    const onEvent = jest.fn();
    const onError = jest.fn();
    await openSttStream(onEvent, onError);
    expect(openSonioxStream).toHaveBeenCalledWith(onEvent, onError);
    expect(openDeepgramStream).not.toHaveBeenCalled();
  });

  it("re-reads the setting on every call", async () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "soniox" }));
    await openSttStream(jest.fn(), jest.fn());
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "deepgram" }));
    await openSttStream(jest.fn(), jest.fn());
    expect(openSonioxStream).toHaveBeenCalledTimes(1);
    expect(openDeepgramStream).toHaveBeenCalledTimes(1);
  });
});
