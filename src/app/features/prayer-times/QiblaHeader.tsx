/**
 * QIBLA HEADER
 * The top of the prayer page: place name and location button, then the next
 * prayer beside the day ring, with the qibla compass inside the ring.
 *
 * The ring is a 24-hour clock face (see dayDial.ts): each prayer is a dot on
 * it and sunrise and sunset are sun glyphs, the next one is marked, and a lit arc runs up to the present
 * moment. Inside it the compass works as before — the dial is fixed to the
 * device, and the needle and the Kaaba marker rotate, converging as the user
 * turns.
 *
 * Everything heading-dependent (needle, marker, turn label) disappears when no
 * magnetometer is present, but the ring does not: the page's shape should not
 * change with the hardware, and the numeric bearing is a complete answer on
 * its own.
 *
 * The dates are not here: they label the timetable, so they head its card.
 */

import React, { useEffect, useRef, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import {
  headingNeedsPermission,
  loadQibla,
  requestHeadingPermission,
  watchHeading,
  type QiblaDirection,
} from "../../core/services/prayer/qibla.service";
import {
  continuousAngle,
  markerRotation,
  smoothHeading,
  turnInstruction,
  type TurnDirection,
} from "../../core/services/prayer/qibla.geometry";
import { angleOf, arcPath, pointAt, progressSpan } from "./dayDial";
import "./QiblaHeader.css";

/**
 * A mark on the ring. The ring marks every time the timetable shows.
 * Sunrise and Maghrib — the day's two horizon moments — are drawn as sun
 * glyphs so they read at a glance; the rest are dots.
 */
export interface DialTime {
  key: string;
  at: Date;
}

interface QiblaHeaderProps {
  placeName: string | null;
  onUpdateLocation: () => void;
  locating: boolean;
  /** The next prayer, already localized, or null inside the midnight-sun window. */
  next: { key: string; label: string; time: string; countdown: string } | null;
  /** The ring's marks: the user's visible times, in order. */
  times: DialTime[];
  sunrise?: Date;
  maghrib?: Date;
  now: number;
}

/**
 * How long the reading must stay uncalibrated before the figure-8 hint
 * appears, and stay calibrated before it goes. A single stray sample then
 * cannot make it blink, which it did on every other reading before.
 */
const CALIBRATION_SETTLE_MS = 2000;

// SVG geometry, in viewBox units.
const C = 100;
const RING_R = 90;
const COMPASS_R = 62;

/**
 * Sunrise or sunset on the ring: a half sun on the horizon with a small
 * arrow — up for rising, down for setting — on a disc that masks the track.
 */
const HorizonMark: React.FC<{
  x: number;
  y: number;
  rising: boolean;
  isNext: boolean;
}> = ({ x, y, rising, isNext }) => (
  <g
    className={"qh-horizon" + (isNext ? " qh-horizon--next" : "")}
    transform={`translate(${x} ${y})`}
  >
    <circle className="qh-horizon-disc" r={9} />
    <path className="qh-horizon-sun" d="M -4 2 A 4 4 0 0 1 4 2 Z" />
    <line className="qh-horizon-line" x1={-6} y1={2} x2={6} y2={2} />
    <path
      className="qh-horizon-arrow"
      d={rising ? "M -2 -5 L 0 -7 L 2 -5" : "M -2 -7 L 0 -5 L 2 -7"}
    />
  </g>
);

const QiblaHeader: React.FC<QiblaHeaderProps> = ({
  placeName,
  onUpdateLocation,
  locating,
  next,
  times,
  sunrise,
  maghrib,
  now,
}) => {
  const { t } = useLang();
  const tp = t.prayerTimes;

  const [direction, setDirection] = useState<QiblaDirection | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorUnavailable, setSensorUnavailable] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  // iOS only: the compass stays off until the user taps to allow it.
  const [headingAllowed, setHeadingAllowed] = useState(() => !headingNeedsPermission());

  const enableCompass = async () => {
    if (await requestHeadingPermission()) setHeadingAllowed(true);
    else setSensorUnavailable(true);
  };

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

  // Filter state lives in refs: it changes on every sensor sample, and none
  // of it should re-render on its own — only the smoothed heading does.
  const smoothedRef = useRef<number | null>(null);
  const calibrationSinceRef = useRef<{ absolute: boolean; since: number } | null>(null);

  useEffect(() => {
    if (!hasBearing || !headingAllowed) return undefined;

    setSensorUnavailable(false);
    setNeedsCalibration(false);
    smoothedRef.current = null;
    calibrationSinceRef.current = null;

    const stop = watchHeading(
      (reading) => {
        smoothedRef.current = smoothHeading(smoothedRef.current, reading.heading);
        setHeading(smoothedRef.current);

        // The hint follows the reading's state only once that state has
        // held for CALIBRATION_SETTLE_MS.
        const t = Date.now();
        const last = calibrationSinceRef.current;
        if (!last || last.absolute !== reading.absolute) {
          calibrationSinceRef.current = { absolute: reading.absolute, since: t };
        } else if (t - last.since >= CALIBRATION_SETTLE_MS) {
          setNeedsCalibration(!reading.absolute);
        }
      },
      () => setSensorUnavailable(true),
    );

    return stop;
  }, [hasBearing, headingAllowed]);

  const bearing = direction?.bearing ?? 0;
  const magneticBearing = direction?.magneticBearing ?? 0;
  const showNeedle = hasBearing && !sensorUnavailable && heading !== null;

  // Kept continuous across north, so the CSS transition never spins the
  // long way round (see continuousAngle).
  const needleRef = useRef<number | null>(null);
  const markerRef = useRef<number | null>(null);
  const needleRotation = continuousAngle(
    needleRef.current,
    magneticBearing - (heading ?? 0),
  );
  const marker = continuousAngle(
    markerRef.current,
    markerRotation(magneticBearing, heading ?? 0),
  );
  needleRef.current = needleRotation;
  markerRef.current = marker;
  // The previous answer feeds back in, so "facing" holds until the user has
  // clearly turned away rather than flickering at the edge of the band.
  const turnRef = useRef<TurnDirection | null>(null);
  const turn = showNeedle
    ? turnInstruction(magneticBearing, heading ?? 0, turnRef.current)
    : null;
  turnRef.current = turn;
  const facing = turn === "facing";
  const turnLabel =
    turn === "facing"
      ? tp.facingQibla
      : turn === "left"
      ? tp.turnLeft
      : turn === "right"
      ? tp.turnRight
      : null;

  const nowDate = new Date(now);
  const span = progressSpan(nowDate, sunrise, maghrib);
  const progress = span
    ? arcPath(C, C, RING_R, angleOf(span.from), angleOf(span.to))
    : null;
  const nowPoint = pointAt(C, C, RING_R, angleOf(nowDate));

  // Rotations are applied through CSS so they can transition; the origin is
  // the ring's centre in viewBox units.
  const rotate = (deg: number): React.CSSProperties => ({
    transform: `rotate(${deg}deg)`,
  });

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

      <div className="qh-main">
        <div className="qh-next" aria-live="polite">
          {next ? (
            <>
              <span className="qh-next-label">{tp.nextPrayer}</span>
              <span className="qh-next-name">{next.label}</span>
              <span className="qh-next-time">{next.time}</span>
              <span className="qh-next-countdown">{next.countdown}</span>
            </>
          ) : (
            <span className="qh-next-name">{tp.title}</span>
          )}
        </div>

        <div className="qh-dial">
          <svg
            viewBox="0 0 200 200"
            className={"qh-dial-svg" + (facing ? " qh-dial-svg--facing" : "")}
            role="img"
            aria-label={
              hasBearing
                ? tp.qiblaFromNorth.replace("{deg}", String(Math.round(bearing)))
                : tp.qibla
            }
          >
            {/* The day */}
            <circle className="qh-ring-track" cx={C} cy={C} r={RING_R} />
            {progress && <path className="qh-ring-progress" d={progress} />}
            {times.map(({ key, at }) => {
              const p = pointAt(C, C, RING_R, angleOf(at));
              const isNext = key === next?.key;
              if (key === "sunrise" || key === "maghrib") {
                return (
                  <HorizonMark
                    key={key}
                    x={p.x}
                    y={p.y}
                    rising={key === "sunrise"}
                    isNext={isNext}
                  />
                );
              }
              return (
                <circle
                  key={key}
                  className={"qh-ring-dot" + (isNext ? " qh-ring-dot--next" : "")}
                  cx={p.x}
                  cy={p.y}
                  r={isNext ? 6 : 3.5}
                />
              );
            })}
            <circle className="qh-ring-now" cx={nowPoint.x} cy={nowPoint.y} r={5} />

            {/* The compass */}
            <circle className="qh-compass" cx={C} cy={C} r={COMPASS_R} />
            {[0, 90, 180, 270].map((a) => {
              const outer = pointAt(C, C, COMPASS_R - 4, a);
              const inner = pointAt(C, C, COMPASS_R - 11, a);
              return (
                <line
                  key={a}
                  className="qh-compass-tick"
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                />
              );
            })}

            {hasBearing && (
              <g className="qh-rotor" style={rotate(marker)}>
                {/* A small Kaaba rather than a dot: the thing being pointed
                    at, drawn as itself. */}
                <rect
                  className="qh-kaaba"
                  x={C - 7}
                  y={C - COMPASS_R - 7}
                  width={14}
                  height={14}
                  rx={2}
                />
                <rect
                  className="qh-kaaba-band"
                  x={C - 7}
                  y={C - COMPASS_R - 3}
                  width={14}
                  height={2.5}
                />
              </g>
            )}

            {showNeedle && (
              <g className="qh-rotor" style={rotate(needleRotation)}>
                <path
                  className="qh-needle"
                  d={`M ${C} ${C - COMPASS_R + 16} L ${C + 6} ${C} L ${C - 6} ${C} Z`}
                />
              </g>
            )}

            {showNeedle || !hasBearing ? (
              <circle className="qh-compass-center" cx={C} cy={C} r={5} />
            ) : (
              <text className="qh-bearing" x={C} y={C} dominantBaseline="central">
                {`${Math.round(bearing)}°`}
              </text>
            )}
          </svg>
        </div>
      </div>

      {turnLabel && (
        <p
          className={"qh-turn" + (turn === "facing" ? " qh-turn--facing" : "")}
          aria-live="polite"
        >
          {turnLabel}
        </p>
      )}

      {hasBearing && !headingAllowed && !sensorUnavailable && (
        <button type="button" className="qh-enable-compass" onClick={enableCompass}>
          {tp.qiblaEnableCompass}
        </button>
      )}
      {sensorUnavailable && <p className="qh-hint">{tp.qiblaNoSensor}</p>}
      {showNeedle && needsCalibration && (
        <p className="qh-hint">{tp.qiblaCalibrate}</p>
      )}
    </header>
  );
};

export default QiblaHeader;
