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

/** Which way to turn to face the qibla, or that the user already does. */
export function turnInstruction(
  bearing: number,
  heading: number,
): TurnDirection {
  const delta = signedDelta(bearing, heading);
  if (Math.abs(delta) < FACING_TOLERANCE_DEG) return "facing";
  return delta > 0 ? "right" : "left";
}

/**
 * Where to place the Kaaba marker on the ring, in degrees clockwise from the
 * top. The ring is fixed to the device, so the marker carries the whole
 * bearing-minus-heading offset and converges with the needle as the user turns.
 */
export function markerRotation(bearing: number, heading: number): number {
  return normalise(bearing - heading);
}
