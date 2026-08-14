# Play Store assets

Generated 13 Aug 2026 for the `com.rafeeq.quranquiz` listing (versionCode 2 /
versionName 1.1.0). Everything here is ready to upload as-is.

| File | Play slot | Spec | Status |
|---|---|---|---|
| `icon-512.png` | App icon | 512×512 PNG, no alpha | Ready |
| `feature-graphic-1024x500.png` | Feature graphic | 1024×500 PNG | Ready |
| `screenshot-01-home.png` | Phone screenshot | 1080×1920 (9:16) | Ready |
| `screenshot-02-mushaf.png` | Phone screenshot | 1080×1920 (9:16) | Ready |
| `screenshot-03-quiz.png` | Phone screenshot | 1080×1920 (9:16) | Ready |
| `screenshot-05-azkar.png` | Phone screenshot | 1080×1920 (9:16) | Ready |
| `optional-hifz-emptystate.png` | — | 1080×1920 | **Hold** — see below |

Play requires ≥2 phone screenshots; four are supplied. All are exact 9:16, which
keeps the listing eligible for promotional surfaces that reject taller ratios.

## How these were produced

**Icon** — downscaled from `assets/icon.png` (1254×1254) with sharp. Play rejects
alpha channels on the icon; this one is opaque.

> Note: `icons/icon-512.webp` is PNG data with a `.webp` extension. It was not
> used. `icon-512.png` here is the correct file for the console.

**Feature graphic** — built as HTML and rendered headless at 2× (see
`feature-graphic.source.html`, kept so it can be re-rendered or edited):

```bash
node -e "const{chromium}=require('playwright');(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1024,height:500},deviceScaleFactor:2});
await p.goto('file:///ABSOLUTE/PATH/feature-graphic.source.html');await p.waitForTimeout(900);
await p.screenshot({path:'fg-2x.png'});await b.close();})();"
# then downscale fg-2x.png to 1024×500
```

Colours come from the app's own tokens — `--color-forest-deep` (#0d1f14) and
`--color-gold` (#d4b48c) in `src/styles/tokens.css` — plus the icon's peak gold
(#efb460), so the graphic matches the product rather than approximating it.

The design point: the verse (Al-Fatiha 1:2) is lit parchment-bright on the right
where recitation has already passed and falls to dim gold on the left, with a
bloom on the boundary. That gradient *is* recite mode — the app's one
differentiating feature — drawn rather than described. Arabic is shaped by
Chromium's HarfBuzz; PIL cannot do this (no Raqm in this environment), so the
browser render is required.

**Screenshots** — the production web build served locally and captured through
Playwright at 360×640 @3×. This is a Capacitor app, so the webview UI *is* the
app; these are authentic screens, not mockups. Navigation is done by tapping the
bottom nav (deep-linking lands on Home because the static server rewrites unknown
paths to `index.html`).

```bash
npx serve -s build -l 4173        # SPA needs a real server; file:// won't route
# then drive with Playwright, tapping القرآن / اختبارات / أذكار
```

Chromium is launched with `--disable-web-security` because the token broker's
`ALLOWED_ORIGIN` is the native origin and would otherwise CORS-block content on
`localhost`. This affects capture only — nothing about the shipped app.

## Before uploading

- **`optional-hifz-emptystate.png` shows an empty state** ("لم تُضف محفوظات بعد")
  because the capture profile has no memorisation plan. It renders correctly but
  is weak store copy. To use a Hifz screenshot, capture on a device with a real
  plan generated, or add one in the browser profile first and re-shoot.
- Screenshots have **no Android status bar** (browser capture). Play accepts this
  and many listings ship this way. If you want the status bar, re-capture on a
  device: `adb exec-out screencap -p > shot.png`.
- Recite mode and audio playback are **not** shown — both need native APIs that
  do not run in a desktop browser capture. If you want a recite-mode screenshot,
  it has to come from a real device.
