# Rafeeq رفيق — Ionic + Capacitor

Quran Quiz & Viewer · Web · iOS · Android · Desktop

---

## Quick Start

```bash
npm install
npm start          # web dev server on http://localhost:8100
```

## Platform Builds

```bash
# Web (PWA)
npm run build:prod

# iOS (requires macOS + Xcode 15+)
npm run ios:sync && npm run ios:open

# Android (requires Android Studio)
npm run android:sync && npm run android:open

# Desktop (Electron via Capacitor)
npm run electron:dev        # dev mode
npm run electron:build      # packaged installer
```

---

## What Was Migrated

| Old File                                | New Location                                             | Key Change                              |
| --------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `src/App.js`                            | `src/App.tsx`                                            | HashRouter → IonReactRouter             |
| `src/data/quranLoader.js`               | `core/services/data/repositories/ayah.repository.ts`     | Async + IDB cache                       |
| `src/data/quran-text.json`              | `public/data/quran-text.json`                            | **Out of bundle** → IDB on first launch |
| `src/shared/utils/verseSplitter.js`     | `core/services/quiz/quiz-engine.service.ts`              | Service class                           |
| `src/shared/utils/mutashabihatUtils.js` | `features/mutashabihat/services/mutashabihat.service.ts` | Service class                           |
| `toHindiNumbers()` (in 5 files)         | `core/utils/arabic.util.ts`                              | Single shared source                    |
| `removeDiacritics()` (in 4 files)       | `core/utils/arabic.util.ts`                              | Single shared source                    |
| `public/electron.js`                    | `electron/src/index.ts` (Capacitor-generated)            | Capacitor Electron                      |
| **NEW**                                 | `workers/search.worker.ts`                               | Offloads search index build             |
| **NEW**                                 | `workers/quiz-gen.worker.ts`                             | Offloads question generation            |
| **NEW**                                 | `core/services/storage/idb.service.ts`                   | IndexedDB wrapper                       |
| **NEW**                                 | `core/services/data/quran.service.ts`                    | Data facade with seeding                |
| **NEW**                                 | `core/utils/platform.util.ts`                            | Platform detection                      |

## Critical Architecture Decisions

### 1. quran-text.json is NOT in the webpack bundle

The 2.8 MB JSON is now at `public/data/quran-text.json` and fetched + stored
in IndexedDB on first launch only. This cuts the initial bundle from ~4.5 MB
to ~500 KB.

### 2. Quiz config via Capacitor Preferences (not location.state)

`QuizSetup.tsx` stores config with `Preferences.set({ key: 'quizConfig', ... })`
before navigating. `QuizTest.tsx` reads it with `Preferences.get(...)`.
This survives native back-navigation on iOS/Android (location.state does not).

### 3. Web Workers for heavy computation

- `search.worker.ts` — builds the 6,236-verse search index off the main thread
- `quiz-gen.worker.ts` — generates quiz questions off the main thread
  Both were previously synchronous operations that blocked the UI.

### 4. All existing quiz logic is unchanged

`verseSplitter.js`, `mutashabihatUtils.js`, answer checking — zero logic changes,
only moved into TypeScript service classes and workers.
