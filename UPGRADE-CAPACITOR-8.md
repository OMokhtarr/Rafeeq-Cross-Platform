# Capacitor 8 / Android SDK 36 upgrade — handoff

Branch: `upgrade-capacitor-8` (branched from `main` after merging
`android-auto-focus-fixes`).

**Why:** Google Play requires target API **36** for new apps and updates from
**31 Aug 2026**. The project was on API 34. SDK 36 support arrives in Capacitor 8,
so this is a 5 → 8 upgrade, not a one-line bump.

**Status: the upgrade builds and is signed.** Toolchains are installed, `npm install`,
`cap sync android`, `assembleDebug` and `bundleRelease` all pass, and the resulting
AAB reports `targetSdkVersion 36`. What remains is **on-device** testing, which
needs real hardware.

---

## 1. Toolchain — done

| Tool | Was | Now |
|---|---|---|
| Node | 20.20.1 | **22.11.0** (installed via nvm-windows) |
| JDK | 17 | **21.0.10** (Android Studio's bundled JBR — nothing to install) |

`nvm use 22.11.0` is already active. `engines.node` is declared in `package.json`,
so npm fails loudly if a shell falls back to Node 20.

**`JAVA_HOME` is now set permanently** at **User** scope to
`C:\Program Files\Android\Android Studio\jbr` (JDK 21). Verified in the registry at
`HKCU:\Environment`. The Machine-scope value still points at JDK 17 and was left
alone; User scope takes precedence, so any newly opened terminal builds without
setup. Terminals already open when it was set keep the old value until restarted.

To undo: delete the User `JAVA_HOME` variable and the machine falls back to JDK 17
(at which point Gradle fails with `invalid source release: 21`).

---

## 2. Install and sync — done, repeat as needed

```bash
npm install
npx cap sync android
```

`cap sync` regenerates `android/app/capacitor.build.gradle` — it now carries Java 21.
Never hand-edit that file; sync rewrites it.

The install pulled 1418 packages cleanly. Deprecation warnings (eslint 8, uuid,
svgo, workbox) are pre-existing and unrelated to this upgrade.

---

## 3. Build — verified

```bash
npm run build:prod
npx cap sync android
cd android && ./gradlew assembleDebug     # or bundleRelease for a signed AAB
```

Confirmed output: `android/app/build/outputs/bundle/release/Rafeeq-1.1.0-release.aab`
(10.29 MB), signed with the upload key, `targetSdkVersion:'36'`, `minSdkVersion:'26'`.

`electron/` still has untracked leftovers on disk (`node_modules/`, `build/`,
`electon.zip`) — the tracked files are gone, so the folder is safe to delete
manually. `.gitignore` still lists electron paths; harmless, remove whenever.

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
(1.10.1 → 1.9.4 → …) — that's why it's a variable now. **1.3.1 remains a valid
last resort**: the old pin existed because Media3 1.4+ *requires* compileSdk ≥ 35,
not the other way round, so the older library still builds fine against SDK 36.
It's the exact version that shipped, so it isolates "Media3 upgrade broke it" from
"SDK 36 broke it" — at the cost of two years of fixes.

**Edge-to-edge / safe areas — CHECKED ON EMULATOR, PASSED.** targetSdk 36 forces
edge-to-edge on Android 15+. The app now reads `var(--safe-area-inset-*, env(...), 0px)`
everywhere, with the variables supplied by Capacitor's System Bars plugin.

Verified on the `Pixel_8_Pro` AVD (android-36.1, **API 36 / Android 16**), debug APK,
both navigation modes:

| Screen | Gesture nav | 3-button nav |
|---|---|---|
| Home (Basmalah) | pass | pass |
| Quran / mushaf (Al-Fatihah, Tajweed) | — | pass |
| Settings (long scroll + header) | — | pass |

In every case the `BottomNavBar` sat directly above the system nav bar with no
overlap and no dead gap, and headers cleared the status bar. No layout regression
from the safe-area rework.

Still worth a glance on **real hardware** (emulators model insets well but not
perfectly), and these were not exercised:
- modals at the bottom edge (`NoteModal`, `VerseActionSheet`, `AccountModal`)
- the mushaf page viewer's bottom controls
- a device with a notch/cutout, which the Pixel 8 Pro AVD does not have

One red herring seen while testing: toggling the navigation mode with the app in
the foreground produced
`InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': The database
connection is closing.` and a stuck "Loading page…". That is the WebView being torn
down mid-transaction by the configuration change — a force-stop and relaunch renders
Al-Fatihah correctly. Not caused by this upgrade (it touched no JS), but it is a
genuine rough edge in `idb.service.ts` if a real config change ever hits mid-read.

**Text scaling.** Re-check the 130% cap still holds (`MainActivity.applyCappedTextZoom`
plus `-webkit-text-size-adjust`) — `--bottom-nav-height` was touched.

**Recite mode.** Confirm the mic permission prompt still appears (`RECORD_AUDIO`,
`getUserMedia` in the WebView).

---

## 5. Release signing — done

`bundleRelease` now produces a **signed** AAB. Setup:

- `android/rafeeq-upload.jks` — 4096-bit RSA upload key, alias `rafeeq-upload`,
  valid to 2053 (Play requires validity past 2033).
- `android/keystore.properties` — credentials, read by `signingConfigs.release`.
- Both are **gitignored** (`keystore.properties`, `*.jks`, `*.keystore`), so the
  key never enters version control. Verified: `git check-ignore` matches both.
- The config guards on the file existing, so a fresh clone or CI without the
  secret still builds (unsigned) rather than failing configuration.

> ⚠️ **Back up `rafeeq-upload.jks` and `keystore.properties` now**, somewhere off
> this machine. If you lose them you cannot ship updates to an existing Play
> listing — Google cannot reset an upload key you never registered, and even with
> Play App Signing a lost upload key means a support request at best.
>
> They are gitignored, so `git push` will **not** back them up for you.

Enrol in **Play App Signing** when you create the listing: Google then holds the
real app signing key and this `.jks` is only the upload key, which is recoverable.

---

## 6. Not done yet — still required before Play submission

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

## 7. Notes / decisions taken

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

### Fixes that only surfaced by actually building

- **`MainActivity.onNewIntent`** — API 36 tightened the signature; the `Intent`
  parameter is no longer nullable. Was `Intent?`, now `Intent`.
- **Gradle heap** — raised 1536m → 4g in `gradle.properties`. AGP 8.13 + compileSdk
  36 needs the headroom.
- **`org.gradle.java.home` is not read from `local.properties`** — only from
  `gradle.properties` or the environment. Putting it there silently does nothing;
  use `JAVA_HOME` (see section 1).

### Environment quirk worth knowing

`npm install` fails with `ERR_INVALID_ARG_TYPE: The "file" argument must be of type
string` when the `ComSpec` environment variable is unset — npm passes it to `spawn()`
for every package install script, so *any* package with an install script dies and the
error names whichever one ran first (`sharp`, `core-js`, …). It is not a bad
dependency. Fix: ensure `ComSpec=C:\Windows\System32\cmd.exe`. Normal Windows shells
set this already; it only bites in stripped-down environments.
