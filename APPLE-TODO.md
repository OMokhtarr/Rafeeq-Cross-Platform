# Apple TODO

Everything needed to ship Rafeeq on iPhone. Nothing here blocks the Android
release. There is no `ios/` project yet, and most steps need a Mac with Xcode 16+
(Capacitor 8 wants iOS 14+ as the deployment target). Store detail lives in
`PLAY-CONSOLE-PREP.md` §9 ("Accounts — owner setup" item 3 and "iPhone").

## 1. Accounts and project

- [ ] **Apple Developer Program** membership, and an App Store Connect app
      record for the bundle id `com.rafeeq.quranquiz`.
- [ ] **`npx cap add ios`** on a Mac, then `npx cap sync ios`. Commit the new
      `ios/` folder.
- [ ] **Icons and splash**: generate the iOS set with `@capacitor/assets`.

## 2. Info.plist and capabilities

- [ ] `NSMicrophoneUsageDescription` (English + Arabic) for recite mode.
- [ ] `NSLocationWhenInUseUsageDescription` (English + Arabic) for prayer
      times and Qibla (`@capacitor/geolocation`).
- [ ] **Background audio**: `UIBackgroundModes` → `audio`, so recitation keeps
      playing with the screen locked.
- [ ] **Sign in with Apple** capability on the App target.
- [ ] **Privacy manifest** (`PrivacyInfo.xcprivacy`) covering the
      required-reason APIs the plugins use (for example UserDefaults via
      `@capacitor/preferences`); check each plugin ships its own.

## 3. Sign-in

- [ ] **Apple sign-in setup**: a Services ID and a Sign in with Apple key. In
      Supabase's Apple provider set the Services ID and add the iOS bundle id
      among the client ids; add `rafeeq://auth/callback` to Supabase's redirect
      allow-list (URL Configuration).
- [ ] **Edge Function secrets** for Apple: `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
      `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`. Without them, deleting an
      account that holds an Apple token fails (502) rather than leave Apple's
      grant live.
- [ ] **Google sign-in on iOS**: an iOS OAuth client in Google Cloud.
      `SocialLogin.initialize` in `auth.service.ts` must pass `iOSClientId`
      (that client) and `iOSServerClientId` (the Web client id); today only
      `webClientId` is passed. Add the iOS client id to the Supabase Google
      provider's client ids too.
- [ ] **Apple button**: check the glyph and proportions in `SignInSheet`
      against Apple's official assets (or use the native button). Apple
      rejects a hand-drawn logo under its Human Interface Guidelines.
- [ ] Optional: `REACT_APP_APPLE_SIGNIN=on` shows Apple on Android too (iOS
      always shows it). Known limit: Apple accounts created through the
      Android web flow have no stored Apple token, so deletion can't revoke
      Apple's grant for them.

## 4. Rafeeq Pro on iOS

- [ ] Create the `monthly` and `yearly` subscriptions in App Store Connect
      and link them in RevenueCat (iOS app, App Store Connect API key, the
      same entitlement `com_rafeeq_quranquiz_pro` and `default` offering).
- [ ] Put the `appl_…` public key in `.env.production` as
      `REACT_APP_REVENUECAT_IOS_KEY`.
- [ ] Sandbox purchase test: buy, renew, expire, reinstall + Restore,
      Customer Center.

## 5. Android-only features to decide on

These run on Android only today (`getPlatform() === "android"` checks); on
iOS they fall back or are absent. Decide per item whether iOS needs its own
version before the first release.

- [ ] **Audio engine**: Android uses native Media3 and a shared file cache;
      iOS uses the web `<audio>` path. Check lock-screen controls and
      background playback.
- [ ] **Prayer alarms**: Android-only (native alarms). iOS would need local
      notifications instead.
- [ ] **Hifz storage**: Android keeps a native file copy beside
      localStorage; iOS uses localStorage alone.
- [ ] **Text size**: Ionic 8 scales the root font with Dynamic Type on iOS
      (`--ion-dynamic-font`, on by default, Safari only). Check it against
      the 130% text-size cap in `src/index.css`, so large accessibility sizes
      don't break the mushaf and quiz layouts.
- [ ] **Storage origin**: `capacitor.config.ts` uses `iosScheme: "ionic"`
      (Android uses `https`), so iOS has its own localStorage/IndexedDB
      origin. Check that storage and the WebView CSS floor
      (`docs/webview-compat-audit.md`) behave on the oldest supported iOS.

## 6. Build and store

- [ ] **Codemagic** (`codemagic.yaml`): pins Node 18, but `package.json`
      requires Node 22+. Also triggers on every push to `main`, so builds
      will fail until signing and the App Store Connect key are set up there.
- [ ] **App Privacy** answers in App Store Connect (mirror Play's Data
      safety: name, email, user id, purchase history, user content for Pro
      sync).
- [ ] **App Review notes**: reviewer account with promotional Pro (the
      RevenueCat reviewer account already has lifetime Pro); in-app account
      deletion is in Account (Guideline 5.1.1(v)).
- [ ] Screenshots, listing text (English + Arabic), age rating.
