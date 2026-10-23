# TODO

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
