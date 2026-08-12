# WebView / OS-Version Compatibility Audit

**Date:** 12 August 2026
**Scope:** CSS and font features audited against the app's real device floor.

## Device floor

| Platform | Floor | Engine behaviour |
|---|---|---|
| Android | `minSdk 26` (Android 8) | WebView updates via Play **independently of the OS**. A device that never updates can run a very old Chromium. This — not the Android version — is the real variable. |
| iOS | not yet added | WKWebView is **locked to the OS version**, so the deployment target permanently defines the CSS/JS floor. No `ios/` folder exists yet, so nothing is verifiable. |

## Findings

### Fixed

**`color-mix()` in wrong-answer state indicators** — requires WebView 111+.
In four rules the wrong/error state used `color-mix()` for **both** background and border. CSS drops individual invalid declarations, so on an older engine both vanished and a wrong answer rendered identically to an untouched option — the user could not see the result. Fixed with a preceding `rgba()` declaration (no `@supports` needed; the cascade handles it):

- `AkmelAlNehayat.css` — `.an-option.wrong`, `.an-result.wrong`
- `AkmelAlAyah.css` — `.aa-result.wrong`
- `MutashabihatTest.css` — `.mst-result.wrong`

Two more rules had the same shape: `.mst-inline-chip.sibling` and `.mst-verse-chip.sibling`, where a lone `border-color: color-mix(...)` was the **only** thing marking the sibling state. Both given a solid `var(--color-azkar)` fallback.

The whole `src/**/*.css` tree was then swept programmatically for the general bug class — any rule whose *every* visual declaration (`background`, `border`, `border-color`, `box-shadow`, `outline`, `color`) is a `color-mix()`. After the fixes above, the only remaining hits are `:hover`, `:active`, and one keyframe step, which degrade to "no hover effect" — cosmetic, not information loss.

**Hardcoded Arabic font stacks** — 18 rules across `PageViewer.css`, `MushafContextViewer.css`, `MushafPage.css` hardcoded `"Traditional Arabic", …`. `"Traditional Arabic"` is a **Windows** font, absent on both Android and iOS, so it never applied on mobile. All 18 now use `var(--font-arabic-display)` (Amiri-first). Two different outcomes:

- **12 rules** listed Amiri after Traditional Arabic, so they already resolved to Amiri on mobile — **rendering unchanged**.
- **6 rules** were `"Traditional Arabic", serif` with no Amiri, so on Android they fell through to the **system serif** — a genuine per-platform difference. These now render Amiri. This is a **visible change**, and the intended consistency fix.

### Accepted — degrades gracefully, no change made

**`color-mix()` decorative tints (~45 uses)** — Hifz, Azkar, Account, Settings, Playback, Bookmarks.

*Why they're safe.* CSS error handling works at the **declaration** level, not the rule level. When a parser meets a value it doesn't understand, it discards that one declaration and keeps the rest of the rule. So on a pre-111 engine:

```css
.hifz-juz-chip:hover {
  background: color-mix(in srgb, var(--color-quran) 10%, transparent);  /* dropped */
  border-color: var(--color-quran);                                     /* applies */
}
```

The element falls back to whatever it already inherited — its card background — and every other property still applies. These particular uses are 6–18% washes over that same card background, so the *designed* difference is already near-invisible; losing it costs a subtle tint, not information.

That's exactly why the four wrong-answer rules **were** a bug and these are not: there, `color-mix()` was the only differentiator, so dropping it left nothing. The programmatic sweep above is what distinguishes the two cases, and it's worth re-running if you add state styling.

**`font-palette` / COLRv1 tajweed colouring** — the QPC V4 fonts carry tajweed colours as OpenType palettes; `font.loader.ts` injects `@font-palette-values` rules to select them. Three tiers of degradation:

| Engine | Behaviour |
|---|---|
| WebView 101+ | Full support — palettes apply, tajweed colours as designed |
| WebView 98–100 | COLRv1 renders, but `@font-palette-values` is ignored → glyphs use the font's **default** palette; colours appear but ignore the day/night/mono choice |
| Below 98 | No COLRv1 → engine falls back to the font's monochrome glyph table |

`font.loader.ts` already reasons about this: `setMonoPaletteColor` deliberately writes a **literal** colour rather than `currentColor`, because `currentColor` inside `override-colors` landed later than the rest.

> **Verified 12 Aug 2026.** The bottom row depends on the V4 woff2 files actually *containing* monochrome outlines alongside their colour data. Confirmed by fetching `p1.woff2` from the V4 CDN and parsing its WOFF2 table directory — 19 tables:
>
> ```
> COLR, CPAL, GDEF, GPOS, OS/2, cmap, cvt , fpgm, gasp, glyf,
> head, hhea, hmtx, loca, maxp, name, post, prep, prop
> ```
>
> `glyf` + `loca` are present next to `COLR`/`CPAL`, so a pre-98 engine has real outlines to fall back on: **Quran text stays readable, just uncoloured.** Had the files shipped COLR-only, pre-98 engines would have rendered blank glyphs and the `minWebViewVersion` floor would have needed raising to 98. It does not.

**`max()` in safe-area tokens** — WebView 79+. Below the app's practical floor; no action.

**Browserslist floor pinned to `chrome >= 79`** — replaces `>0.2%, not dead`.

The old query was worse than imprecise. `npx browserslist` resolved it to `and_chr 151` — a **single** entry, because browserslist's `and_chr`/`android` keywords only ever track the *current* Android Chrome release. There is no "Android 8 WebView" entry to select, since WebView version is decoupled from OS version. So the market-share query gave **zero** old-WebView coverage while looking like it gave some.

Why 79 specifically:

| Constraint | Version | Note |
|---|---|---|
| Capacitor 8 hard floor | WebView 55 | `Bridge.MINIMUM_ANDROID_WEBVIEW_VERSION` |
| Capacitor 8 default | WebView 60 | `Bridge.DEFAULT_ANDROID_WEBVIEW_VERSION`; below this it shows a blocking dialog |
| **`max()` in `--safe-inset-*`** | **Chrome 79** | **binding constraint** — below it safe-area layout breaks *structurally*, not cosmetically |

`android.minWebViewVersion: 79` was set in `capacitor.config.ts` to match, so the two floors cannot silently diverge.

> **This floor governs JavaScript syntax transpilation, not CSS.** A JS parse error is a white screen; CSS degrades per-declaration. Newer CSS (`color-mix`, `font-palette`) is handled by the fallbacks above and must **not** be used as a reason to raise this number.

**Dead platform module deleted** — `src/app/core/utils/platform.util.ts` was removed entirely. It had **zero importers**: every consumer (`hifz.service.ts`, `audio-file-cache.service.ts`, `PlaybackContext.tsx`, `backup.service.ts`, …) calls `Capacitor.getPlatform()` / `isNativePlatform()` directly. Beyond the stale Electron branches, its `getArabicFont()` returned per-platform Arabic stacks that nothing ever consumed — the CSS token system had already superseded it. `npx tsc --noEmit` reports no errors in `src/` after removal.

### Not addressed

**iOS parity** — blocked until `npx cap add ios` is run on a Mac. Note `capacitor.config.ts` uses `iosScheme: "ionic"` vs `androidScheme: "https"`, meaning iOS gets a **different storage origin** than Android; localStorage/IndexedDB behaviour will need checking once the platform exists.

## What already guarantees consistency

- `setupIonicReact({ mode: "md" })` — forces Material rendering on every platform, removing Ionic's per-platform component styling. The single biggest lever, already pulled.
- `--safe-inset-*` tokens — collapse three inset sources (SystemBars plugin on Android 15+, `env()` on iOS/web, `MainActivity` injection on Android ≤14) into one name via `max()`.
- QPC V4 per-page fonts fetched from the Quran Foundation CDN and cached in IndexedDB — identical bytes on every device, so Quran text was never platform-dependent.
- Text zoom capped at 130%; scrollbars hidden globally; one `--max-width-mobile` token.
