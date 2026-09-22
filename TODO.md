# TODO

## Pending Tasks

- [ ] **Android Auto voice search.** `RafeeqMediaService` implements no
      `onPlayFromSearch`, and `TRANSPORT_ACTIONS` omits
      `ACTION_PLAY_FROM_SEARCH`, so "Hey Google, play Surah Al-Baqarah in
      Rafeeq" does nothing in the car. Not a crash or a regression — an
      unimplemented feature, and the item Google's Auto media-app quality
      checklist flags. Found during the Sept 2026 audit that fixed the
      missing `androidx.car.app.category.MEDIA` launcher category.
