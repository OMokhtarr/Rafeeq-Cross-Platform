/**
 * QIBLA HEADER
 * The top of the prayer page: place name, location button, compass ring, and
 * the date. Renders inside the page's own container — it owns no page chrome.
 *
 * The ring is fixed to the device; the needle and the Kaaba marker rotate
 * inside it, converging as the user turns. That convergence is what makes the
 * dial readable at a glance rather than two numbers to compare.
 *
 * Everything heading-dependent (needle, marker, turn label) disappears when no
 * magnetometer is present, but the ring does not: the page's shape should not
 * change with the hardware, and the numeric bearing is a complete answer on
 * its own.
 */

import React, { useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import {
  loadQibla,
  watchHeading,
  type QiblaDirection,
} from "../../core/services/prayer/qibla.service";
import {
  markerRotation,
  turnInstruction,
} from "../../core/services/prayer/qibla.geometry";
import "./QiblaHeader.css";

interface QiblaHeaderProps {
  placeName: string | null;
  onUpdateLocation: () => void;
  locating: boolean;
}

const QiblaHeader: React.FC<QiblaHeaderProps> = ({
  placeName,
  onUpdateLocation,
  locating,
}) => {
  const { t, lang } = useLang();
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

  useEffect(() => {
    if (!hasBearing) return undefined;

    setSensorUnavailable(false);
    setNeedsCalibration(false);

    const stop = watchHeading(
      (reading) => {
        setHeading(reading.heading);
        setNeedsCalibration(!reading.absolute);
      },
      () => setSensorUnavailable(true),
    );

    return stop;
  }, [hasBearing]);

  const hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const gregorianDate = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-EG" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date());

  const bearing = direction?.bearing ?? 0;
  const magneticBearing = direction?.magneticBearing ?? 0;
  const showNeedle = hasBearing && !sensorUnavailable && heading !== null;

  const needleRotation = magneticBearing - (heading ?? 0);
  const marker = markerRotation(magneticBearing, heading ?? 0);
  const turn = showNeedle ? turnInstruction(magneticBearing, heading ?? 0) : null;
  const turnLabel =
    turn === "facing"
      ? tp.facingQibla
      : turn === "left"
      ? tp.turnLeft
      : turn === "right"
      ? tp.turnRight
      : null;

  return (
    <header className="qh-header">
      <div className="qh-place-row">
        <h1 className="qh-place">{placeName ?? tp.title}</h1>
        <button
          type="button"
          className="qh-location-btn"
          onClick={onUpdateLocation}
          disabled={locating}
          aria-label={tp.updateLocation}
        >
          {locating ? (
            <span className="qh-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="qh-dial">
        <div className="qh-dial-ring">
          {hasBearing && (
            <div
              className="qh-marker"
              style={{ transform: `rotate(${marker}deg)` }}
              aria-hidden="true"
            >
              <span className="qh-marker-dot" />
            </div>
          )}
          {showNeedle && (
            <div
              className="qh-needle"
              style={{ transform: `rotate(${needleRotation}deg)` }}
              aria-hidden="true"
            >
              <span className="qh-needle-tip" />
            </div>
          )}
          <span className="qh-dial-center" aria-hidden="true" />
          {!showNeedle && hasBearing && (
            <span className="qh-dial-bearing">
              {tp.qiblaFromNorth.replace("{deg}", String(Math.round(bearing)))}
            </span>
          )}
        </div>
      </div>

      {turnLabel && (
        <p
          className={
            "qh-turn" + (turn === "facing" ? " qh-turn--facing" : "")
          }
          aria-live="polite"
        >
          {turnLabel}
        </p>
      )}

      {sensorUnavailable && <p className="qh-hint">{tp.qiblaNoSensor}</p>}
      {showNeedle && needsCalibration && (
        <p className="qh-hint">{tp.qiblaCalibrate}</p>
      )}

      <div className="qh-dates">
        <p className="qh-date-greg">{gregorianDate}</p>
        <p className="qh-date-hijri">{hijriDate}</p>
      </div>
    </header>
  );
};

export default QiblaHeader;
