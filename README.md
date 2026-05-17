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

| Old File | New Location                           | Key Change               |
| -------- | -------------------------------------- | ------------------------ |
| **NEW**  | `core/services/storage/idb.service.ts` | IndexedDB wrapper        |
| **NEW**  | `core/services/data/quran.service.ts`  | Data facade with seeding |
| **NEW**  | `core/utils/platform.util.ts`          | Platform detection       |
