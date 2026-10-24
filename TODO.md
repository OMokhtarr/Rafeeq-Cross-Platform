# TODO

## Rafeeq Pro launch (RevenueCat)

Code is done and merged; Test Store purchases, restore and the Arabic paywall
are verified on a debug build. What's left is store setup and launch, in this
order. Full detail in `PLAY-CONSOLE-PREP.md` §9.

- [ ] **Google Play products.** In Play Console → Monetize → Subscriptions,
      create `monthly` and `yearly` with their real prices and base plans.
- [ ] **Link Play to RevenueCat.** Add the Play Store app in RevenueCat,
      upload Google's service-account credentials, attach the Play products
      to the entitlement `com_rafeeq_quranquiz_pro`, and put them in the
      `default` offering's Monthly and Annual packages. Add your Google
      account as a license tester in Play Console.
- [ ] **Keys.** Put the `goog_…` public key in `.env.production` as
      `REACT_APP_REVENUECAT_ANDROID_KEY`, and **delete the `test_` line from
      `.env.local`** — `.env.local` overrides `.env.production`, and the SDK
      crashes release builds that carry a Test Store key (the app refuses it,
      so RevenueCat would simply be off).
- [ ] **Worker.** Copy the RevenueCat secret key (`sk_…`), run
      `npx wrangler secret put REVENUECAT_SECRET_KEY`, and deploy with
      `REQUIRE_PRO` still `"false"`.
- [ ] **Store forms.** Before the first build carrying the `goog_` key:
      content rating (digital purchases = Yes) and Data safety (purchase
      history). The hosted privacy policy and terms must already name
      RevenueCat and cover subscriptions.
- [ ] **Real-purchase test.** Closed-testing build with the `goog_` key and
      the license-tester account: buy, renew, expire, reinstall + Restore,
      Customer Center.
- [ ] **Launch.** Set `REACT_APP_PRO_GATE=on` in `.env.production` (leave it
      out of `.env.local`) and release; then set `REQUIRE_PRO = "true"` in
      `token-broker/wrangler.toml` and deploy; then run
      `PRO_USER_ID=<a subscriber's Support ID> bash token-broker/verify-deploy.sh`
      — every check must pass.

## Pending Tasks

- [ ] **Android Auto voice search.** `RafeeqMediaService` implements no
      `onPlayFromSearch`, and `TRANSPORT_ACTIONS` omits
      `ACTION_PLAY_FROM_SEARCH`, so "Hey Google, play Surah Al-Baqarah in
      Rafeeq" does nothing in the car. Not a crash or a regression — an
      unimplemented feature, and the item Google's Auto media-app quality
      checklist flags. Found during the Sept 2026 audit that fixed the
      missing `androidx.car.app.category.MEDIA` launcher category.

- [ ] **Ionic version mismatch.** `@ionic/react` is on 7.8.6 (`^7.0.0`) but
      `@ionic/react-router` is on 8.8.19 (`^8.7.18`). Mixed majors work today
      but aren't a supported pairing. Align both on Ionic 8 (`@ionic/react`
      8.x — read Ionic's 7→8 migration guide first) and re-test navigation,
      Back handling, overlays and the bottom nav. Ionic 9 is out too, but
      that is a separate, later upgrade. Found in the Oct 2026 dependency audit.
