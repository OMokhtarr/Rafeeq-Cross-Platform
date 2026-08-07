# Capacitor 8 / Android SDK 36 upgrade — handoff

Branch: `upgrade-capacitor-8` (branched from `main` after merging
`android-auto-focus-fixes`).

**Why:** Google Play requires target API **36** for new apps and updates from
**31 Aug 2026**. The project was on API 34. SDK 36 support arrives in Capacitor 8,
so this is a 5 → 8 upgrade, not a one-line bump.

The file edits are done and committed. What remains is toolchain installation and
verification, which has to happen on your machine.

---

## 1. Prerequisites (blocking — nothing installs without these)

| Tool | You had | Required |
|---|---|---|
| Node | 20.20.1 | **≥ 22** (Capacitor 8 CLI hard requirement) |
| JDK | 17 | **21** |
| Android Studio | — | **Otter (2025.2.1)** or newer, for AGP 8.13 |

- Node 22: install via your usual manager, then `node -v` to confirm.
- JDK 21: simplest is the one bundled with Android Studio Otter. Point Gradle at it
  via *Settings → Build Tools → Gradle → Gradle JDK*, or set `JAVA_HOME`.

`engines.node` is now declared in `package.json`, so npm will complain loudly
rather than failing in a confusing way if Node is too old.

---

## 2. Install and sync

```bash
# from the project root, on branch upgrade-capacitor-8
rm -rf node_modules package-lock.json    # the Cap 5 tree cannot be incrementally upgraded
npm install
npx cap sync android
```

`cap sync` regenerates `android/app/capacitor.build.gradle` (currently still says
Java 17 — that file is generated, do not hand-edit it; sync rewrites it to
Capacitor 8's values).

If `npm install` reports peer-dependency conflicts, read them before reaching for
`--legacy-peer-deps`; Ionic 7 with React 18 was fine on the versions checked.

---

## 3. Build

```bash
npm run android:sync
cd android && ./gradlew assembleDebug
```

First run downloads Gradle 8.14.3 and the SDK 36 platform — expect it to be slow.

---

## 4. What to actually verify (ordered by risk)

**Android Auto — highest risk.** Media3 jumped 1.3.1 → 1.11.0 (eight minor
versions) and it drives `RafeeqMediaService` / `RafeeqPlayer`. Check:

- cold start from the car (app not running) still plays
- verse-to-verse advance, and the stall watchdog / brain-ack path
- the audio-focus fixes just merged: a phone call during playback resumes
  afterwards; a call while *paused* does **not** start audio
- notification progress bar still scales (the duration/timestamp path)

If something regresses, step `media3Version` back in `android/variables.gradle`
(1.10.1 → 1.9.4 → …) — that's why it's a variable now. Don't go below 1.4.x; it
won't build against compileSdk 36.

**Edge-to-edge / safe areas — second highest.** targetSdk 36 forces edge-to-edge
on Android 15+. The app now reads `var(--safe-area-inset-*, env(...), 0px)`
everywhere, with the variables supplied by Capacitor's System Bars plugin.

Check on a gesture-navigation device **and** a 3-button-navigation device:
- `BottomNavBar` clears the system nav bar; content is not hidden under it
- status bar does not overlap headers (Home, Search, SearchResults)
- modals reach the bottom correctly (`NoteModal`, `VerseActionSheet`, `AccountModal`)
- the mushaf page viewer's bottom controls

**Text scaling.** Re-check the 130% cap still holds (`MainActivity.applyCappedTextZoom`
plus `-webkit-text-size-adjust`) — `--bottom-nav-height` was touched.

**Recite mode.** Confirm the mic permission prompt still appears (`RECORD_AUDIO`,
`getUserMedia` in the WebView).

---

## 5. Not done yet — still required before Play submission

- **Release signing.** There is still no `signingConfigs.release`; `bundleRelease`
  produces an **unsigned** AAB that Play rejects. Needs an upload keystore, a
  gitignored `keystore.properties`, and Play App Signing enrolment.
  ⚠️ Back the keystore up permanently — losing it means you cannot update the app.
- **Play Console:** foreground-service (`mediaPlayback`) declaration + likely a demo
  video; Data safety form (`RECORD_AUDIO`, Quran Foundation account sync); account
  deletion URL; a **publicly hosted** privacy policy (`privacy.html` is only in the
  repo, and still reads `Last updated: [12-May-2026]` with literal brackets).
- **Closed testing:** personal developer accounts need ~12 testers for 14 continuous
  days before production access. Start this clock as early as possible — it is
  usually the longest pole.
- **Store assets:** 512×512 icon, 1024×500 feature graphic, phone screenshots,
  content rating questionnaire. Android Auto also triggers a car-app quality review.

---

## 6. Notes / decisions taken

- **minSdk stays 26** (Capacitor 8's floor is 24). The Auto path and Media3 already
  assumed 26; lowering it would widen the device matrix with no tested benefit.
- **Electron removed.** `@capacitor-community/electron` has no release above 5.0.1
  and cannot run on Capacitor 8. Scaffolding, npm scripts, and the orphaned
  `concurrently` / `wait-on` devDependencies are gone. The `window.electron` check in
  `platform.util.ts` was deliberately left — it degrades to `false` harmlessly, and
  ripping it out is unrelated to this upgrade.
- **`CapacitorSQLite` config dropped.** The plugin was never installed;
  `idb.service.ts` uses the browser IndexedDB API directly. The config comment
  claiming otherwise was wrong.
- **`android.enableJetifier=true` left in place.** Deprecated but valid through
  AGP 9; removed only in AGP 10. Changing it is unrelated to this upgrade.
- **iOS untouched.** Capacitor 8 also wants iOS deployment target 14+ and Xcode 16+.
  There is no `ios/` directory checked in, so `cap add ios` will scaffold it at
  Cap 8 defaults when needed.
