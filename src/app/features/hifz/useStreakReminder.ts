/**
 * The daily hifz-streak reminder's state, shared by the Hifz page's streak
 * panel and Settings → Notifications. Native owns the truth; this mirrors it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_STREAK_REMINDER_MINUTE,
  enableStreakReminder,
  getStreakReminder,
  isNativeReminders,
  setStreakReminder,
} from "../../core/services/prayer/prayer-times.service";
import { getAlarmHealth } from "../../core/services/prayer/prayer-alarms.service";

export interface StreakReminderState {
  /**
   * Whether to show the reminder at all: false off-device (web/iOS), and
   * until native has answered, so it never flashes "off, 21:00" first.
   */
  visible: boolean;
  enabled: boolean;
  minuteOfDay: number;
  /** The last attempt to turn it on was refused the notification permission. */
  denied: boolean;
  toggle(on: boolean): Promise<void>;
  setMinute(minuteOfDay: number): Promise<void>;
}

export function useStreakReminder(): StreakReminderState {
  const native = isNativeReminders();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [minuteOfDay, setMinuteOfDay] = useState(DEFAULT_STREAK_REMINDER_MINUTE);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getStreakReminder();
      setEnabled(r.enabled);
      setMinuteOfDay(r.minuteOfDay);
      setLoaded(true);
    } catch {
      // Keep what is shown; the next read may succeed.
    }
  }, []);

  // Read on mount and whenever the app comes back to the foreground. Coming
  // back is also when the user may have allowed notifications in system
  // settings, which retires a "denied" note (the switch itself stays off
  // until they turn it on).
  useEffect(() => {
    if (!native) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load();
      getAlarmHealth()
        .then((health) => {
          if (health?.notifications) setDenied(false);
        })
        .catch(() => {});
    };
    void load();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [native, load]);

  // Each write sends only the field it changes, then re-reads native: the
  // Hifz panel and Settings each hold a copy, and either may be stale. A
  // failed write lands on the same re-read, so the screen shows what native
  // actually has.
  const toggle = useCallback(
    async (on: boolean) => {
      try {
        if (on) {
          const ok = await enableStreakReminder();
          setDenied(!ok);
          if (ok) setEnabled(true);
        } else {
          await setStreakReminder({ enabled: false });
          setDenied(false);
          setEnabled(false);
        }
      } catch {
        // Shown state is corrected by the re-read below.
      }
      await load();
    },
    [load],
  );

  // Storing a time while off is harmless: native only arms when enabled.
  const setMinute = useCallback(
    async (minute: number) => {
      setMinuteOfDay(minute);
      try {
        await setStreakReminder({ minuteOfDay: minute });
      } catch {
        // Shown state is corrected by the re-read below.
      }
      await load();
    },
    [load],
  );

  return { visible: native && loaded, enabled, minuteOfDay, denied, toggle, setMinute };
}
