/**
 * Measure the WebView's text-zoom factor.
 *
 * Android applies the OS font-size setting to the whole WebView as
 * `textZoom` (MainActivity.applyCappedTextZoom, capped at 130%). It is a
 * WebView-wide multiplier applied to rendered glyphs *after* CSS layout is
 * computed, and there is no per-element opt-out and no API to read it back
 * from JS. So we measure it: an off-screen probe is given a known CSS font
 * size, and the ratio between the height the browser reports and the size we
 * asked for is the zoom factor. iOS/web text-size-adjust inflation is
 * observable the same way, so one probe covers every platform.
 *
 * The mushaf needs this because the printed Madani page is a fixed 15-line
 * grid whose lines must not wrap or overflow: its glyph size is dictated by
 * the page geometry, not by user preference. Dividing the fitted size by this
 * factor cancels the zoom, holding Quran text at its designed size while the
 * rest of the app still honours the OS setting.
 */

/** CSS font-size of the probe. Large enough that rounding noise is negligible. */
const PROBE_PX = 100;

export function measureTextZoom(): number {
  if (typeof document === "undefined") return 1;

  const probe = document.createElement("div");
  // `absolute` + `visibility:hidden` keeps the probe out of layout and paint
  // while still being measurable — `display:none` would report zero.
  probe.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "pointer-events:none",
    "top:0",
    "left:-9999px",
    "width:auto",
    "height:auto",
    "white-space:nowrap",
    "line-height:1",
    "padding:0",
    "margin:0",
    "border:0",
    `font-size:${PROBE_PX}px`,
  ].join(";");
  // A glyph with no descender/ascender surprises; content is required for the
  // element to have a measurable text box.
  probe.textContent = "X";

  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);

  if (!measured || !Number.isFinite(measured)) return 1;

  const ratio = measured / PROBE_PX;
  // Guard against absurd readings (font not ready, zero-height box). Zoom is
  // only ever an inflation, so anything below 1 means the probe misfired.
  if (ratio < 1 || ratio > 4) return 1;
  return ratio;
}
