import { AudioSegment, createPauseSegmenter } from "../stt/whisper/pause-segmenter";

const FRAME = 1024;
const FRAME_MS = 64;

function frames(ms: number, sample: (i: number) => number): Float32Array[] {
  return Array.from({ length: Math.ceil(ms / FRAME_MS) }, () =>
    Float32Array.from({ length: FRAME }, (_, i) => sample(i)),
  );
}

const loud = (ms: number) => frames(ms, (i) => 0.1 * Math.sin((2 * Math.PI * 440 * i) / 16000));
const quiet = (ms: number) => frames(ms, () => 0);

function feed(input: Float32Array[], seg = createPauseSegmenter()): AudioSegment[] {
  return input.flatMap((frame) => seg.push(frame));
}

describe("pause segmenter", () => {
  it("returns nothing for pure silence", () => {
    expect(feed(quiet(3000))).toEqual([]);
  });

  it("cuts at a pause and trims the trailing silence to ~150 ms", () => {
    const [s] = feed([...quiet(1000), ...loud(2000), ...quiet(600)]);
    expect(s.forced).toBe(false);
    const ms = (s.samples.length / 16000) * 1000;
    expect(ms).toBeGreaterThanOrEqual(2000 + 150); // speech + tail (+ pre-roll)
    expect(ms).toBeLessThanOrEqual(400 + 2000 + 150 + 64); // never the whole pause
  });

  it("keeps the pre-roll so the first sound isn't clipped", () => {
    const [s] = feed([...quiet(1000), ...loud(1000), ...quiet(600)]);
    expect(s.speechSpans[0].startMs).toBeGreaterThanOrEqual(300);
  });

  it("does not cut on a pause shorter than 350 ms", () => {
    expect(feed([...loud(1000), ...quiet(200), ...loud(1000), ...quiet(600)])).toHaveLength(1);
  });

  it("drops a cough-length burst", () => {
    // Review Focus 3
    expect(feed([...quiet(500), ...loud(128), ...quiet(600)])).toEqual([]);
  });

  it("force-cuts continuous speech by 8 s and overlaps the next segment by 1 s", () => {
    // Review Focus 5
    const segs = feed([...loud(9000), ...quiet(600)]);
    expect(segs[0].forced).toBe(true);
    expect(segs[0].samples.length / 16).toBeLessThanOrEqual(8000 + 64);
    expect(segs[1].startsWithOverlap).toBe(true);
  });

  it("seeds the next segment with the last second of the forced segment", () => {
    const [first, second] = feed([...loud(9000), ...quiet(600)]);
    const overlap = first.samples.subarray(first.samples.length - 16000);
    expect(Array.from(second.samples.subarray(0, 16000))).toEqual(Array.from(overlap));
    expect(second.forced).toBe(false);
    expect(second.speechSpans[0].startMs).toBe(0);
  });
});
