/**
 * QIBLA SERVICE
 * The only module that talks to the plugin's qibla call and to the device
 * orientation sensor.
 *
 * The bearing itself is computed natively, together with the magnetic
 * declination: adhan-java reports relative to true north while the sensor
 * reports relative to magnetic north, and correcting that in one place keeps
 * every consumer honest.
 *
 * The sensor is treated as an enhancement, never a requirement. Phones without
 * a magnetometer never fire the event at all, so silence is turned into an
 * answer after HEADING_TIMEOUT_MS rather than leaving a spinner forever.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface RafeeqQiblaPlugin {
  getQibla(): Promise<{
    hasLocation: boolean;
    bearing?: number;
    magneticBearing?: number;
    declination?: number;
  }>;
}

const RafeeqPrayer = registerPlugin<RafeeqQiblaPlugin>("RafeeqPrayer");

const isNative = Capacitor.isNativePlatform();

/** How long to wait for a first orientation event before giving up on it. */
export const HEADING_TIMEOUT_MS = 3000;

export interface QiblaDirection {
  hasLocation: boolean;
  /** Degrees clockwise from true north. */
  bearing: number | null;
  /** Degrees clockwise from magnetic north — what a needle should match. */
  magneticBearing: number | null;
  declination: number | null;
}

const NO_DIRECTION: QiblaDirection = {
  hasLocation: false,
  bearing: null,
  magneticBearing: null,
  declination: null,
};

export async function loadQibla(): Promise<QiblaDirection> {
  if (!isNative) return NO_DIRECTION;

  const raw = await RafeeqPrayer.getQibla();
  if (
    !raw.hasLocation ||
    raw.bearing === undefined ||
    raw.magneticBearing === undefined
  ) {
    return NO_DIRECTION;
  }

  return {
    hasLocation: true,
    bearing: raw.bearing,
    magneticBearing: raw.magneticBearing,
    declination: raw.declination ?? null,
  };
}

/** A resolved compass heading and whether it was reported against absolute
 * (true/magnetic) north rather than an arbitrary relative reference. */
export interface HeadingReading {
  heading: number;
  absolute: boolean;
}

/**
 * Listen for the device's compass heading.
 *
 * `onUnavailable` fires once if nothing arrives within HEADING_TIMEOUT_MS,
 * which is what a device with no magnetometer looks like from here. Returns a
 * teardown function; callers must call it.
 */
export function watchHeading(
  onHeading: (reading: HeadingReading) => void,
  onUnavailable: () => void,
): () => void {
  let settled = false;
  // Set by the first `deviceorientationabsolute` event. From then on the
  // plain `deviceorientation` events are ignored: on Android both fire, and
  // the plain one measures from wherever the phone pointed when the sensor
  // woke rather than from north. Taking both interleaved drew the needle
  // from two frames at once — it jumped between them — and flipped the
  // `absolute` flag on every other sample, which is what made the
  // calibration hint flash on and off.
  let sawAbsolute = false;

  const timer = window.setTimeout(() => {
    if (!settled) {
      settled = true;
      onUnavailable();
    }
  }, HEADING_TIMEOUT_MS);

  const handle = (event: Event) => {
    if (event.type === "deviceorientationabsolute") sawAbsolute = true;
    else if (sawAbsolute) return;

    const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    // iOS exposes a ready-made compass heading; elsewhere alpha counts
    // anticlockwise from north, so it is subtracted from 360.
    const heading =
      typeof e.webkitCompassHeading === "number"
        ? e.webkitCompassHeading
        : typeof e.alpha === "number"
        ? (360 - e.alpha) % 360
        : null;

    if (heading === null) return;

    // Only an explicit `false` means the reading is relative; a missing flag
    // on a `deviceorientationabsolute` event just means the browser didn't
    // set it, not that the reading is unreliable.
    const absolute = (event as DeviceOrientationEvent).absolute !== false;

    settled = true;
    window.clearTimeout(timer);
    onHeading({ heading, absolute });
  };

  window.addEventListener("deviceorientationabsolute", handle, true);
  // Older Android WebViews only fire the non-absolute event.
  window.addEventListener("deviceorientation", handle, true);

  return () => {
    settled = true;
    window.clearTimeout(timer);
    window.removeEventListener("deviceorientationabsolute", handle, true);
    window.removeEventListener("deviceorientation", handle, true);
  };
}
