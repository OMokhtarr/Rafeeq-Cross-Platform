/**
 * The azkar day: counters carry over within it and start fresh when it ends.
 *
 * It starts at Fajr, the same rule as the Worship Tracker, so evening azkar
 * finished after midnight still count for that evening. Without a location
 * (or on web, where there are no prayer times) it is the calendar day.
 */
import { useCallback, useEffect, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { loadPrayerDay } from "../../core/services/prayer/prayer-times.service";
import type { PrayerDay } from "../../core/services/prayer/prayer-times.types";
import { freshTimes, toDayKey, trackingDayKey } from "../tracker/trackerLogic";

const NO_LOCATION: PrayerDay = { hasLocation: false, times: null, next: null };

/**
 * Returns the azkar day key for `now`, or null when it cannot be known yet:
 * prayer times still loading, or the loaded ones belong to an earlier date.
 * A null day must neither load nor save counters — guessing the calendar day
 * between midnight and Fajr would wipe the evening's counts.
 */
export function azkarDayKey(now: Date, prayer: PrayerDay | null): string | null {
  if (!prayer) return null;
  if (!prayer.hasLocation || !prayer.times?.fajr) return toDayKey(now);
  const fajr = freshTimes(prayer.times, now)?.fajr;
  return fajr ? trackingDayKey(now, fajr) : null;
}

/** The current azkar day key, kept up to date while the page stays mounted. */
export function useAzkarDay(): string | null {
  const [prayer, setPrayer] = useState<PrayerDay | null>(null);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(() => {
    loadPrayerDay()
      .then(setPrayer)
      .catch(() => setPrayer(NO_LOCATION));
  }, []);

  // Ionic keeps the page mounted, so re-read the clock and times whenever it
  // is shown again (e.g. after the app sat in the background overnight).
  useIonViewWillEnter(() => {
    setNow(new Date());
    reload();
  });

  useEffect(() => {
    reload();
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [reload]);

  const day = azkarDayKey(now, prayer);
  // Past midnight the loaded times are yesterday's: fetch the new date's.
  const stale = prayer !== null && day === null;
  useEffect(() => {
    if (stale) reload();
  }, [stale, reload]);

  return day;
}
