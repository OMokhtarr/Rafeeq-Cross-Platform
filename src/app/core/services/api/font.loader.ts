/**
 * QPC V4 Tajweed page-font loader.
 *
 * The Madani Mushaf is rendered with one font per page (p1…p604). Each
 * font ships only the glyphs that appear on its own page, so the page n
 * text MUST be drawn with the page n font — no other font will display
 * the right glyphs.
 *
 * V4 fonts are COLRv1 color fonts that carry tajweed coloring via OpenType
 * palettes. They are served as woff2 from `verses.quran.foundation`, which
 * is the official Quran Foundation CDN.
 *
 * The bismillah strip on non-Fatihah surah starts has no V4-equivalent
 * font — V4 only ships per-page fonts. We continue to use the legacy V1
 * `QCF_BSML.TTF` from jsDelivr for that strip; it renders monochrome but
 * matches the visual fidelity of the printed Mushaf bismillah row.
 *
 * Strategy:
 *   1. If the page's woff2 is already in IDB, read it and inject @font-face.
 *   2. Otherwise fetch from the V4 CDN, store in IDB, then inject.
 *   3. Track which page fonts are already injected on the document so we
 *      don't re-add the same @font-face rule.
 *
 * IDB records carry a `cacheVersion` field — bumping `FONT_CACHE_VERSION`
 * silently evicts blobs from older formats without a DB schema change.
 */

import { idb } from "../storage/idb.service";

const V4_CDN_BASE =
  "https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2";
const BISMILLAH_CDN_URL =
  "https://cdn.jsdelivr.net/gh/quran/quran.com-images@master/res/fonts/QCF_BSML.TTF";

const FONT_CACHE_VERSION = "v4-colrv1";

const injected = new Set<number>();
let bismillahInjected = false;
const inflight = new Map<number, Promise<void>>();

export function fontFamilyForPage(page: number): string {
  return `QPC_V4_P${pad3(page)}`;
}

/**
 * Named palettes for a given page, suitable for the CSS `font-palette`
 * property. V4 fonts ship two built-in palettes (0 = light, 1 = dark);
 * we additionally synthesize a "mono" palette per page that overrides
 * every color slot to `currentColor` so the glyphs render in the active
 * text color when the user disables tajweed coloring in Settings.
 */
export function paletteNameForPage(
  page: number,
  variant: "day" | "night" | "mono",
): string {
  const suffix =
    variant === "night" ? "dark" : variant === "mono" ? "mono" : "light";
  return `--tw-P${pad3(page)}-${suffix}`;
}

export const BISMILLAH_FONT_FAMILY = "QPC_BSML";

interface CachedFont {
  page: number;
  blob: Blob;
  cacheVersion?: string;
}

/**
 * Ensure the QPC V4 font for a given Madani page is loaded into the
 * document. Resolves once the @font-face is registered AND the FontFaceSet
 * reports the font is ready to render.
 */
export async function ensurePageFont(page: number): Promise<void> {
  if (injected.has(page)) return;
  const pending = inflight.get(page);
  if (pending) return pending;

  const work = (async () => {
    const blob = await loadOrFetchFont(page);
    const family = fontFamilyForPage(page);
    await injectFontFace(family, blob);
    injectPalettesForPage(page, family);
    injected.add(page);
  })();

  inflight.set(page, work);
  try {
    await work;
  } finally {
    inflight.delete(page);
  }
}

export async function ensureBismillahFont(): Promise<void> {
  if (bismillahInjected) return;
  const res = await fetch(BISMILLAH_CDN_URL);
  if (!res.ok) throw new Error(`bismillah font: HTTP ${res.status}`);
  const blob = await res.blob();
  await injectFontFace(BISMILLAH_FONT_FAMILY, blob);
  bismillahInjected = true;
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function loadOrFetchFont(page: number): Promise<Blob> {
  const cached = await idb.get<CachedFont>("fonts", page);
  if (cached?.blob && cached.cacheVersion === FONT_CACHE_VERSION) {
    return cached.blob;
  }

  const url = `${V4_CDN_BASE}/p${page}.woff2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`page ${page} font: HTTP ${res.status}`);
  const blob = await res.blob();

  // Best-effort cache. Don't fail the render if IDB write fails (private
  // mode / quota).
  idb
    .put("fonts", { page, blob, cacheVersion: FONT_CACHE_VERSION })
    .catch(() => {});
  return blob;
}

async function injectFontFace(family: string, blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  const face = new FontFace(family, buf);
  await face.load();
  document.fonts.add(face);
}

const palettedPages = new Set<number>();
const PALETTE_STYLE_ID = "qpc-v4-palettes";
const MONO_STYLE_ID = "qpc-v4-mono-palettes";
let currentMonoColor = "#000";

/**
 * Append two `@font-palette-values` rules for the given page family:
 *   - light  (base-palette 0)         — the V4 font's default colored palette
 *   - dark   (base-palette 1)         — the V4 font's dark-theme colored palette
 *
 * The mono palette is generated separately by `setMonoPaletteColor` so it
 * can be rebuilt without touching the colored palettes when the theme flips.
 *
 * The rules are scoped to the page's own family because `@font-palette-values`
 * binds to a single `font-family`. A shared <style> element holds them all.
 */
function injectPalettesForPage(page: number, family: string): void {
  if (palettedPages.has(page)) return;
  const styleEl = ensurePaletteStyleEl(PALETTE_STYLE_ID);
  const lightName = paletteNameForPage(page, "day");
  const darkName = paletteNameForPage(page, "night");
  styleEl.appendChild(
    document.createTextNode(
      `@font-palette-values ${lightName} { font-family: "${family}"; base-palette: 0; }\n` +
        `@font-palette-values ${darkName} { font-family: "${family}"; base-palette: 1; }\n`,
    ),
  );
  palettedPages.add(page);
  appendMonoRule(page, family, currentMonoColor);
}

/**
 * Set the literal color used by the mono palette and rebuild every
 * already-injected page's mono rule. Called when the theme changes (or
 * when the renderer first decides which color it wants).
 *
 * Using a literal color rather than `currentColor` inside `override-colors`
 * is intentional — `currentColor` support inside palette overrides is too
 * recent across our browser matrix to rely on; a literal color works
 * everywhere COLRv1 + `override-colors` is supported.
 */
export function setMonoPaletteColor(color: string): void {
  if (color === currentMonoColor) return;
  currentMonoColor = color;
  const styleEl = ensurePaletteStyleEl(MONO_STYLE_ID);
  // Wholesale rebuild — cheap, even with 604 pages cached, and guarantees
  // we don't accumulate stale rules for the same palette name.
  styleEl.textContent = "";
  for (const page of palettedPages) {
    appendMonoRule(page, fontFamilyForPage(page), color);
  }
}

/**
 * The mono palette covers slots 0–9; V4 fonts use ~8 tajweed colors and any
 * extra overrides for non-existent slots are silently ignored.
 */
function appendMonoRule(page: number, family: string, color: string): void {
  const styleEl = ensurePaletteStyleEl(MONO_STYLE_ID);
  const monoName = paletteNameForPage(page, "mono");
  const overrides = Array.from({ length: 10 }, (_, i) => `${i} ${color}`).join(
    ", ",
  );
  styleEl.appendChild(
    document.createTextNode(
      `@font-palette-values ${monoName} { font-family: "${family}"; override-colors: ${overrides}; }\n`,
    ),
  );
}

function ensurePaletteStyleEl(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

// ─── Preload all 604 page fonts in the background ────────────────────────────
let fontPreloadPromise: Promise<void> | null = null;

export function preloadAllPageFonts(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (fontPreloadPromise) return fontPreloadPromise;

  fontPreloadPromise = (async () => {
    let done = 0;
    const total = 604;
    // Bismillah font first (used on many pages)
    try {
      await ensureBismillahFont();
    } catch {}

    for (let p = 1; p <= total; p++) {
      try {
        await ensurePageFont(p);
      } catch {
        // skip individual failures
      }
      done++;
      onProgress?.(done, total);
      // yield to the browser every 10 pages
      if (done % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  })();
  return fontPreloadPromise;
}
