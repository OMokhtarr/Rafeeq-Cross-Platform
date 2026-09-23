/**
 * QIBLA GEOMETRY
 * Pure angle arithmetic for the compass. No React, no sensor, no plugin —
 * which is what makes the 0/360 wrap testable rather than something you only
 * discover standing in a car park facing north.
 */

/**
 * How close to the qibla counts as facing it, in degrees either side.
 *
 * This is a hysteresis band, not a precision claim: a magnetometer jitters by
 * a couple of degrees at rest, and without a band the label would flicker
 * between "left" and "right" while the phone sits still on a table.
 */
export const FACING_TOLERANCE_DEG = 5;

export type TurnDirection = "left" | "right" | "facing";

/** Normalise any angle into [0, 360). */
function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Degrees from the heading to the bearing, taking the shorter way round:
 * (-180, 180], positive clockwise.
 */
export function signedDelta(bearing: number, heading: number): number {
  const raw = normalise(bearing - heading);
  return raw > 180 ? raw - 360 : raw;
}

/**
 * How far off the qibla the user must drift before "facing" is released.
 *
 * Wider than [FACING_TOLERANCE_DEG] on purpose. With a single threshold a
 * reading hovering around it flips the state on every sample, so "facing"
 * flashed up for a frame and vanished — effectively never showing at all.
 * Entering needs 5°, leaving needs 10°.
 */
export const FACING_RELEASE_DEG = 10;

/**
 * Which way to turn to face the qibla, or that the user already does.
 *
 * [previous] is the last answer; when it was "facing", the wider release
 * band applies. Omit it for a stateless answer.
 */
export function turnInstruction(
  bearing: number,
  heading: number,
  previous?: TurnDirection | null,
): TurnDirection {
  const delta = signedDelta(bearing, heading);
  const band = previous === "facing" ? FACING_RELEASE_DEG : FACING_TOLERANCE_DEG;
  if (Math.abs(delta) < band) return "facing";
  return delta > 0 ? "right" : "left";
}

/**
 * Moves [previous] a fraction [factor] of the way towards [next], taking the
 * short way round the circle.
 *
 * A magnetometer is noisy sample to sample; drawing every raw reading made
 * the needle shake. This low-pass filter trades a little lag for a steady
 * needle. Plain averaging would fail at the wrap: 359° and 1° average to
 * 180°, the exact opposite direction, so the step is taken along
 * [signedDelta] instead.
 */
export function smoothHeading(
  previous: number | null,
  next: number,
  factor = 0.2,
): number {
  if (previous === null) return normalise(next);
  return normalise(previous + signedDelta(next, previous) * factor);
}

/**
 * Where to place the Kaaba marker on the ring, in degrees clockwise from the
 * top. The ring is fixed to the device, so the marker carries the whole
 * bearing-minus-heading offset and converges with the needle as the user turns.
 */
export function markerRotation(bearing: number, heading: number): number {
  return normalise(bearing - heading);
}

/**
 * [target] expressed as the angle nearest to [previous], without wrapping.
 *
 * The needle and marker turn through a CSS transition. Handed wrapped angles,
 * a step from 359° to 1° animates the long way — a full turn backwards —
 * every time the heading crosses north. Returning 361° instead lets the
 * transition take the 2° it actually is.
 */
export function continuousAngle(previous: number | null, target: number): number {
  if (previous === null) return target;
  return previous + signedDelta(target, previous);
}
