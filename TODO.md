# TODO

## Pending Tasks

- [ ] **Android Auto voice search.** `RafeeqMediaService` implements no
      `onPlayFromSearch`, and `TRANSPORT_ACTIONS` omits
      `ACTION_PLAY_FROM_SEARCH`, so "Hey Google, play Surah Al-Baqarah in
      Rafeeq" does nothing in the car. Not a crash or a regression — an
      unimplemented feature, and the item Google's Auto media-app quality
      checklist flags. Found during the Sept 2026 audit that fixed the
      missing `androidx.car.app.category.MEDIA` launcher category.

## iOS gaps

Left out of the first iOS build (branch `ios`, Sept 2026), where the prayer
feature moved to a JS implementation in `prayer-ios.plugin.ts`.

- [ ] **Prayer reminders.** The Settings toggle is hidden on iOS: reminders
      run on Android's alarm scheduler, which has no iOS counterpart. Likely
      route: `@capacitor/local-notifications`, scheduling the next few days
      ahead since iOS caps pending notifications at 64.
- [ ] **Home-screen widget.** `getWidgetInfo` reports unsupported, so the
      button hides. Needs a native WidgetKit extension (and a Mac to build it).
- [ ] **Place name.** `getPlace` returns null, so the prayer page shows its
      title instead of the city. Needs a reverse geocoder (native plugin, or
      an online lookup cached with the coordinates).
- [ ] **Driving mode / car audio.** Android Auto is Android-only. The iOS
      equivalent is CarPlay, which needs Apple's audio-app entitlement request.
- [ ] **Verify the compass correction.** `getQibla` subtracts magnetic
      declination on the assumption `webkitCompassHeading` is magnetic. If the
      needle is off by the local declination on a real iPhone, drop it.
