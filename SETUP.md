# Rafeeq App Setup

## Node Version

- Node 22 or newer (`engines` in `package.json`), e.g. with nvm:
  `nvm use 22`
- On this Windows machine, set `ComSpec` before `npm install`, or npm fails
  with `ERR_INVALID_ARG_TYPE`:
  `$env:ComSpec = "C:\Windows\System32\cmd.exe"` (PowerShell)

## Environment

- Copy `.env.example` to `.env.local` and fill it in.
- Release builds read `.env.production`, but `.env.local` overrides it — keep
  RevenueCat Test Store keys (`test_…`) out of any build meant for Play.

## Build Commands

- Development: `npm start`
- Build web: `npm run build:prod`
- Sync Android: `npm run android:sync` (run after any plugin install/update)
- Build debug APK + release AAB: `npm run android:build`
- Tests: `CI=true npx react-scripts test --watchAll=false`
- Token broker tests: `cd token-broker && npm test`

## Output Location

- Debug APK: `android/app/build/outputs/apk/debug/Rafeeq-<versionName>-debug.apk`
- Release AAB: `android/app/build/outputs/bundle/release/Rafeeq-<versionName>-release.aab`

## Android SDK Levels

- compileSdk: 36
- targetSdk: 36
- minSdk: 26

These live in `android/variables.gradle`.
