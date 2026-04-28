/**
 * QPC V1 page-font loader.
 *
 * The Madani Mushaf is rendered with one font per page (p001…p604). Each
 * font ships only the glyphs that appear on its own page, so the page n
 * text MUST be drawn with the page n font — no other font will display
 * the right glyphs.
 *
 * Strategy:
 *   1. If the page's .ttf is already in IDB, read it and inject @font-face.
 *   2. Otherwise fetch from jsDelivr, store in IDB, then inject.
 *   3. Track which page fonts are already injected on the document so we
 *      don't re-add the same @font-face rule.
 *
 * The bismillah uses its own glyph set (QCF_BSML). It's loaded once on
 * first call and reused.
 */

import { idb } from "../storage/idb.service";

const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/quran/quran.com-images@master/res/fonts";

const injected = new Set<number>();
let bismillahInjected = false;
const inflight = new Map<number, Promise<void>>();

export function fontFamilyForPage(page: number): string {
  return `QPC_P${pad3(page)}`;
}

export const BISMILLAH_FONT_FAMILY = "QPC_BSML";

/**
 * Ensure the QPC V1 font for a given Madani page is loaded into the
 * document. Resolves once the @font-face is registered AND the FontFaceSet
 * reports the font is ready to render.
 */
export async function ensurePageFont(page: number): Promise<void> {
  if (injected.has(page)) return;
  const pending = inflight.get(page);
  if (pending) return pending;

  const work = (async () => {
    const blob = await loadOrFetchFont(page);
    await injectFontFace(fontFamilyForPage(page), blob);
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
  const url = `${CDN_BASE}/QCF_BSML.TTF`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bismillah font: HTTP ${res.status}`);
  const blob = await res.blob();
  await injectFontFace(BISMILLAH_FONT_FAMILY, blob);
  bismillahInjected = true;
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function loadOrFetchFont(page: number): Promise<Blob> {
  const cached = await idb.get<{ page: number; blob: Blob }>("fonts", page);
  if (cached?.blob) return cached.blob;

  const url = `${CDN_BASE}/QCF_P${pad3(page)}.TTF`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`page ${page} font: HTTP ${res.status}`);
  const blob = await res.blob();

  // Best-effort cache. Don't fail the render if IDB write fails (private
  // mode / quota).
  idb.put("fonts", { page, blob }).catch(() => {});
  return blob;
}

async function injectFontFace(family: string, blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  const face = new FontFace(family, buf);
  await face.load();
  document.fonts.add(face);
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
