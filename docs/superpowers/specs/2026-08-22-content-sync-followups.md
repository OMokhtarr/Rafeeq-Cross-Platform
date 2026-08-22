# Content Sync — known follow-ups

Date: 2026-08-22
Status: Open. Recorded at the end of the `content-sync` implementation so these
survive the scratch workspace.

Everything here was found by review during implementation, judged non-blocking,
and deliberately deferred. None of it prevents the feature working; the first
two are the ones with real user impact.

## 1. Android filesystem eviction is a stub — highest priority

`evictRecitation` in `adapters/recitations.adapter.ts` clears the IndexedDB
`audio` store, which is the web/iOS backend. On Android the blobs live as files
under `quran-audio/`, and that branch is an empty documented stub.

Android is the primary release platform, so on the platform that matters most,
a `RESOURCE_INVALIDATE` for a recitation currently evicts nothing. Corrected
audio would not re-download until the file is otherwise replaced.

Needs the Capacitor Filesystem plugin and a device to verify — which is why it
was left out rather than written blind.

Related: the IDB deletion loop runs unconditionally before the `usesFileCache()`
check, so on Android it is dead work over an empty store. Harmless, but it means
the only eviction path there is the stub.

## 2. `readCachedTafsir` deserializes an entire resource per verse tap

`adapters/tafsirs.adapter.ts` reads **all** rows for a tafsir (up to 6,236, and
a full snapshot is ~12 MB of HTML) and then finds one by key. This runs on every
verse tap.

The fix is trivial and the data already supports it: row ids are the composite
`tafsirs:{resourceId}:tafsir:{verseKey}`, so a single `idb.get` is O(1). Same
applies to `hasCachedTafsir`, which loads every row only to check `length > 0`.

Deferred because it changes a read path that is currently correct and covered by
tests; worth landing on its own rather than inside a large branch. The final
reviewer rated this higher than "micro-optimisation" — on a low-end Android
WebView it is a visible freeze, not a benchmark artifact.

## 3. `replaceResourceRows` is not atomic

`sync-store.service.ts` purges a resource's rows and then inserts the new set as
separate operations. A crash in between leaves partial rows.

Deliberately accepted: the state self-heals, because the next
`RESOURCE_INVALIDATE` replaces the whole set again, and wrapping ~6,236 chunked
rows in one transaction would defeat `idb.bulkPut`'s 500-row chunking — which
exists because large transactions fail on the old WebViews this app supports
(see `docs/webview-compat-audit.md`). The `bootstrappedAt` recovery loop added
at the end of implementation also repairs this case on the next run.

## 4. Missing unmount guards in two components

`Settings.tsx` (`getSyncStatus` / `runSync`) and `TafsirSettings.tsx`
(`handleSave` / `handleRemove`) set state after awaits with no cancellation
guard. React 18 only warns in development rather than crashing.

Note `TafsirSettings` already has a proper `cancelled` guard on its
incomplete-check effect, so the file is internally inconsistent — that is the
argument for fixing it, rather than consistency with siblings.

## 5. Untested API paths

Neither of these has ever been observed against the live API, so both
implementations are defensive rather than verified:

- **Pagination.** Every real response returned `has_more: false`. The multi-page
  loop is implemented and now capped at `MAX_PAGES = 500`, but has never run for
  real.
- **`sync_token` expiry.** Undocumented. A 4xx on an incremental sync clears the
  token and lets recovery re-bootstrap, which is the safe assumption, not a
  confirmed behaviour.

## 6. UI behaviour has no automated coverage

`useContentSync`, `Settings.tsx`'s sync section, and `VerseActionSheet`'s
cache-first read have no tests — this repo has no React component-test
infrastructure (`@ionic/react`'s ESM build breaks Jest's default transform).
The `downloadTafsir` extraction in `tafsir-cache.service.ts` exists specifically
so FIX 3's ordering could be unit-tested without it.

Manual checks still outstanding:

- a real end-to-end sync against the live API;
- tafsir rendering with the network disabled after a download;
- Android blob eviction on hardware;
- RTL layout of the new Settings section and the tafsir incomplete/resume state.


---

# Verification status (2026-08-22)

## Done — live end-to-end against the real API

The real compiled engine and tafsir adapter were driven against the live QF API
through the token broker (only IndexedDB was substituted, via fake-indexeddb).
All checks pass:

- `bootstrapResource("tafsirs", 169)` completes in ~3.3 s and stores 6,236 rows
- the cross-surah range `104:1 → 105:5` resolves on every one of its 14 verses
- **all 6,236 verse keys resolve — zero missing**, verified against a per-surah
  ayah-count table
- `runSync({force:true})` returns `{ran:true, applied:1}` and persists a real
  `sync_token` with `lastError: null`

**This run found two Critical bugs the 162-test suite could not**, because the
suite mocks the API. Both are fixed (commit `680024a`):

1. **`PER_PAGE` was 200; the API caps it at 100.** Every `runSync` returned 422
   `invalid_per_page`. Sync was broken in production, full stop.
2. **Empty placeholder records overwrote populated ones.** QF emits one record
   per verse in a group, all carrying the same range, but only the first has
   text. Range expansion let the empty ones clobber the populated one —
   **4,328 of 6,236 verses affected**. `readCachedTafsir(169, "36:1")` returned
   NULL despite 3,374 characters of commentary existing upstream.

The lesson worth keeping: a fully green mocked suite told us nothing about
either. Any future change to `parse-mutation.ts`, the adapters, or the request
parameters deserves one live run before it ships.

## Done — RTL static review

New CSS in `Settings.css` and `TafsirSettings.css` contains no physical
`left`/`right`; the section inherits `dir` from the page wrapper as its siblings
do; the date formatter switches on `lang === "ar"`; all eight sync strings exist
in both languages. Not visually confirmed — see below.

## Outstanding — needs a device

### A. Android recitation eviction

The reason this matters: `evictRecitation`'s Android branch is a **stub**, so
today eviction does nothing on the primary release platform (item 1 above).

1. Build and install on a device.
2. Download a reciter's audio for a surah; confirm files appear under the app's
   data dir at `quran-audio/{reciter}_{sura}_{aya}.mp3`.
3. Trigger an invalidate for that recitation.
4. **Expected once implemented:** those files are gone and re-download on next
   play. **Expected today:** they remain — that is the known gap, not a new bug.

### B. Offline tafsir after a real download

1. Download a tafsir in Settings; watch the progress readout advance (this is a
   real ~12 MB fetch now, not the old fake 400 ms timer).
2. Force-quit the app, enable airplane mode, relaunch.
3. Open a verse → tafsir must render from cache with no network.
4. Check a verse inside a grouped range — e.g. **36:1 through 36:7**, or
   **105:1 through 105:5** — since those are the two shapes that were broken and
   are now fixed. All verses in a group must show the same commentary.
5. Interrupt a download mid-way and confirm the tafsir shows "Download
   incomplete" with the resume affordance, rather than claiming success.

### C. RTL visual pass

Switch the app to Arabic and look at the new Settings "المحتوى دون اتصال"
section. The string `"دون اتصال — ستتم المزامنة عند الاتصال"` is considerably
longer than its English counterpart and shares a row with the sync button — that
is the most likely place for a layout problem. Also check the tafsir
downloading/failed/incomplete states, whose Arabic labels are wider than `"+"`.
