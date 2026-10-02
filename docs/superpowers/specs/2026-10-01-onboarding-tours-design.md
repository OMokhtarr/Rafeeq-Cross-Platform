# Onboarding — welcome slides, page spotlight tours, "What's new"

Date: 2026-10-01
Branch: `onboarding-tours`
Status: **Design approved in chat; awaiting spec review.**

## Goal

A first-time user should discover what Rafeeq can do, including the many
features that are invisible gestures (swipe to turn pages, long-press a word for
the verse sheet, long-press Play for recite mode, swipe-to-reset in Azkar, and
so on). When a later update ships a feature, existing users should find out
about **that feature only**, without seeing the full onboarding again.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Format | Both: welcome slides **and** spotlight tours on real UI |
| Coverage | All features (catalog below) |
| Spotlight timing | **Per page, on first visit** (plus contextual tours on the first appearance of a state) |
| Welcome slides scope | Intro **plus a language pick** on slide 1 |
| Slide visuals | **Custom gold line-art illustrations** (inline SVG, `currentColor`) |
| Spotlight look | **Gold ring cutout + a bottom card** (card flips to the top when the target is low) |
| New features | **"What's new" deck on launch** + the feature's spotlight tour (the deck's "Show me" navigates there) |
| Users updating from a pre-onboarding build | **Page tours only.** No welcome slides, no "What's new" for features that predate them |
| Replay | A **"Tours & tips"** section on the Settings page (not in the tracker) |
| Engine | **Built in-house.** No tour library (driver.js and react-joyride were rejected: both position popovers next to the target, fight RTL and IonContent scrolling, and need manual back-button integration anyway) |

Mockups chosen during the brainstorm: `slides-style.html` option A and
`spotlight-style.html` option B, in `.superpowers/brainstorm/`. They are not
committed.

## Architecture

All new code lives in `src/app/features/onboarding/`.

| Unit | Responsibility | Depends on |
|---|---|---|
| `onboardingStore.ts` | Read/write `rafiq_onboarding_v1`; `detectExistingUser()`; mark tours and releases seen; reset. Pure functions, no React. | localStorage |
| `tourCatalog.ts` | Typed data: the welcome slides, every tour (`id`, `steps[]`) and the `RELEASES` list. Content only, no logic. | `strings.ts` keys |
| `tourLogic.ts` | Pure rules: which releases are unseen, which of a page's tours are pending, card placement (top/bottom) from a target rect and the viewport. | catalog, store |
| `SlideDeck.tsx` (+ `.css`) | Full-screen slide shell: illustration, title, body, dots, Skip, Previous/Next (Get Started / Done on the last slide), pointer swipe mirrored for RTL. | theme tokens, `useLang` |
| `WelcomeSlides.tsx` | `SlideDeck` with the language-pick slide first. | `LanguageContext.setLang` |
| `WhatsNew.tsx` | `SlideDeck` with one slide per unseen release feature; each slide has a **Show me** button. | router |
| `illustrations.tsx` | 6 line-art SVGs (brand mark, open mushaf, microphone over mushaf, check-marked card, tasbih + checklist, compass + mihrab). Stroke is `currentColor`. | — |
| `TourProvider.tsx` | Context: a single-run queue of tour requests, gating, persisting "seen", exposes `requestTour()` / `replay*()`. Also renders the decks. | store, logic, overlay-registry |
| `SpotlightOverlay.tsx` (+ `.css`) | Portal overlay: dim + gold ring cutout around the target, bottom/top card, gesture glyph animation. | provider |
| `usePageTour.ts` | Page hook: `usePageTour(tourIds, { ready })`. Requests the page's pending tours on `useIonViewDidEnter` once `ready` is true. | provider, `@ionic/react` |
| `OnboardingGate.tsx` | Decides at launch whether to show `WelcomeSlides`, `WhatsNew` or nothing. | store, logic |

### Wiring

- `TourProvider` wraps `MainRouterOutlet` **inside** `IonReactRouter`, so it can
  navigate for "Show me" and see the location.
- `App.tsx` runs the store's one-time initialisation (`initOnboarding()`)
  **before** `ensureSince(...)`. `ensureSince` writes `rafeeq.tracker.since`,
  which is one of the existing-user signals, so the order matters.
- **Targets:** pages add `data-tour="<tourId>.<stepKey>"` attributes to the
  elements to highlight. The overlay resolves a target **only inside the active
  Ionic page** (`.ion-page:not(.ion-page-hidden)`, or the topmost `.ion-page`
  in the outlet), because Ionic keeps previous pages mounted.
- **Sheets** (verse sheet, playback sheet) are portal-free children of their
  page, so their targets resolve the same way. Contextual tours call
  `requestTour(id)` directly when their state first appears, e.g.
  `useEffect(() => { if (open) requestTour("verseSheet") }, [open])`.
- **Immersive mode:** `PageViewer` exposes `immersive.showChrome()` to the
  engine through an optional `onBeforeStart` callback passed to `usePageTour`,
  so the toolbar and tab bar are visible before any viewer step runs.

## Data model

```ts
// localStorage key: rafiq_onboarding_v1
interface OnboardingState {
  welcomeDone: boolean;
  seenTours: string[];      // tour ids
  seenReleases: string[];   // release ids, e.g. "1.2.0"
}

interface TourStep {
  key: string;              // matches data-tour="<tourId>.<key>"
  title: StringKey;         // strings.ts lookup, ar + en
  body: StringKey;
  gesture?: "swipe" | "longPress" | "doubleTap" | "tap";
  optional?: boolean;       // see Robustness: missing target → skip
}

interface Tour { id: string; steps: TourStep[]; }

interface ReleaseFeature {
  illustration: IllustrationId;
  title: StringKey;
  body: StringKey;
  route: string;            // "Show me" destination
  tourId: string;           // played on arrival
}

interface Release { id: string; features: ReleaseFeature[]; }
```

Release ids are labels only. Nothing reads the app's `versionName`.

## Trigger rules

### First launch of this build (no `rafiq_onboarding_v1` stored)

- **Existing user.** `detectExistingUser()` finds any of these keys:
  `rafiq_settings_v1`, `rafiq_last_page_v1`, `rafeeq.tracker.since`,
  `rafiq_lang_v1`, `rafiq_theme_v1`, `rafiq_bookmarks_v1`, `rafiq_hifz_v2`,
  `rafiq_notes_v1`. In that case:
  - store `{ welcomeDone: true, seenReleases: <all current release ids>, seenTours: [] }`
  - page tours then play on the next visit to each page.
- **New user.** Otherwise store `{ welcomeDone: false, seenReleases: [], seenTours: [] }`
  and show `WelcomeSlides`.
  - **Finishing or skipping** the slides sets `welcomeDone: true` and marks
    **all current releases** seen.

### Later launches

- If `RELEASES` contains ids that aren't in `seenReleases`, show `WhatsNew` with
  their features, oldest release first.
  - **Skip** or **Done** marks those releases seen.
  - **Show me** marks them seen, closes the deck, navigates to the feature's
    `route`, and that page's hook plays the pending `tourId`.

### Page tours

- `usePageTour(["viewer"], { ready })` runs on `ionViewDidEnter`. It requests
  every listed tour that isn't in `seenTours`, **in listed order**. A page with
  a main tour plus a newly shipped feature tour plays them back to back.
- A tour is marked seen when it is **completed or skipped**, including a skip
  via the back button or edge swipe.
- A tour is **not** marked seen if it was cut short by navigation, or if none of
  its targets resolved.

### Gating — a request waits, and is not dropped, while:

- another tour or deck is running (single queue)
- `hasOpenOverlay()` is true, except for tours requested *by* that overlay
  (verse sheet, playback sheet)
- recite mode is recording or audio is playing, except for the contextual tours
  of those states (`viewer.playbackBar`, `viewer.reciteBar`)
- the page's `ready` flag is false

Requests are dropped when the user leaves the page.

### Settings → "Tours & tips"

| Row | Action |
|---|---|
| Show welcome slides | Opens `WelcomeSlides` now, as a replay. Changes no flags except the language, if it's picked again. |
| Replay page tips | Clears `seenTours`; toast: "Tips will show again as you visit each page." |
| What's new | Reopens the most recent release's deck. Hidden while `RELEASES` is empty. |

### Shipping a feature later (developer checklist)

1. Add a tour with a **new id** to `tourCatalog.ts`, plus `data-tour`
   attributes on its targets, and add its id to the page's `usePageTour` list.
2. Add a `Release` entry with the feature's slide (illustration, title, body,
   route, tourId).
3. Add the ar/en strings.

## Content

### Welcome slides (new users only)

| # | Content | Illustration |
|---|---|---|
| 1 | Basmalah, "Welcome to Rafeeq", **العربية / English** buttons (switch immediately via `setLang`) | brand mark |
| 2 | Read & listen: Tajweed mushaf, tafsir, reciters, works offline | open mushaf |
| 3 | Recite & memorize: recite mode, hide/reveal, Hifz plan | microphone over mushaf |
| 4 | Test yourself: the three quiz types | check-marked card |
| 5 | Daily worship: Azkar and the Worship Tracker | tasbih + checklist |
| 6 | Prayer times & Qibla (and the home-screen widget on Android) → **Get Started** | compass + mihrab |

### Spotlight tours

✋ marks a gesture step. The *Target* column names the element that gets the
`data-tour` attribute; file references come from the 2026-10-01 inventory.

| Tour id | Trigger | Steps (key → target) |
|---|---|---|
| `home` | first visit `/` | `tabs` → `.rfq-tab-bar`; `more` → the More tab |
| `viewer` | first visit `/viewer` | ✋`swipe` → `.mushaf-content`; `pill` → `.toolbar-center-pill`; ✋`play` → `.play-button` (tap = listen, long-press = recite); `hide` → `.hide-toggle-button`; ✋`verse` → `.mushaf-content` (long-press a word / tap the ayah number); `nav` → bookmark + search buttons; ✋`immersive` → `.mushaf-content` (double-tap) |
| `viewer.verseSheet` | first verse-sheet open | `actions` → `.vas-play-btn`…`.vas-bookmark-btn` group; `tafsir` → tafsir resource bar; ✋`swipe` → `.vas-verse-row` |
| `viewer.playbackSheet` | first playback-sheet open | `range` → range selects; `quick` → quick-select chips; `reciter` → reciter select + Manage downloads; `speed` → speed/repeat chips |
| `viewer.playbackBar` | first playback | `controls` → `.toolbar-playback-bar` |
| `viewer.reciteBar` | first recite recording, before the user speaks | `transcript` → transcript area; `stop` → mic stop button |
| `viewer.reciteReveal` | first time the reveal buttons show mid-recitation (verse recognised, page not shown in full) | `reveal` → reveal word/verse buttons |
| `viewer.reveal` | first time verses are hidden | `word` → reveal-next-word; `verse` → reveal-next-verse |
| `surahJuz` | first visit `/surah-juz` | `tabs` → Surahs/Juz/Hizb tabs |
| `search` | first visit `/search` | `input` → `.search-bottom-bar`; `recents` (optional) → recents list |
| `quizList` | first visit `/quiz-list` | `ayah`, `mutashabihat`, `nehayat` → the three `.ql-card`s |
| `quizSetup` | first visit to any of the 3 setup pages | `mode` → Simple/Advanced tabs; `scope` → Surah/Pages/Juz; `count` → question-count chips; `start` → Start |
| `azkar` | first visit `/azkar` | `mine` → "My Azkar" card; `progress` → first category card |
| `azkarCategory` | first visit `/azkar/:id` | `counter` → `.azkar-count-btn`; `star` → favorite star; ✋`swipe` → first zikr card; `ref` → reference button |
| `hifzSetup` | first visit to the Hifz setup view | `add` → "+ Add memorized"; `goal` → goal unit chips; `generate` → `.hifz-generate-btn` |
| `hifzDashboard` | first visit to the Hifz plan view | ✋`hero` → `.hifz-hero-scroll`; `streak` → streak chip; `sessions` → "View all sessions" |
| `hifzSessions` | first visit to the Hifz sessions view | `done` → first session's done toggle; `open` (optional) → open-in-Quran / quiz-from-session |
| `more` | first visit `/more` | `cards` → the `.more-card` grid |
| `prayerTimes.setup` | first visit `/prayer-times` with no location | `grant` → `.pt-grant-btn` |
| `prayerTimes` | first visit `/prayer-times` once a location exists | `next` → next-prayer countdown; `qibla` → `.qh-dial`; `menu` → `.pt-menu-btn` |
| `tracker` | first visit `/tracker` | `item` → first item (tap to mark done); `locked` (optional) → first locked item; ✋`shortcut` → morning-azkar item (long-press); `strip` → `.wt-strip-day` row + `.wt-cal-btn`; `header` → settings + help icons |
| `bookmarks` | first visit `/bookmarks` | `tabs` → Verses / Recitation Sessions tabs |
| `settings` | first visit `/settings` | `look` → Language + Appearance sections; `sync` → Offline content section; `reminders` → Prayer reminders toggle; `tours` → Tours & tips section |
| `tafsirLibrary` | first visit `/tafsir-settings` | `library` → Available library section; `downloaded` → Downloaded section |
| `account` | first visit `/account` | `notes` → Notes collapsible; `backup` → Export/Import; `streak` (optional) → streak freeze |

Copy: a title of 2–5 words and a body of 1–2 lines, in Arabic and English,
added to `strings.ts` under a new `onboarding` group (`slides`, `tours`,
`controls`, `settings`).

## UI behaviour

**Slides**
- Full-screen layer above the router; app background token.
- Skip at the top start. Dots, then Previous/Next at the bottom.
- A pointer-drag swipe moves between slides; its direction is mirrored in RTL.
- Width is capped at `var(--max-width-mobile, 600px)`, centered.
- Insets come from `--safe-inset-*`.

**Spotlight**
- Dim is `rgba(0,0,0,.72)`. The cutout is a rounded rect around the target's
  bounding box, padded 6px, with a 2px `--color-gold` ring (box-shadow
  technique).
- Taps on the dim **and** on the highlighted element are swallowed during the
  tour; only the card's buttons act.
- If the target is outside the visible area of its `IonContent`, the engine
  scrolls it into view (`scrollToPoint`/`scrollIntoView`) before showing the
  step.
- The overlay re-measures on scroll, resize and rotation (`ResizeObserver`
  plus an rAF loop while a step is active).

**Card**
- Same surface as the existing sheets: `--color-bg-card` with a gold border.
- Contents: title, body, step dots, **Previous** (from step 2), **Next** (or
  **Done** on the last step), **Skip**.
- Sits at the bottom, above the safe area and the BottomNavBar height.
  `tourLogic.placeCard()` moves it to the top when the target's centre is in
  the lower 40% of the viewport.
- Width is capped at `var(--max-width-mobile, 600px)`.

**Gesture glyph**
- A small hand drawn over the target, looping a ~1.2s animation of the
  gesture (swipe / long-press pulse / double-tap).
- A static glyph under `prefers-reduced-motion`.

**Accessibility**
- The card and the slides use `role="dialog"`, `aria-modal="true"`, focus
  moved to the card, and an `aria-live="polite"` step counter
  ("Step 2 of 5").
- Buttons have a 44px minimum touch target.
- Type uses the existing tokens, so the 130% text-scaling cap applies.

**Back / edge swipe**
- The overlay and the decks register with `overlay-registry`, so back or an
  edge swipe = **Skip**.

**CSS rules (CLAUDE.md)**
- No visible scrollbars.
- No hard-coded page max-width.
- Every page container keeps its bottom-nav padding.
- No ESLint disable comments.

## Robustness

- **Missing target.** A step whose target is missing or zero-sized after
  about 1.5s of retries is skipped silently. If **no** step of a tour
  resolves, the tour is not marked seen, so it retries on the next visit.
- **Blocked localStorage.** Reads fall back to "everything seen", so the user
  is never shown onboarding on every launch.
- **Navigation mid-tour** (back, deep link, widget tap, Android Auto) ends the
  tour without marking it seen.
- **Language switched on slide 1.** It re-renders the deck in the new language
  and flips direction immediately.

## Testing

- **Jest unit tests** (`CI=true npx react-scripts test --watchAll=false --testPathPattern onboarding`):
  - `onboardingStore`: init for new vs. existing users, each legacy key,
    blocked storage, reset
  - `tourLogic`: unseen-release selection, pending tours in order, card
    placement thresholds
  - Queue/gating rules, extracted as pure functions so they can be tested
    without React.
- **Type gate:** `npx tsc --noEmit -p tsconfig.json` (Vitest is broken
  repo-wide; see project notes).
- **Manual check** on the web dev server: day/night × ar/en, the new-user
  path, the existing-user path (seed a legacy key), a fake release in
  `RELEASES`, and replay from Settings.
- **Android** on-device layout is checked by the user. No builds or `cap sync`
  are run by Claude.

## Out of scope

- Analytics on tour completion.
- Remote or server-driven tour content.
- Per-step "seen" tracking.
- Tours for the three quiz *test* screens (they are mid-task, and the setup
  tour covers them).
- Tours for Search Results and Azkar Reference (single-purpose screens).
