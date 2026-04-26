# Rafeeq App Setup

## Node Version

- Use nvm:
  vm use 20.20.1

## Build Commands

- Development:
  pm start or ionic serve
- Build web:
  pm run build:prod
- Sync Android:
  pm run android:sync
- Build APK: cd android && ./gradlew assembleDebug

## APK Location

- Debug: ndroid/app/build/outputs/apk/debug/Rafeeq-رفيق-debug.apk
- Release: ndroid/app/build/outputs/apk/release/Rafeeq-رفيق-release.apk

## Important Notes

- compileSdk: 34
- targetSdk: 34
- minSdk: 22
