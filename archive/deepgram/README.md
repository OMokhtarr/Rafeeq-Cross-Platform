# Archived: Deepgram speech engine

Archived 2026-11-15. Recite mode now uses Soniox only. Nothing in this folder
is compiled or tested: `tsconfig.json` and Jest only look inside `src/`.

Last commit with Deepgram live in the app: 43e65dd.

## What is here

| File | Original path |
| --- | --- |
| `deepgram.adapter.ts` | `src/app/core/services/audio/stt/deepgram.adapter.ts` |
| `deepgram.adapter.test.ts` | `src/app/core/services/audio/__tests__/speech-to-text-stream.service.test.ts` |
| `stt-engine.config.ts` | `src/app/core/services/audio/stt-engine.config.ts` (Settings engine picker) |
| `stt-dispatch.test.ts` | `src/app/core/services/audio/__tests__/stt-dispatch.test.ts` |

## What was not archived

- `src/app/core/hooks/recite/deepgram/` is the recite driver for every engine,
  Soniox included. Only its folder name is historical.
- The token broker still serves `/deepgram/token` (with `DEEPGRAM_API_KEY`),
  because builds already installed from the store use Deepgram by default.

## Bringing Deepgram back

1. Move each file back to its original path. The test imports
   `../stt/deepgram.adapter`, which resolves once it is back in `__tests__/`.
2. In `speech-to-text-stream.service.ts`, switch on `readReciteEngine()` again
   and call `openDeepgramStream` for `"deepgram"`.
3. In `stt/broker.ts`, widen `fetchBrokerKey`'s path back to
   `"/deepgram/token" | "/soniox/token"`.
4. In `Settings.tsx`, restore the `reciteEngine` setting, the Recitation
   section with its `SelectRow`, and the `mic` icon. In `strings.ts`, restore
   `sectionRecite`, `reciteEngine` and `reciteEngineDesc`. All of these are
   in commit 43e65dd.
