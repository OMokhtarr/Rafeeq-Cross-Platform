jest.mock("@capacitor/core", () => {
  const plugin = { getQibla: jest.fn() };
  return {
    registerPlugin: () => plugin,
    Capacitor: { isNativePlatform: () => true },
  };
});

import { registerPlugin } from "@capacitor/core";
import * as service from "../qibla.service";

const plugin = registerPlugin("RafeeqPrayer") as unknown as {
  getQibla: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("loadQibla", () => {
  it("returns the bearings the plugin computed", async () => {
    plugin.getQibla.mockResolvedValue({
      hasLocation: true,
      bearing: 136.14,
      magneticBearing: 131.2,
      declination: 4.94,
    });

    const q = await service.loadQibla();

    expect(q.hasLocation).toBe(true);
    expect(q.bearing).toBeCloseTo(136.14, 2);
    expect(q.magneticBearing).toBeCloseTo(131.2, 2);
  });

  it("reports no location rather than throwing when none is stored", async () => {
    plugin.getQibla.mockResolvedValue({ hasLocation: false });

    const q = await service.loadQibla();

    expect(q.hasLocation).toBe(false);
    expect(q.bearing).toBeNull();
  });
});

describe("watchHeading", () => {
  it("reports each heading the device emits", () => {
    const onHeading = jest.fn();
    const onUnavailable = jest.fn();

    const stop = service.watchHeading(onHeading, onUnavailable);

    const event = new Event("deviceorientationabsolute") as Event & {
      alpha: number;
      absolute: boolean;
    };
    event.alpha = 90;
    event.absolute = true;
    window.dispatchEvent(event);

    expect(onHeading).toHaveBeenCalledWith(
      expect.objectContaining({ absolute: true }),
    );
    expect(onUnavailable).not.toHaveBeenCalled();
    stop();
  });

  it("surfaces absolute: false when the reading is relative, not magnetic", () => {
    const onHeading = jest.fn();
    const stop = service.watchHeading(onHeading, jest.fn());

    const event = new Event("deviceorientation") as Event & {
      alpha: number;
      absolute: boolean;
    };
    event.alpha = 45;
    event.absolute = false;
    window.dispatchEvent(event);

    expect(onHeading).toHaveBeenCalledWith(
      expect.objectContaining({ absolute: false }),
    );
    stop();
  });

  it("declares the sensor unavailable when no event arrives in time", () => {
    jest.useFakeTimers();
    const onHeading = jest.fn();
    const onUnavailable = jest.fn();

    const stop = service.watchHeading(onHeading, onUnavailable);
    jest.advanceTimersByTime(service.HEADING_TIMEOUT_MS + 1);

    // A phone with no magnetometer never fires the event at all, so silence
    // has to be turned into an answer rather than a permanent spinner.
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onHeading).not.toHaveBeenCalled();
    stop();
  });

  it("stops listening once torn down", () => {
    const onHeading = jest.fn();
    const stop = service.watchHeading(onHeading, jest.fn());
    stop();

    const event = new Event("deviceorientationabsolute") as Event & {
      alpha: number;
    };
    event.alpha = 90;
    window.dispatchEvent(event);

    expect(onHeading).not.toHaveBeenCalled();
  });
});
