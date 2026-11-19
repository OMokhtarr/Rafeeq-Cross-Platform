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

export interface StreakReminderState {
  /** False off-device (web/iOS), where nothing should be shown. */
  visible: boolean;
  enabled: boolean;
  minuteOfDay: number;
  /** The last attempt to turn it on was refused the notification permission. */
  denied: boolean;
  toggle(on: boolean): Promise<void>;
  setMinute(minuteOfDay: number): Promise<void>;
}

export function useStreakReminder(): StreakReminderState {
  const visible = isNativeReminders();
  const [enabled, setEnabled] = useState(false);
  const [minuteOfDay, setMinuteOfDay] = useState(DEFAULT_STREAK_REMINDER_MINUTE);
  const [denied, setDenied] = useState(false);

  // Read on mount and whenever the page becomes visible again — the
  // permission may have been granted in system settings meanwhile.
  useEffect(() => {
    if (!visible) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getStreakReminder()
        .then((r) => {
          setEnabled(r.enabled);
          setMinuteOfDay(r.minuteOfDay);
        })
        .catch(() => {});
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [visible]);

  const toggle = useCallback(
    async (on: boolean) => {
      if (on) {
        const ok = await enableStreakReminder(minuteOfDay);
        setDenied(!ok);
        if (ok) setEnabled(true);
      } else {
        await setStreakReminder({ enabled: false, minuteOfDay });
        setDenied(false);
        setEnabled(false);
      }
    },
    [minuteOfDay],
  );

  // Storing a time while off is harmless: native only arms when enabled.
  const setMinute = useCallback(
    async (minute: number) => {
      setMinuteOfDay(minute);
      await setStreakReminder({ enabled, minuteOfDay: minute });
    },
    [enabled],
  );

  return { visible, enabled, minuteOfDay, denied, toggle, setMinute };
}
