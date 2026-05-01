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

| Old File                          | New Location                                  | Key Change                   |
| --------------------------------- | --------------------------------------------- | ---------------------------- |
| `src/App.js`                      | `src/App.tsx`                                 | HashRouter → IonReactRouter  |
| `toHindiNumbers()` (in 5 files)   | `core/utils/arabic.util.ts`                   | Single shared source         |
| `removeDiacritics()` (in 4 files) | `core/utils/arabic.util.ts`                   | Single shared source         |
| `public/electron.js`              | `electron/src/index.ts` (Capacitor-generated) | Capacitor Electron           |
| **NEW**                           | `workers/search.worker.ts`                    | Offloads search index build  |
| **NEW**                           | `workers/quiz-gen.worker.ts`                  | Offloads question generation |
| **NEW**                           | `core/services/storage/idb.service.ts`        | IndexedDB wrapper            |
| **NEW**                           | `core/services/data/quran.service.ts`         | Data facade with seeding     |
| **NEW**                           | `core/utils/platform.util.ts`                 | Platform detection           |

## Critical Architecture Decisions

### 2. Quiz config via Capacitor Preferences (not location.state)

`QuizSetup.tsx` stores config with `Preferences.set({ key: 'quizConfig', ... })`
before navigating. `QuizTest.tsx` reads it with `Preferences.get(...)`.
This survives native back-navigation on iOS/Android (location.state does not).

### 3. Web Workers for heavy computation

- `search.worker.ts` — builds the 6,236-verse search index off the main thread
  Both were previously synchronous operations that blocked the UI.
