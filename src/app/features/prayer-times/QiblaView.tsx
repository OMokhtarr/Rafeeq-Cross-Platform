/**
 * QIBLA VIEW
 * Standalone compass reached from More. Renders inside the caller's own
 * IonPage — this component owns only the scrollable content between the
 * header and the fixed BottomNavBar.
 *
 * A missing location is a designed state, not an error: the same shape as
 * the prayers view's permission prompt is reused verbatim, down to the
 * string keys, so the two features read as one system rather than two
 * separately-invented flows.
 *
 * The numeric bearing is shown in every bearing state because it needs no
 * sensor and is always correct; the needle is an enhancement layered on top
 * of it, never the only answer. A device with no magnetometer never fires an
 * orientation event at all, so silence is turned into `qiblaNoSensor` after
 * HEADING_TIMEOUT_MS rather than a spinner that never resolves.
 */

import React, { useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import {
  loadQibla,
  watchHeading,
  type QiblaDirection,
} from "../../core/services/prayer/qibla.service";
import "./QiblaView.css";

interface Props {
  onNeedLocation: () => void;
}

const QiblaView: React.FC<Props> = ({ onNeedLocation }) => {
  const { t, isRTL } = useLang();
  const tp = t.prayerTimes;

  const [direction, setDirection] = useState<QiblaDirection | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorUnavailable, setSensorUnavailable] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadQibla().then((q) => {
      if (!cancelled) setDirection(q);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasBearing = direction?.hasLocation === true;

  // Watching the heading is only meaningful once a bearing exists, and must
  // be re-armed if that becomes true later (after the user grants location
  // and this component is kept mounted by the caller).
  useEffect(() => {
    if (!hasBearing) return undefined;

    setSensorUnavailable(false);
    setNeedsCalibration(false);

    const stop = watchHeading(
      (reading) => {
        setHeading(reading.heading);
        // A non-absolute reading is relative and unreliable for a compass,
        // so the calibration hint tracks it directly off the service.
        setNeedsCalibration(!reading.absolute);
      },
      () => setSensorUnavailable(true),
    );

    return stop;
  }, [hasBearing]);

  if (direction === null) return null;

  if (!direction.hasLocation) {
    return (
      <div className="qv-container" dir={isRTL ? "rtl" : "ltr"}>
        <h1 className="qv-title">{tp.qibla}</h1>
        <div className="qv-permission">
          <h2 className="qv-permission-title">{tp.locationNeeded}</h2>
          <p className="qv-permission-desc">{tp.locationNeededDesc}</p>
          <button
            type="button"
            className="qv-grant-btn"
            onClick={onNeedLocation}
          >
            {tp.grantLocation}
          </button>
        </div>
      </div>
    );
  }

  const bearing = direction.bearing ?? 0;
  const magneticBearing = direction.magneticBearing ?? 0;
  const roundedBearing = Math.round(bearing);
  const bearingLabel = tp.qiblaFromNorth.replace(
    "{deg}",
    String(roundedBearing),
  );
  const showNeedle = !sensorUnavailable && heading !== null;
  const needleRotation = magneticBearing - (heading ?? 0);

  return (
    <div className="qv-container" dir={isRTL ? "rtl" : "ltr"}>
      <h1 className="qv-title">{tp.qibla}</h1>

      <div className="qv-dial">
        <div className="qv-dial-ring">
          <span className="qv-mark qv-mark--n">N</span>
          <span className="qv-mark qv-mark--e">E</span>
          <span className="qv-mark qv-mark--s">S</span>
          <span className="qv-mark qv-mark--w">W</span>
          {showNeedle && (
            <div
              className="qv-needle"
              style={{ transform: `rotate(${needleRotation}deg)` }}
              aria-hidden="true"
            >
              <span className="qv-needle-tip" />
            </div>
          )}
          <span className="qv-dial-center" aria-hidden="true" />
        </div>
      </div>

      <p className="qv-bearing">{bearingLabel}</p>

      {sensorUnavailable && <p className="qv-hint">{tp.qiblaNoSensor}</p>}
      {showNeedle && needsCalibration && (
        <p className="qv-hint">{tp.qiblaCalibrate}</p>
      )}
    </div>
  );
};

export default QiblaView;
