import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useApplyPlaybackPrefs, type PlaybackPrefs } from "../usePlaybackPrefs";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREFS: PlaybackPrefs = {
  reciter: "4",
  playbackRate: 1.25,
  repeatVerse: 2,
  repeatRange: 3,
};

function makeQueue(currentVerse: string | null) {
  return {
    state: { currentVerse },
    setReciter: jest.fn(),
    setPlaybackRate: jest.fn(),
    setRepeatVerse: jest.fn(),
    setRepeatRange: jest.fn(),
  };
}

let root: Root;
beforeEach(() => {
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

const Harness: React.FC<{ queue: ReturnType<typeof makeQueue>; prefs: PlaybackPrefs }> = ({
  queue,
  prefs,
}) => {
  useApplyPlaybackPrefs(queue, prefs);
  return null;
};

const render = (queue: ReturnType<typeof makeQueue>, prefs: PlaybackPrefs) =>
  act(() => root.render(<Harness queue={queue} prefs={prefs} />));

describe("opening the playback sheet", () => {
  it("leaves a session that is playing exactly as it is", () => {
    const queue = makeQueue("2:144");
    render(queue, PREFS);
    expect(queue.setReciter).not.toHaveBeenCalled();
    expect(queue.setPlaybackRate).not.toHaveBeenCalled();
    expect(queue.setRepeatVerse).not.toHaveBeenCalled();
    expect(queue.setRepeatRange).not.toHaveBeenCalled();
  });

  it("gets the queue ready with the saved settings when nothing is playing", () => {
    const queue = makeQueue(null);
    render(queue, PREFS);
    expect(queue.setReciter).toHaveBeenCalledWith("4");
    expect(queue.setPlaybackRate).toHaveBeenCalledWith(1.25);
    expect(queue.setRepeatVerse).toHaveBeenCalledWith(2);
    expect(queue.setRepeatRange).toHaveBeenCalledWith(3);
  });

  it("does not apply settings again on a re-render", () => {
    const queue = makeQueue(null);
    render(queue, PREFS);
    render(queue, { ...PREFS });
    expect(queue.setReciter).toHaveBeenCalledTimes(1);
  });
});

describe("changing a setting while a session is playing", () => {
  it("applies the reciter the user picked", () => {
    const queue = makeQueue("2:144");
    render(queue, PREFS);
    render(queue, { ...PREFS, reciter: "7" });
    expect(queue.setReciter).toHaveBeenCalledTimes(1);
    expect(queue.setReciter).toHaveBeenCalledWith("7");
  });

  it("applies only the setting that changed", () => {
    const queue = makeQueue("2:144");
    render(queue, PREFS);
    render(queue, { ...PREFS, playbackRate: 1.5 });
    expect(queue.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(queue.setReciter).not.toHaveBeenCalled();
    expect(queue.setRepeatRange).not.toHaveBeenCalled();
  });
});
