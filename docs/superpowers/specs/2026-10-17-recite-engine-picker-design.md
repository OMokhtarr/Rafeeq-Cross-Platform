# Recite Engine Picker — Design

Date: 2026-10-17
Branch: `stt-engine-picker`
Status: design — awaiting approval

## Why

Recite mode runs on Deepgram nova-3 streaming at about $0.0077 per minute
($0.46 an hour). The user can't sustain that once the app has real users. Two
cheaper cloud engines looked promising in research (October 2026 list prices):

| Engine | Free | After that | Live streaming? |
|---|---|---|---|
| Deepgram nova-3 (current) | $200 one-time credit | $0.0077/min | yes |
| Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` | 10,000 neurons/day per account ≈ 214 audio min/day | $0.0005/min (Workers Paid plan) | no — per-request audio |
| Soniox real-time (`stt-rt-v5`) | trial credits only | ≈ $0.002/min ($0.12/hr) | yes |

The user wants to **try all three on real recitation and pick by experience**.
Recite mode will eventually become a paid feature (a separate project: see
"Follow-up project" below), so cost per minute affects what the subscription
has to charge.

On-device/offline engines are explicitly the user's last resort and are out of
scope.

## Goal

The **existing** Settings dropdown "Recitation recognition engine"
([Settings.tsx](../../../src/app/features/settings/Settings.tsx), persisted as
`reciteEngine` in `rafiq_settings_v1`) offers three engines — Deepgram,
Cloudflare Whisper, Soniox. Every recite surface uses whichever is selected:

- Quran viewer recite mode (`useReciteMode` → `deepgramDriver`)
- Akmel al-Ayah quiz and Mutashabihat quiz (`useQuizRecite`)

Today the dropdown saves a value but **nothing reads it**: both recite paths
call `openSttStream()` in
[speech-to-text-stream.service.ts](../../../src/app/core/services/audio/speech-to-text-stream.service.ts),
which is hard-wired to Deepgram. This project wires the dropdown up and adds
the two engines.

## How the user will judge the engines (success criteria)

The user will test by hand, on device, against these four questions, in this
order of importance:

1. **Hears correctly** — does it pick up what was actually recited, in the
   user's own voice and recitation style?
2. **Matches words** — do the right words reveal in the right place, following
   along?
3. **Shows mistakes** — do skipped or wrong words show red, and correct words
   *not* red?
4. **Fast and reliable** — how quickly words appear; does the session ever
   stall, drop, or lose its place?

The build is done when all three engines can be selected and each one drives
all three recite surfaces well enough for the user to answer those questions.
Tuning an engine to win is not part of this project. The work is a fair,
working integration of each one.

## Non-goals

- Gating any engine (or recite mode) behind a subscription. That's the
  follow-up project.
- Offline / on-device recognition.
- Any change to mistake judgement. The aligner
  (`recite-aligner.service.ts`), spelling rules, identify search and reveal
  logic stay exactly as they are, so the comparison is between engines only.
- A cost/usage display in the app.
- Removing Deepgram. It stays as an option while the $200 credit lasts.

## Anti-goals

- A secret API key in the app bundle. CRA inlines `REACT_APP_*` into the APK,
  so all three engines must authenticate through the token broker, the same
  way Deepgram does today.
- An engine that "works" by quietly falling back to another engine. If the
  selected engine fails, the session shows the error. A silent fallback would
  make the comparison meaningless.
- Regressing Deepgram. Deepgram behaviour must be byte-for-byte the same
  as today.

## The design

### 1. One seam: the stream service picks the engine

Both recite paths already consume one contract:

```ts
openSttStream(onEvent: (e: SttStreamEvent) => void, onError: (msg: string) => void)
  : Promise<SttStreamHandle>          // { stop() }

SttStreamEvent = { text: string; isFinal: boolean; words?: { word; confidence }[] }
```

Semantics the consumers depend on: interims are **cumulative revisions of the
current utterance window** (each replaces the last); a final **settles** the
window and the next event starts a fresh one. `words[].confidence` feeds the
aligner's forgiveness of unsure words.

Keep that contract and turn `openSttStream` into a dispatcher. It reads the
`reciteEngine` setting and delegates to one adapter per engine. Each adapter
owns its own transport and translates its engine's output into
`SttStreamEvent`s with the semantics above. Consequences:

- `deepgramDriver.ts`, `useIdentifySession.ts` and `useQuizRecite.ts` need no
  logic changes. The `deepgram/` folder and `useDeepgramDriver` name now carry
  every engine, so renaming them is the builder's call. If they are renamed,
  update the comments that say "Deepgram" where they mean "the stream".
- Reading the setting: the stream service can read `rafiq_settings_v1` from
  localStorage directly (several modules already do, e.g. `PageViewer.tsx`,
  `quran.service.ts`), or take the engine as a parameter from the callers.
  Builder's call. Either way it reads the setting **per session start**, so a
  change in Settings takes effect on the next recitation with no reload.
- Unknown/missing value → `DEFAULT_RECITE_ENGINE` (already the Settings
  migration behaviour).
- `stt-engine.config.ts`: `ReciteEngineChoice` becomes
  `"deepgram" | "cloudflare-whisper" | "soniox"`, with three
  `RECITE_ENGINE_OPTIONS` entries (Arabic + English labels; suggested: "Soniox —
  بث فوري / live streaming", "Cloudflare Whisper — مقاطع قصيرة / short
  chunks"). The default stays `"deepgram"`. Update the file's header comment,
  which still says Deepgram is the only engine.

### 2. Deepgram adapter

Today's code, moved behind the dispatcher unchanged: broker `/deepgram/token`,
nova-3 `language=ar`, 250 ms webm/opus timeslices, interim results, endpointing
300.

### 3. Soniox adapter (live streaming)

- **Auth:** new broker route `POST /soniox/token`. The Worker holds
  `SONIOX_API_KEY` as a secret and mints a **temporary API key**
  (usage type `transcribe_websocket`, ~60 s expiry, single use) via Soniox's
  temporary-key endpoint, returning `{ access_token, expires_in }` with
  `cache-control: no-store`. Same response shape and error discipline as
  `handleDeepgramToken` (503 when the secret is missing, `upstream_<status>`
  codes, never echo the upstream body).
- **Socket:** `wss://stt-rt.soniox.com/transcribe-websocket`, key passed as
  the WebSocket subprotocol pair `["soniox-api-key", key]` (Soniox is
  deprecating the key-in-config-body method on 2027-01-15, so don't use it).
  First frame is the JSON config: model `stt-rt-v5` (check the models page and
  use the current real-time model), `audio_format: "auto"`, `language_hints:
  ["ar"]`, `language_hints_strict: true` if available,
  `enable_endpoint_detection: true`. Audio: the same 250 ms webm/opus
  MediaRecorder timeslices as Deepgram, if Soniox's auto-detect accepts
  webm/opus fragments (verify against the live API). If it doesn't, the
  builder picks a supported encoding.
- **Translating tokens to events.** Soniox sends `tokens[]`, each with
  `text`, `is_final` and `confidence`. Final tokens arrive once and never
  change. Non-final tokens are revised in later messages. With endpoint
  detection on, an `<end>` token marks the end of an utterance. Mapping:
  - Keep the final tokens of the current utterance in a buffer.
  - On each message, emit an **interim** whose text is the buffered finals
    plus that message's non-final tokens.
  - On `<end>`, emit a **final** with the buffered text, then clear the
    buffer.
  - Soniox tokens are sub-word pieces, not words. Join them into words before
    building `words[]`, and give each word the **minimum** confidence of its
    pieces.
  - Strip `<end>` and any other control tokens from the text.
- **Stop:** send an empty text frame (Soniox's end-of-audio signal), then close (see 4a for `finalize` first).
  Handle `error_code` / `error_type` messages and unexpected closes through
  `onError`, the same as the Deepgram adapter.
- **Keepalive:** Soniox closes idle connections. Recite sessions stream
  continuously while recording and end after 10 s of silence, so audio flow
  should be enough. The builder confirms this against the keepalive docs.

### 4. Cloudflare Whisper adapter (short chunks)

Whisper isn't a streaming engine. It transcribes one complete audio file per
request.

- **Worker route:** `POST /whisper/transcribe`. The body is one audio chunk
  (webm/opus or mp4, a complete self-contained file). The Worker calls
  `env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio, language: "ar",
  vad_filter: true, ... })` and returns `{ text, words? }`. There's no key
  minting: the audio passes through the Worker, so no credential ever reaches
  the client.
  - Add the AI binding to `token-broker/wrangler.toml` (`[ai] binding = "AI"`)
    and `AI: Ai` to `Env`.
  - Cap the request body (e.g. reject > 1 MB) so a stray client can't send
    huge uploads.
  - Check the model's input schema (`schema-input.json` on the model page) for
    the exact `audio` encoding (base64 string vs byte array) and whether the
    output includes word timings or per-segment `no_speech_prob` /
    `avg_logprob`.
- **Ghost words are fixed at the source, with no holdback.** Whisper
  invents words in one situation: it hears **silence** at the end of a clip
  and continues the verse from memory. The Groq version hid the last two words
  of every chunk until the next chunk confirmed them. That added a delay and
  needed overlap-stitching. The user asked for better. This design instead
  makes sure Whisper is **never sent silence**, and drops any word that still
  lands on silence. Four layers, cheapest first:
  1. **Cut chunks at the reciter's pauses, not on a timer.** The client
     watches the mic level (the old speech gate's RMS analyser, restored from
     `useMicChunks.ts` at `e265838^`). A chunk starts when voice begins, with
     the ~400 ms pre-roll so the first sound isn't clipped. It ends when the
     level stays below the threshold for a short pause (start at ~350 ms; the
     builder tunes this). Quran recitation pauses naturally at waqf points and
     between breaths, so chunks follow the phrases. A **hard cap** (start at
     ~8 s) stops a chunk if no pause comes. Only those forced cuts overlap the
     next chunk, by ~1 s, so a word split at the cut isn't lost.
  2. **Trim the silence before sending.** The trailing pause that ended the
     chunk is cut off the audio before upload, keeping ~150 ms of tail so the
     last letter isn't clipped. Whisper never gets the empty stretch it would
     fill with invented words.
  3. **Server-side silence guards.** The Worker calls Whisper with
     `vad_filter: true` (Cloudflare's voice-activity filter drops silent
     stretches), `condition_on_previous_text: false`,
     `hallucination_silence_threshold` (start at ~0.5 s; check the
     model's input schema for the unit), and no `initial_prompt` / `prefix`.
  4. **Timestamp check as a safety net.** If Workers AI returns word or segment
     timings, the adapter drops any word whose time span falls where the
     client's level meter recorded silence. If no timings come back, this layer
     is skipped and layers 1–3 still apply.

  The old Groq text filters also stay as a final net, adapted to whatever
  fields Workers AI returns: no-speech/logprob pairing, compression ratio, the
  whole-word blocklist with proclitic stripping, and repeated-character runs.
  Restore them from `speech-to-text.service.ts` at `e265838^` and skip any
  filter whose field is missing.
- **Turning chunks into events.** Each chunk's cleaned transcription becomes
  one **final**, with no interims and no holdback. Pause-cut chunks don't
  overlap, so there are no repeated words to remove. Only forced-cut chunks
  need a seam fix: drop the longest normalized-word overlap
  (`normalizeArabic`) between the previous transcript's tail and this one's
  head. A phrase that really is repeated, away from that seam, must not be
  swallowed (cover this in tests).
- **Restoring the recorder.** `useMicChunks.ts` used two staggered
  MediaRecorders so every chunk is a complete file with a container header.
  The adapter isn't a React hook, so that logic becomes plain functions or a
  class. Builder's call how. Every chunk must still be a complete,
  independently decodable file.
- **Expected speed:** a phrase's words appear about 1 s after the reciter
  pauses (pause detection plus one Workers AI request). They no longer appear
  3–5 s behind on a fixed timer. During a long unbroken phrase, the 8 s cap
  sets the delay.
- **Whisper prompt:** none. The Groq experience showed that a prompt makes
  Whisper echo words over silence.
- **Rate and cost:** one request per chunk (roughly one per phrase, ~8–15 a minute) per
  reciter. Workers AI has no per-minute request cap at that scale. The daily
  free allowance is ~214 audio minutes **across all users**. Once it runs out,
  either the account is on Workers Paid (billed per minute) or requests fail.
  Failures go through `onError` like any other engine error.
- **Known risk to watch (tell the user, don't engineer around it):** Whisper
  already knows the Quran, so it may transcribe the correct word even when the
  reciter said a wrong one. That would hide mistakes (criterion 3).

### 4a. Tapping stop — fix it in the engines, the app stays as it is

When the reciter taps stop, the quizzes judge the answer at once, and
`useQuizRecite` ignores any later event. The viewer behaves the same way. The
user decided: **don't change the app — make the engines deliver words fast
enough that they're already shown before stop is tapped.** No changes to
`useQuizRecite`, the quiz pages, `useReciteMode` or the stop contract.

- **Deepgram:** unchanged. Its interims already arrive a few hundred ms behind
  the voice.
- **Soniox:**
  - Set `max_endpoint_delay_ms` to its minimum (500) so utterance finals come
    quickly at each pause.
  - Interims (non-final tokens) drive the reveal live, the same way Deepgram's
    do.
  - On stop, send Soniox's `finalize` control message before the
    end-of-audio empty frame, so it doesn't sit on unsettled tokens. Whatever
    arrives after stop is ignored by the app, as today.
- **Cloudflare Whisper:**
  - The pause-cut chunks above send the last phrase as soon as the reciter
    pauses (≈1 s), which in practice is before they reach for the stop
    button.
  - A chunk still recording or uploading when stop is tapped is dropped.
    That's accepted.
- Tell the user, as part of the comparison: if a verse's last words haven't
  appeared yet when stop is tapped, that slowness counts against the engine
  under criterion 4.

### 5. What the user sees

- The same dropdown, now with three entries.
- Engine errors use the existing mic-error path and text. If an engine's
  broker route isn't deployed or configured, the existing 503 handling already
  produces "Speech recognition is not available right now". Make that message
  generic, not Deepgram-specific.
- Make the dev logging (`[recite-stream] final: …`) name the engine, so the
  user can tell engines apart in device logs while testing.

### 6. Store disclosures (flag, don't block)

`PLAY-CONSOLE-PREP.md` and `PLAY-LISTING-COPY.md` name Deepgram as the only
recipient of microphone audio (`api.deepgram.com`). If Soniox or Cloudflare
ship in a store build, the Data safety form and privacy wording must also list
them. Before release, update those two files to list the new processors. No
in-app change is needed.

## User's setup steps (the user does these — they build and deploy themselves)

**Soniox key** (can be done now; the Worker ignores the secret until the new
route is deployed):
1. Sign up at https://console.soniox.com and open **API keys**. Create a key
   and copy it (it's shown once).
2. In a terminal: `cd token-broker`, then `npx wrangler login` (once, if not
   already logged in).
3. `npx wrangler secret put SONIOX_API_KEY`, then paste the key when prompted.
   The secret is stored encrypted on Cloudflare. It never goes in the repo or
   the app.
4. Check: `npx wrangler secret list` shows `SONIOX_API_KEY` next to
   `DEEPGRAM_API_KEY`.

**Cloudflare Workers AI:** no key needed. The `[ai]` binding ships in
`wrangler.toml` with this change. In the Cloudflare dashboard, check that
**Workers AI** is available on the account. Beyond ~214 min/day across all
users, it needs **Workers Paid** ($5/month).

**Live testing checkpoint** (after the code is built):
1. `cd token-broker && npx wrangler deploy`.
2. `bash token-broker/verify-deploy.sh`. It gains checks for `/soniox/token`
   and `/whisper/transcribe` (a configured route must answer, not 404 or fall
   through to the Quran Foundation token).
3. Build and install the app on the phone.
4. Connect the phone by USB and open `chrome://inspect` in desktop Chrome.
   Click **inspect** on the Rafeeq WebView to see the console.
5. For each engine: choose it in Settings, recite about a page in the viewer,
   then one Akmel al-Ayah question. Include at least one deliberate skipped
   word and one wrong word.
6. Copy the `[recite-stream]` / `[recite-align]` console lines for each engine
   and send them back. The builder fixes anything the live services did
   differently from the docs.

## No live credentials during the build (my call)

The builder has no Soniox key or deployed broker. The user creates
accounts, sets secrets and deploys. So every point marked "verify against
the live API" gets a defensive implementation:
- **Soniox audio format:** try webm/opus fragments first, with a raw-PCM
  fallback path ready.
- **Workers AI input:** accept both audio encodings by checking the schema.
- **Whisper filters:** skip any filter whose field (`no_speech_prob`,
  `avg_logprob`) the response doesn't include.

The plan ends with a checkpoint:
1. the user deploys the broker and installs a build;
2. the user runs each engine once and sends back the `[recite-stream]` logs;
3. the builder fixes whatever the live services contradicted.

Soniox and Whisper count as done only after that checkpoint.

## Testing

- Unit tests (Vitest/Jest, as the suite runs today):
  - Soniox token → event mapping (finals buffering, `<end>` → final, sub-word
    pieces → words, min-confidence, control-token stripping).
  - The Whisper chunk stitcher (overlap removed; no overlap → full text; a
    phrase legitimately repeated by the reciter is not swallowed when it
    doesn't sit at the seam).
  - The dispatcher (each setting value → its adapter; unknown → default).
- Keep the existing `parseStreamMessage` (Deepgram) tests passing.
- Worker: the existing broker has no unit test harness. Verify the routes
  with `verify-deploy.sh`.
- The real test is the user's on-device comparison against the four criteria.

## Follow-up project (not this one)

**Subscription.** Recite mode becomes a paid feature. An approved spec exists
on branch `subscription-model` (`docs/subscription-model-spec.md`, RevenueCat
"pro" entitlement, `useEntitlements` + `<ProGate>`). It is out of date: it ties
the subscription to the Quran Foundation login (`sub` claim), which was
removed in August 2026. It needs:

- a new identity (store account + "Restore purchases");
- server-side enforcement — the broker checks the RevenueCat entitlement
  before minting Soniox/Deepgram keys or running Whisper. Today the broker's
  routes are open to anyone who finds the URL.

That gets its own design pass after the engine test picks a winner.
