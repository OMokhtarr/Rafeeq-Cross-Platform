/**
 * Geometry for the prayer page's day ring.
 *
 * The ring is a 24-hour clock face: noon at the top, midnight at the bottom,
 * time running clockwise — so the morning prayers sit on the left, the
 * evening ones on the right, and the sun's own arc across the sky is the
 * ring's upper half. Angles are degrees clockwise from the top.
 *
 * The ring is a clock, not text, so it is never mirrored for RTL.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Angle of a moment on the ring, from its local time of day. */
export function angleOf(date: Date): number {
  const hours =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return ((hours / 24) * 360 + 180) % 360;
}

/** A point on a circle of radius [r] about ([cx], [cy]) at [angle]. */
export function pointAt(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/**
 * An SVG arc path running clockwise from [from] to [to].
 *
 * Handles the wrap through midnight (a night arc from Maghrib to 02:00 runs
 * past the bottom of the ring), and returns null for an empty sweep rather
 * than a zero-length path some renderers draw as a dot.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
): string | null {
  const sweep = (((to - from) % 360) + 360) % 360;
  if (sweep < 0.5) return null;
  const start = pointAt(cx, cy, r, from);
  const end = pointAt(cx, cy, r, to);
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/**
 * The stretch of the ring to light up: how far through the current half of
 * the day we are.
 *
 * By day that is sunrise to now; by night, Maghrib to now. Either way the
 * lit arc ends at the present moment, so the ring reads as progress rather
 * than decoration. Null when the anchor time is unknown (the midnight-sun
 * window, where adhan returns no sunrise or no Maghrib).
 */
export function progressSpan(
  now: Date,
  sunrise: Date | undefined,
  maghrib: Date | undefined,
): { from: Date; to: Date } | null {
  if (!sunrise || !maghrib) return null;
  const t = now.getTime();
  if (t >= sunrise.getTime() && t < maghrib.getTime()) {
    return { from: sunrise, to: now };
  }
  // Night: anchored on the most recent Maghrib, which is yesterday's once
  // the clock has passed midnight.
  const anchor =
    t >= maghrib.getTime() ? maghrib : new Date(maghrib.getTime() - DAY_MS);
  return { from: anchor, to: now };
}
