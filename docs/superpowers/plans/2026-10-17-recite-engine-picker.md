# Recite Engine Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing Settings "Recitation recognition engine" dropdown chooses between Deepgram, Soniox and Cloudflare Whisper. Every recite surface (viewer and both quizzes) uses the chosen engine.

**Architecture:**
- `openSttStream()` becomes a dispatcher. It reads the saved setting at each session start and delegates to one adapter per engine. Each adapter emits the existing `SttStreamEvent` contract, so `deepgramDriver.ts`, `useIdentifySession.ts` and `useQuizRecite.ts` keep their logic.
- Soniox streams 16 kHz PCM over a websocket with a broker-minted temporary key.
- Whisper cuts the mic audio at the reciter's pauses and trims the silence. It uploads each phrase as a WAV to a new Worker route that runs Workers AI, then cleans the result before emitting one final per phrase.

**Builder's calls the spec left open:**
- Both new engines capture raw 16 kHz PCM through Web Audio instead of using MediaRecorder.
  - Soniox gets `pcm_s16le`, so it doesn't depend on webm support.
  - Whisper gets WAV, which allows exact sample-level trimming of the silence. You can't trim a webm/opus blob without decoding it.
- The restored `useMicChunks` dual-recorder design isn't needed.

**Tech Stack:**
- React 18 + TypeScript (CRA, Jest via `react-scripts test`), Capacitor WebView, Web Audio API.
- Cloudflare Worker (`token-broker/`, wrangler 3) with the Workers AI binding.

**Spec:** `docs/superpowers/specs/2026-10-17-recite-engine-picker-design.md`

## Global Constraints

**Event contract and existing logic**
- The event contract stays exactly `SttStreamEvent = { text: string; isFinal: boolean; words?: SttWord[] }`. Interims are cumulative revisions of the current window; a final settles it.
- No logic changes in `deepgramDriver.ts`, `useIdentifySession.ts`, `useQuizRecite.ts`, `useReciteMode.ts`, the quiz pages, or the stop contract. The user decided "fix the engines, leave the app as it is". Import-path updates are allowed.
- Deepgram behaviour stays identical: nova-3, `language=ar`, 250 ms webm/opus timeslices, `interim_results=true`, `punctuate=false`, `smart_format=false`, `endpointing=300`, broker `/deepgram/token`, `["bearer", token]` subprotocol.
- There's no silent fallback between engines. A failing engine surfaces through `onError` / the mic-error path.

**Settings and keys**
- The setting is read from localStorage key `rafiq_settings_v1`, field `reciteEngine`, at every session start. An unknown or missing value becomes `DEFAULT_RECITE_ENGINE = "deepgram"`.
- No secret key goes in the client bundle (`REACT_APP_*` values are inlined into the APK).
  - Soniox keys come from broker `/soniox/token`.
  - Whisper audio goes through broker `/whisper/transcribe`.

**Soniox settings**
- WebSocket: `wss://stt-rt.soniox.com/transcribe-websocket`, subprotocols `["soniox-api-key", key]`. No `api_key` in the config.
- Config: model `stt-rt-v5`, `audio_format: "pcm_s16le"`, `sample_rate: 16000`, `num_channels: 1`, `language_hints: ["ar"]`, `language_hints_strict: true`, `enable_endpoint_detection: true`, `max_endpoint_delay_ms: 500`.
- Temporary key: `POST https://api.soniox.com/v1/auth/temporary-api-key` with `Authorization: Bearer <SONIOX_API_KEY>` and body `{ usage_type: "transcribe_websocket", expires_in_seconds: 60, single_use: true }`. The response (201) is `{ api_key, expires_at }`.
- Markers: `<end>` is the endpoint marker and `<fin>` is the finalize-complete marker; both arrive as final tokens. Spaces arrive as their own tokens.
- Stop: send `{"type":"finalize"}`, then an empty text frame `""`.

**Whisper settings**
- Model `@cf/openai/whisper-large-v3-turbo`, input `{ audio: <base64 WAV>, language: "ar", vad_filter: true, condition_on_previous_text: false, hallucination_silence_threshold: 0.5 }`. No `initial_prompt` or `prefix`.
- Output: `{ text, segments[]: { start, end, text, avg_logprob, no_speech_prob, compression_ratio, words[]: { word, start, end } } }`.
- Starting values for pause segmentation:
  - RMS threshold `0.02`, with 2 frames above it to open;
  - pre-roll 400 ms;
  - pause 350 ms;
  - silent tail kept 150 ms;
  - hard cap 5000 ms, with a forced-cut overlap of 1000 ms;
    (Lowered from 8000 ms after the final review: the app's 10 s silence timeout
    starts with the session and only text resets it, so a hesitation plus upload
    and inference could push the first words of an 8 s phrase past it.)
  - minimum speech 250 ms;
  - analysis frame 1024 samples at 16 kHz (64 ms).

**Copy, logging and code rules**
- Dropdown labels:
  - Deepgram: unchanged.
  - Soniox: `labelAr: "Soniox — بث فوري"`, `labelEn: "Soniox — live streaming"`.
  - Whisper: `labelAr: "Cloudflare Whisper — مقاطع قصيرة"`, `labelEn: "Cloudflare Whisper — short chunks"`.
- Dev logs keep the `[recite-stream]` prefix and add the engine name, e.g. `[recite-stream] soniox final: "…"`.
- No `// eslint-disable` comments of any kind (project rule).
- Jest runs with CRA `resetMocks: true`. Set mock implementations inside `beforeEach`/the test, never in the `jest.mock` factory return values.
- Test command: `CI=true npx react-scripts test --watchAll=false --testPathPattern <pattern>`. Typecheck: `npx tsc --noEmit`.
- Don't run `npm run build`, `cap sync`, gradle or `wrangler deploy`. The user builds and deploys.
- `npx wrangler deploy --dry-run --outdir <scratch>` (bundles, no upload) is allowed for checking the Worker.

## Review Focus

1. **Whisper results coming back out of order.** Phrase N+1's request can finish before phrase N's. Events must still be emitted in recording order. Test: the Task 6 pipeline test with a reversed resolution order.
2. **Stopping mid-upload.** A Whisper phrase still uploading, or Soniox messages arriving after `stop()`, must produce no events and no `onError`. Tests: Task 6 "stop drops pending", and Task 3 "messages after stop are ignored".
3. **A cough or tap mistaken for speech.** Without a guard, a short noise burst becomes a chunk Whisper fills with invented verse. Segments with less than 250 ms of above-threshold audio are discarded. Test: the Task 4 short-burst test.
4. **A word that really repeats at a forced-cut seam** (e.g. "فبأي آلاء ربكما تكذبان" across a cut). Stitching removes overlap only for segments marked `startsWithOverlap`, and only words that match the previous tail. A pause-cut segment repeating the previous phrase keeps every word. Test: in Task 5.
5. **Long unbroken recitation (>5 s) against the 10 s silence timeout.** The forced cut at 5 s keeps events flowing well within `SILENCE_TIMEOUT_MS = 10000`. Test: the Task 4 test that a 9 s continuous tone yields a forced segment by 5 s. (The cap was 8 s until the final review lowered it for this timeout.)

---

## File Structure

New folder `src/app/core/services/audio/stt/`, one file per responsibility:

| File | Responsibility |
|---|---|
| `stt/types.ts` | `SttWord`, `SttStreamEvent`, `SttStreamHandle`, `OpenStream` (moved from the stream service) |
| `stt/broker.ts` | Broker URL + temporary-credential fetch shared by Deepgram and Soniox |
| `stt/deepgram.adapter.ts` | Today's Deepgram code, moved verbatim, plus `parseStreamMessage` |
| `stt/pcm-capture.ts` | Mic → 16 kHz mono Float32 frames (Web Audio), `floatToPcm16` |
| `stt/wav.ts` | `encodeWav` |
| `stt/soniox.assembler.ts` | Pure: Soniox token messages → `SttStreamEvent`s |
| `stt/soniox.adapter.ts` | Soniox socket lifecycle |
| `stt/whisper/pause-segmenter.ts` | Pure: frames → speech segments cut at pauses, silence trimmed |
| `stt/whisper/whisper-postprocess.ts` | Pure: hallucination filters, silence-word drop, seam stitch |
| `stt/whisper/whisper.adapter.ts` | Upload pipeline (ordering, stop) + capture wiring |

Modified files:
- `speech-to-text-stream.service.ts`: becomes the dispatcher and re-exports the types and `parseStreamMessage`, so existing imports keep working.
- `stt-engine.config.ts`: union, options, `readReciteEngine`.
- `token-broker/src/index.ts`, `token-broker/wrangler.toml`, `token-broker/verify-deploy.sh`.
- `PLAY-CONSOLE-PREP.md`, `PLAY-LISTING-COPY.md`.

Tests live in `src/app/core/services/audio/__tests__/`, which matches the existing `speech-to-text-stream.service.test.ts`.

---

### Task 1: Dispatcher seam, with Deepgram moved behind it

**Files:**
- Create: `src/app/core/services/audio/stt/types.ts`, `stt/broker.ts`, `stt/deepgram.adapter.ts`
- Modify: `src/app/core/services/audio/speech-to-text-stream.service.ts` (whole file becomes the dispatcher)
- Modify: `src/app/core/services/audio/stt-engine.config.ts`
- Test: `src/app/core/services/audio/__tests__/stt-dispatch.test.ts`. The existing `speech-to-text-stream.service.test.ts` must still pass, unchanged.

**Interfaces:**
- Produces:
  - `types.ts`:
    - `SttWord { word: string; confidence: number }`
    - `SttStreamEvent`
    - `SttStreamHandle { stop(): void }`
    - `type OpenStream = (onEvent: (e: SttStreamEvent) => void, onError: (msg: string) => void) => Promise<SttStreamHandle>`
  - `broker.ts`:
    - `brokerUrl(path: string): string` — trims the trailing slash of `REACT_APP_TOKEN_BROKER_URL`. Throws `"Token broker is not configured"` when it's empty.
    - `fetchBrokerKey(path: "/deepgram/token" | "/soniox/token"): Promise<string>` — today's `fetchDeepgramToken` body, generalized. Same 503 → `"Speech recognition is not available right now"` message, reads `access_token`.
  - `deepgram.adapter.ts`: `openDeepgramStream: OpenStream`, `parseStreamMessage(raw: string): SttStreamEvent | null`.
  - `stt-engine.config.ts`:
    - `ReciteEngineChoice = "deepgram" | "soniox" | "cloudflare-whisper"`
    - `readReciteEngine(): ReciteEngineChoice`
    - The options array keeps only the Deepgram entry for now. Tasks 3 and 6 add theirs.
  - `speech-to-text-stream.service.ts`:
    - `openSttStream: OpenStream` — a plain `switch` over `readReciteEngine()`, with no registry;
    - re-exports the types and `parseStreamMessage`.
    - Until Tasks 3/6 land, `"soniox"` / `"cloudflare-whisper"` reject with `"Speech recognition is not available right now"`.

- [ ] **Step 1: Write the failing tests** in `stt-dispatch.test.ts`. Use `jest.mock("../stt/deepgram.adapter")` (and later the other adapters), with implementations set in `beforeEach`.

```ts
it("reads deepgram when nothing is saved", () => { localStorage.clear(); expect(readReciteEngine()).toBe("deepgram"); });
it("reads the saved engine", () => { localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "soniox" })); expect(readReciteEngine()).toBe("soniox"); });
it("falls back on an unknown engine or bad JSON", () => {
  localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "groq" })); expect(readReciteEngine()).toBe("deepgram");
  localStorage.setItem("rafiq_settings_v1", "{oops"); expect(readReciteEngine()).toBe("deepgram");
});
it("routes deepgram to the deepgram adapter, reading the setting per call", async () => {
  localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciteEngine: "deepgram" }));
  await openSttStream(jest.fn(), jest.fn());
  expect(openDeepgramStream).toHaveBeenCalledTimes(1);
});
```

`readReciteEngine` validates against the full `ReciteEngineChoice` union, not against `RECITE_ENGINE_OPTIONS`, so `"soniox"` reads back even before its option exists.

- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false --testPathPattern stt-dispatch`. Expected: FAIL (module / export not found).

- [ ] **Step 3: Move the code.**
  - Move the types, `pickMimeType`, `RECORDER_TIMESLICE_MS`, `parseStreamMessage` and the `openSttStream` body into `stt/deepgram.adapter.ts` as `openDeepgramStream`. The only change is the token fetch, which becomes `fetchBrokerKey("/deepgram/token")`, and the log line becomes `[recite-stream] deepgram final: "…"`.
  - Write `broker.ts`, the dispatcher and `readReciteEngine` (`try { JSON.parse(localStorage.getItem("rafiq_settings_v1")) } catch → default`).
  - Update the header comment of `stt-engine.config.ts`: Deepgram is no longer the only engine, and the dropdown is read through `readReciteEngine` by the stream dispatcher.

- [ ] **Step 4: Run** the dispatch test and `--testPathPattern speech-to-text-stream`, then `npx tsc --noEmit`. Expected: all PASS, no type errors. `deepgramDriver.ts` and `useQuizRecite.ts` compile unchanged.

- [ ] **Step 5: Commit** `refactor(recite): route speech engines through a dispatcher that reads the Settings choice`

---

### Task 2: PCM capture and WAV encoding

**Files:**
- Create: `src/app/core/services/audio/stt/pcm-capture.ts`, `stt/wav.ts`
- Test: `src/app/core/services/audio/__tests__/stt-wav.test.ts`

**Interfaces:**
- Produces:
  - `PCM_SAMPLE_RATE = 16000`, `PCM_FRAME_SAMPLES = 1024`.
  - `startPcmCapture(onFrame: (frame: Float32Array) => void): Promise<{ stop(): void }>`:
    - opens `getUserMedia({ audio: true })`;
    - `new AudioContext({ sampleRate: 16000 })`;
    - a `ScriptProcessorNode` of 1024 samples, mono;
    - copies each input buffer before calling `onFrame`;
    - `stop()` disconnects, closes the context and stops the tracks, and is idempotent;
    - rejects with the browser's error when there's no mic.
  - `floatToPcm16(frame: Float32Array): Int16Array` — clamp to [-1, 1], scale to ±32767.
  - `encodeWav(samples: Float32Array, sampleRate: number): Blob` — 44-byte RIFF/WAVE header, PCM format 1, mono, 16-bit, `type: "audio/wav"`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("encodes a 16-bit mono WAV header", async () => {
  const blob = encodeWav(new Float32Array([0, 0.5, -1, 1]), 16000);
  const v = new DataView(await blob.arrayBuffer());
  expect(blob.type).toBe("audio/wav");
  expect(blob.size).toBe(44 + 4 * 2);
  expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
  expect(v.getUint16(22, true)).toBe(1);        // channels
  expect(v.getUint32(24, true)).toBe(16000);    // sample rate
  expect(v.getUint16(34, true)).toBe(16);       // bits
  expect(v.getUint32(40, true)).toBe(8);        // data bytes
  expect(v.getInt16(44 + 2 * 2, true)).toBe(-32767);
});
it("clamps out-of-range samples", () => { expect(Array.from(floatToPcm16(new Float32Array([2, -2])))).toEqual([32767, -32767]); });
```

If jsdom's `Blob` lacks `arrayBuffer`, read it with `FileReader` in a small test helper.

- [ ] **Step 2: Run** `--testPathPattern stt-wav`. Expected: FAIL.
- [ ] **Step 3: Implement** `wav.ts` and `pcm-capture.ts`. `startPcmCapture` isn't unit-tested (Web Audio isn't in jsdom). Keep it thin.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(recite): 16 kHz PCM mic capture and WAV encoder for new speech engines`

---

### Task 3: Soniox engine (broker route, assembler, adapter, dropdown entry)

**Files:**
- Create: `src/app/core/services/audio/stt/soniox.assembler.ts`, `stt/soniox.adapter.ts`
- Modify: `token-broker/src/index.ts` (route + `SONIOX_API_KEY?: string` in `Env` + header comment deploy list)
- Modify: `stt-engine.config.ts` (option entry), `speech-to-text-stream.service.ts` (case)
- Test: `src/app/core/services/audio/__tests__/soniox.assembler.test.ts`, `__tests__/soniox.adapter.test.ts`

**Interfaces:**
- Consumes:
  - `fetchBrokerKey("/soniox/token")`, `startPcmCapture`, `floatToPcm16` (Tasks 1–2);
  - `OpenStream`, `SttStreamEvent`, `SttWord`.
- Produces:
  - `SonioxToken { text: string; is_final?: boolean; confidence?: number }`.
  - `createSonioxAssembler(): { push(tokens: SonioxToken[]): SttStreamEvent[] }`:
    - It keeps a buffer of final tokens for the current utterance.
    - For a message without a marker, it returns one interim: buffered finals plus this message's non-final tokens.
    - At a `<end>` or `<fin>` token, it emits a final for the buffered tokens (only if the buffer has non-space text, or an interim was shown since the last final), then clears the buffer.
    - Final tokens after the marker in the same message start the next utterance, and that message's non-final tokens are reported as an interim after the final.
    - Marker tokens never appear in text.
  - `tokensToWords(tokens: SonioxToken[]): SttWord[]`:
    - Concatenates token text and splits on whitespace.
    - Each word's confidence is the minimum confidence of the tokens that contributed characters to it. A missing confidence counts as 1.
  - `openSonioxStream: OpenStream`.
  - Broker: `POST /soniox/token` returns `{ access_token: <api_key>, expires_in: 60 }` with `cache-control: no-store`.
  - Broker errors:
    - 503 `{error:"STT not configured"}` when the secret is missing;
    - 502 `{error:"token grant failed", code:"upstream_<status>"}` without the upstream body;
    - 502 `code:"grant_threw"` when the call throws.

    These mirror `handleDeepgramToken`.

- [ ] **Step 1: Write the failing assembler tests.**

```ts
const t = (text: string, is_final = false, confidence = 0.9) => ({ text, is_final, confidence });
it("emits a cumulative interim of finals plus non-finals", () => {
  const a = createSonioxAssembler();
  a.push([t("بسم", true), t(" ", true)]);
  expect(a.push([t("الل"), t("ه")])).toEqual([{ text: "بسم الله", isFinal: false, words: [{ word: "بسم", confidence: 0.9 }, { word: "الله", confidence: 0.9 }] }]);
});
it("emits a final at <end> and starts a fresh window", () => {
  const a = createSonioxAssembler();
  a.push([t("الحمد", true), t(" ", true), t("لله", true)]);
  const out = a.push([t("<end>", true), t("رب", false)]);
  expect(out.map((e) => [e.text, e.isFinal])).toEqual([["الحمد لله", true], ["رب", false]]);
});
it("treats <fin> like <end> and never shows markers", () => {
  const a = createSonioxAssembler();
  expect(a.push([t("مالك", true), t("<fin>", true)])).toEqual([{ text: "مالك", isFinal: true, words: [{ word: "مالك", confidence: 0.9 }] }]);
});
it("uses the lowest piece confidence for a word", () => {
  expect(tokensToWords([t("الر", true, 0.95), t("حمن", true, 0.4)])).toEqual([{ word: "الرحمن", confidence: 0.4 }]);
});
it("emits no final for an empty utterance", () => { expect(createSonioxAssembler().push([t("<end>", true)])).toEqual([]); });
```

- [ ] **Step 2: Write the failing adapter tests.**
  - Mock `../stt/broker`, `../stt/pcm-capture`, and a fake global `WebSocket` class that records `protocols`, `sent` and `close`, exposing `open()` and `message(data)` helpers.
  - Assertions:
    - the socket URL is `wss://stt-rt.soniox.com/transcribe-websocket` and the protocols are `["soniox-api-key", "snx_temp_x"]`;
    - the first frame, sent on open, is the JSON config from Global Constraints, exactly;
    - PCM frames are sent as `ArrayBuffer`s of `Int16Array`, and frames captured before open are flushed in order on open;
    - an `{ error_code, error_type, error_message }` message calls `onError` once with `error_message`;
    - `stop()` sends `'{"type":"finalize"}'` then `""`, and any message or close after `stop()` produces neither `onEvent` nor `onError` (Review Focus 2);
    - an unexpected close before `stop()` calls `onError("Transcription stream closed")`.

- [ ] **Step 3: Run** `--testPathPattern soniox`. Expected: FAIL.

- [ ] **Step 4: Implement** the assembler, then the adapter.
  - Adapter order:
    1. Fetch the key.
    2. Start PCM capture.
    3. Open the socket.
    4. Send the config on open.
    5. Forward frames.
    6. Parse each message: an error message goes to `onError`, `tokens` go to the assembler, and the resulting events go to `onEvent`.
  - Log finals as `[recite-stream] soniox final: "…"`.
  - On `stop()`:
    - set `stopped` first;
    - stop the capture;
    - send finalize and `""` if the socket is open;
    - close the socket after a 2 s timer, or when the server closes it.
  - Add the `"soniox"` dispatcher case and the dropdown option (labels from Global Constraints).

- [ ] **Step 5: Implement the broker route** `handleSonioxToken(env, corsHeaders)` in `token-broker/src/index.ts`. Route it before the unknown-path 404. Body: `{ usage_type: "transcribe_websocket", expires_in_seconds: 60, single_use: true }`. Map `api_key` → `access_token`. Add `wrangler secret put SONIOX_API_KEY` to the header's deploy list.

- [ ] **Step 6: Run** the soniox tests, the dispatch tests and `npx tsc --noEmit`, then `cd token-broker && npx wrangler deploy --dry-run --outdir "$TEMP/broker-dry"`. Expected: tests PASS, and wrangler prints the bundle size without errors.

- [ ] **Step 7: Commit** `feat(recite): Soniox live-streaming engine with broker-minted temporary keys`

---

### Task 4: Pause segmenter

**Files:**
- Create: `src/app/core/services/audio/stt/whisper/pause-segmenter.ts`
- Test: `src/app/core/services/audio/__tests__/pause-segmenter.test.ts`

**Interfaces:**
- Produces:
  - `SpeechSpan { startMs: number; endMs: number }`
  - `AudioSegment { samples: Float32Array; speechSpans: SpeechSpan[]; forced: boolean; startsWithOverlap: boolean }` — spans are relative to the segment's first sample.
  - `SegmenterOptions` with the defaults from Global Constraints: `sampleRate 16000, rmsThreshold 0.02, openFrames 2, preRollMs 400, pauseMs 350, keepTailMs 150, maxChunkMs 5000, forcedOverlapMs 1000, minSpeechMs 250`.
  - `createPauseSegmenter(opts?: Partial<SegmenterOptions>): { push(frame: Float32Array): AudioSegment[] }`

How it works:
- Each pushed frame is one analysis frame. Its loudness is the RMS of its samples.
- **Idle state:** keep a pre-roll ring buffer of the last 400 ms. After `openFrames` consecutive loud frames, open a segment that starts with the pre-roll.
- **Open state:** append frames and track speech spans (runs of loud frames).
- **Pause cut:** once silence has lasted ≥ `pauseMs`, close the segment. Its audio ends `keepTailMs` after the last loud frame; the rest of the silence is dropped. Set `forced=false` and `startsWithOverlap=false`.
- **Forced cut:** when the segment reaches `maxChunkMs`, close it with `forced=true`. The next segment opens immediately, seeded with the last `forcedOverlapMs` of audio and `startsWithOverlap=true`.
- **Short noise:** if a closed segment's total speech-span time is < `minSpeechMs`, return nothing for it.

Test helpers: `loud(ms)` / `quiet(ms)` build Float32 frames of 1024 samples (a 0.1-amplitude sine, or zeros), and a `feed(seg, frames)` helper collects all returned segments.

- [ ] **Step 1: Write the failing tests.**

```ts
it("returns nothing for pure silence", () => { expect(feed(quiet(3000))).toEqual([]); });
it("cuts at a pause and trims the trailing silence to ~150 ms", () => {
  const [s] = feed([...quiet(1000), ...loud(2000), ...quiet(600)]);
  expect(s.forced).toBe(false);
  const ms = (s.samples.length / 16000) * 1000;
  expect(ms).toBeGreaterThanOrEqual(2000 + 150);       // speech + tail (+ pre-roll)
  expect(ms).toBeLessThanOrEqual(400 + 2000 + 150 + 64); // never the whole pause
});
it("keeps the pre-roll so the first sound isn't clipped", () => {
  const [s] = feed([...quiet(1000), ...loud(1000), ...quiet(600)]);
  expect(s.speechSpans[0].startMs).toBeGreaterThanOrEqual(300);
});
it("does not cut on a pause shorter than 350 ms", () => {
  expect(feed([...loud(1000), ...quiet(200), ...loud(1000), ...quiet(600)])).toHaveLength(1);
});
it("drops a cough-length burst", () => { expect(feed([...quiet(500), ...loud(128), ...quiet(600)])).toEqual([]); }); // Review Focus 3
it("force-cuts continuous speech by 5 s and overlaps the next segment by 1 s", () => { // Review Focus 5
  const segs = feed([...loud(9000), ...quiet(600)]);
  expect(segs[0].forced).toBe(true);
  expect(segs[0].samples.length / 16).toBeLessThanOrEqual(5000);
  expect(segs[1].startsWithOverlap).toBe(true);
});
```

- [ ] **Step 2: Run** `--testPathPattern pause-segmenter`. Expected: FAIL.
- [ ] **Step 3: Implement** `createPauseSegmenter`. It's pure (no Web Audio, no timers); time is derived from sample counts.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(recite): pause-based speech segmenter that trims silence before Whisper`

---

### Task 5: Whisper post-processing

**Files:**
- Create: `src/app/core/services/audio/stt/whisper/whisper-postprocess.ts`
- Test: `src/app/core/services/audio/__tests__/whisper-postprocess.test.ts`

**Interfaces:**
- Consumes: `SpeechSpan` (Task 4), `normalizeArabic` from `services/quran/recite-matcher.service`.
- Produces:
  - `WhisperWord { word: string; start: number; end: number }` — seconds.
  - `WhisperSegment { text?: string; start?: number; end?: number; avg_logprob?: number; no_speech_prob?: number; compression_ratio?: number; words?: WhisperWord[] }`.
  - `isLikelyHallucination(seg: WhisperSegment): boolean` — restored verbatim from `git show e265838^:src/app/core/services/audio/speech-to-text.service.ts`:
    - thresholds 0.6 / 0.85 / -0.5 / -1.0 / 2.4;
    - the trigger-word list;
    - `stripProclitics`, whole-word match;
    - the `(\S)\1{3,}` run.

    A missing numeric field skips that check: use `undefined` checks, not `?? 0`, so a missing `avg_logprob` is never read as confident.
  - `wordsFromSegments(segments: WhisperSegment[], speechSpans: SpeechSpan[]): string[]`:
    - drops hallucinated segments;
    - for segments with `words`, drops each word whose `[start, end]` (converted to ms) doesn't overlap any speech span widened by 100 ms on each side;
    - for segments without `words`, splits `text` on whitespace;
    - trims each word.
  - `stitchSeam(prevTail: string[], next: string[]): string[]` — drops the longest k (1 ≤ k ≤ min(prevTail.length, next.length, 8)) such that `normalizeArabic` of the last k of `prevTail` equals the first k of `next`. Returns `next` unchanged when there's no match.

- [ ] **Step 1: Write the failing tests.**

```ts
it("keeps real recitation that scores just over 0.6 no_speech but is confident", () => {
  expect(isLikelyHallucination({ text: "الحمد لله", no_speech_prob: 0.61, avg_logprob: -0.2 })).toBe(false);
});
it("drops subtitle-credit hallucinations but not words that merely contain a trigger", () => {
  expect(isLikelyHallucination({ text: "ترجمة نانسي قنقر" })).toBe(true);
  expect(isLikelyHallucination({ text: "والملائكة" })).toBe(false);
});
it("does not treat a missing avg_logprob as a pass or a fail", () => {
  expect(isLikelyHallucination({ text: "قل هو الله أحد", no_speech_prob: 0.7 })).toBe(false);
});
it("drops words timed inside silence", () => {
  const seg = { text: "", words: [{ word: "قل", start: 0.1, end: 0.4 }, { word: "أعوذ", start: 2.0, end: 2.4 }] };
  expect(wordsFromSegments([seg], [{ startMs: 0, endMs: 600 }])).toEqual(["قل"]);
});
it("falls back to segment text when Whisper gives no word timings", () => {
  expect(wordsFromSegments([{ text: " بسم الله " }], [])).toEqual(["بسم", "الله"]);
});
it("removes the overlap at a forced-cut seam", () => {
  expect(stitchSeam(["الرحمن", "الرحيم"], ["الرحيم", "مالك", "يوم"])).toEqual(["مالك", "يوم"]);
});
it("keeps everything when the head does not match the tail", () => { // Review Focus 4
  expect(stitchSeam(["تكذبان"], ["فبأي", "آلاء", "ربكما", "تكذبان"])).toEqual(["فبأي", "آلاء", "ربكما", "تكذبان"]);
});
```

- [ ] **Step 2: Run** `--testPathPattern whisper-postprocess`. Expected: FAIL.
- [ ] **Step 3: Implement**, keeping the restored comments that explain each threshold.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(recite): Whisper hallucination filters, silence-word drop and seam stitching`

---

### Task 6: Cloudflare Whisper engine (Worker route, pipeline, adapter, dropdown entry)

**Files:**
- Create: `src/app/core/services/audio/stt/whisper/whisper.adapter.ts`
- Modify: `token-broker/src/index.ts`, `token-broker/wrangler.toml`
- Modify: `stt-engine.config.ts` (option entry), `speech-to-text-stream.service.ts` (case)
- Test: `src/app/core/services/audio/__tests__/whisper.adapter.test.ts`

**Interfaces:**
- Consumes:
  - `startPcmCapture`, `encodeWav`, `PCM_SAMPLE_RATE` (Task 2);
  - `createPauseSegmenter`, `AudioSegment` (Task 4);
  - `wordsFromSegments`, `stitchSeam`, `WhisperSegment` (Task 5);
  - `brokerUrl` (Task 1).
- Produces:
  - `WhisperResult { text: string; segments?: WhisperSegment[] }`.
  - `transcribeSegment(wav: Blob): Promise<WhisperResult>`:
    - `POST brokerUrl("/whisper/transcribe")` with `content-type: audio/wav`;
    - a non-OK response throws `Error`, with the 503 message from Task 1 and `"Speech recognition limit reached for today"` on 429.
  - `createWhisperPipeline(transcribe: (wav: Blob) => Promise<WhisperResult>, onEvent, onError): { submit(seg: AudioSegment): void; stop(): void }`:
    - starts each upload immediately (in parallel) but emits in submit order (Review Focus 1);
    - each result becomes one `{ text, isFinal: true, words }` event:
      - `words` comes from `wordsFromSegments` (or `text` split when there are no segments);
      - if `seg.startsWithOverlap`, run `stitchSeam(lastEmittedWords.slice(-8), words)`;
      - every word gets `confidence: 1`;
    - when the cleaned words are empty, nothing is emitted;
    - the first rejection calls `onError(message)` once, and later results are ignored;
    - after `stop()`, pending results are ignored, with no `onEvent` and no `onError` (Review Focus 2).
  - `openWhisperStream: OpenStream`:
    - `startPcmCapture` → segmenter `push` → `pipeline.submit(encodeWav(seg.samples, 16000), …)`;
    - log finals as `[recite-stream] cloudflare-whisper final: "…"`;
    - `stop()` stops the capture and the pipeline.
  - Worker `POST /whisper/transcribe`:
    - Rejects bodies over 1,000,000 bytes (check `content-length` and the actual length) with 413.
    - Base64-encodes the bytes, chunked through `String.fromCharCode` in 32 KB slices before `btoa`.
    - Calls `env.AI.run("@cf/openai/whisper-large-v3-turbo", {...})` with the Global Constraints input.
    - Returns `{ text, segments }`, where segments carry only `start, end, text, avg_logprob, no_speech_prob, compression_ratio, words`, with `cache-control: no-store`.
    - When `AI.run` throws: 429 `{code:"ai_quota"}` if the message mentions a neuron/quota/limit, else 502 `{code:"ai_failed"}`.
    - `Env` gains `AI: Ai`, and `wrangler.toml` gains `[ai]` / `binding = "AI"`.

- [ ] **Step 1: Write the failing pipeline tests.** Use an injected `transcribe` whose promises the test resolves by hand.

```ts
it("emits phrases in recording order even when the second returns first", async () => {
  const d = [deferred<WhisperResult>(), deferred<WhisperResult>()]; let i = 0;
  const onEvent = jest.fn();
  const p = createWhisperPipeline(() => d[i++].promise, onEvent, jest.fn());
  p.submit(seg()); p.submit(seg());
  d[1].resolve({ text: "الرحيم" }); await flush(); expect(onEvent).not.toHaveBeenCalled();
  d[0].resolve({ text: "الرحمن" }); await flush();
  expect(onEvent.mock.calls.map((c) => c[0].text)).toEqual(["الرحمن", "الرحيم"]);
});
it("stitches only overlapped segments", async () => {
  // first: "الرحمن الرحيم"; second (startsWithOverlap) returns "الرحيم مالك" → emits "مالك"
});
it("reports the first failure once and stops emitting", async () => { /* two rejections → onError called once */ });
it("ignores results that land after stop", async () => { /* resolve after p.stop() → no onEvent, no onError */ });
it("emits nothing for a phrase whose words were all filtered", async () => { /* segments with no_speech_prob 0.9 → no event */ });
```

`seg(overrides)` builds an `AudioSegment` with 0.5 s of zeros, `speechSpans: [{startMs:0,endMs:500}]` and `forced: false`. `flush = () => new Promise((r) => setTimeout(r, 0))`.

- [ ] **Step 2: Run** `--testPathPattern whisper.adapter`. Expected: FAIL.
- [ ] **Step 3: Implement** `transcribeSegment`, `createWhisperPipeline`, `openWhisperStream`, the dispatcher case and the dropdown option.
- [ ] **Step 4: Implement the Worker route and binding.** Route it before the unknown-path 404. The CORS allowed headers already include `content-type`.
- [ ] **Step 5: Run** all `stt|soniox|whisper|pause-segmenter|speech-to-text` tests, `npx tsc --noEmit`, and the wrangler `--dry-run` from Task 3. Expected: PASS, and the bundle builds with the `AI` binding listed.
- [ ] **Step 6: Commit** `feat(recite): Cloudflare Whisper engine — pause-cut phrases transcribed via Workers AI`

---

### Task 7: Deploy check, disclosures, and the live-testing checkpoint

**Files:**
- Modify: `token-broker/verify-deploy.sh`, `PLAY-CONSOLE-PREP.md`, `PLAY-LISTING-COPY.md`

- [ ] **Step 1: Extend `verify-deploy.sh`.** After the existing Deepgram check:
  - **`/soniox/token`:**
    - PASS when the body has an `access_token` starting `snx_temp_`;
    - FAIL with "SONIOX_API_KEY secret missing" on 503;
    - FAIL with "route not deployed" on a 404 or a Quran Foundation token.
  - **`/whisper/transcribe`:**
    - POST a 1-second silent 16 kHz WAV (generate the 32,044 bytes with `printf`/`head -c` from `/dev/zero` plus a header written with `printf`);
    - PASS on HTTP 200 with JSON containing `"text"`;
    - FAIL on 404 ("route not deployed") or 5xx (print the `code`).

  Keep the script's existing style: one PASS/FAIL line per route, non-zero exit on any FAIL.
- [ ] **Step 2: Run** `bash -n token-broker/verify-deploy.sh`. Expected: no syntax errors. Don't run it against the live broker; the new routes aren't deployed yet.
- [ ] **Step 3: Update the disclosures.** `PLAY-CONSOLE-PREP.md` lists `api.deepgram.com (wss)` as the only microphone-audio recipient: add `stt-rt.soniox.com` (wss) and Cloudflare Workers AI (via the broker) with the same purpose and wording. In `PLAY-LISTING-COPY.md`, change "a speech-recognition provider" to "the speech-recognition provider you choose in Settings", if the surrounding copy still reads naturally. Don't claim anything about retention that the providers' terms don't state.
- [ ] **Step 4: Full verification.** Run `CI=true npx react-scripts test --watchAll=false` and `npx tsc --noEmit`. Expected: the whole suite green (it was all green as of 2026-10-02), no type errors.
- [ ] **Step 5: Commit** `chore(recite): deploy checks and store disclosures for Soniox and Cloudflare Whisper`
- [ ] **Step 6: Live checkpoint (the user does this; the builder waits).** Hand the user the "Live testing checkpoint" list from the spec: deploy, `verify-deploy.sh`, build, `chrome://inspect`, then each engine on a page plus one Akmel al-Ayah question with a deliberate skip and a wrong word. When the logs come back, fix only what the live services contradicted:
  - the Soniox model name, or the shape of its error and marker tokens;
  - the Workers AI input encoding, or whether its word timestamps line up after `vad_filter`;
  - a segmenter threshold that's too sensitive or too deaf in the user's room.

  Soniox and Whisper aren't done until this checkpoint passes.
