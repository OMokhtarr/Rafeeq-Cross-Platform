/**
 * ALARMS SHEET
 * Ringing alarms set around prayer times, reached from the Prayer Times
 * page's ⋮ menu or from the alarm icon on a timetable row. Android only —
 * the page never mounts it elsewhere.
 *
 * The prayers are the headings and each one lists its alarms, because an
 * alarm is always thought of through its prayer ("before Fajr"). Each row
 * leads with the clock time the alarm rings at today, the one number the
 * user acts on; the offset that produced it sits beneath.
 *
 * The list and the alarm editor are two views of one sheet rather than two
 * sheets, so going into an alarm and back keeps the list's scroll position
 * and never flashes the backdrop.
 *
 * The page owns the alarm list (it also drives the menu status and the row
 * icons); this sheet writes through the service and asks the page to reload.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import {
  deleteAlarm,
  formatOffset,
  getAlarmHealth,
  newAlarm,
  pickAlarmSound,
  prepareAlarmPermissions,
  requestFullScreenAlarms,
  saveAlarm,
  setAlarmSettings,
} from "../../core/services/prayer/prayer-alarms.service";
import {
  openAppSettings,
  requestExactAlarms,
  requestNotificationPermission,
} from "../../core/services/prayer/prayer-times.service";
import {
  ALARM_PRAYERS,
  RAMADAN_SHIFTS,
  SNOOZE_CHOICES,
  type AlarmHealth,
  type AlarmPrayer,
  type AlarmSettings,
  type PrayerAlarm,
  type PrayerAlarmWithNext,
} from "../../core/services/prayer/prayer-alarms.types";
import type { PrayerKey } from "../../core/services/prayer/prayer-times.types";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import { Segmented } from "../../shared/components/controls/Segmented";
import { Switch } from "../../shared/components/controls/Switch";
import AlarmEditor from "./AlarmEditor";
import { formatClock, repeatSummary } from "./alarmFormat";
import "./PrayerSheet.css";
import "./AlarmsSheet.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where the header arrow and hardware back go from the list. */
  onBack: () => void;
  times: Partial<Record<PrayerKey, Date>> | null;
  alarms: PrayerAlarmWithNext[];
  settings: AlarmSettings;
  /** Scrolls this prayer's alarms into view on open. */
  focusPrayer: AlarmPrayer | null;
  onChanged: () => void | Promise<void>;
}

type Editing = { alarm: PrayerAlarm; isNew: boolean };

/** The alarm as stored, without the computed next ring. */
const stored = ({ nextAt, ...alarm }: PrayerAlarmWithNext): PrayerAlarm => alarm;

const BackArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const AlarmsSheet: React.FC<Props> = ({
  open,
  onClose,
  onBack,
  times,
  alarms,
  settings,
  focusPrayer,
  onChanged,
}) => {
  const { t, lang, isRTL } = useLang();
  const s = t.prayerAlarms;
  const tp = t.prayerTimes;

  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<AlarmHealth | null>(null);
  const [choosingSound, setChoosingSound] = useState(false);
  // Optimistic switch state, so a toggle answers the tap before the native
  // write returns; cleared whenever the page hands down a fresh list.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const sectionRefs = useRef<Partial<Record<AlarmPrayer, HTMLElement | null>>>({});

  useEffect(() => setPending({}), [alarms]);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  // Hardware back steps out of the editor first, then off the sheet.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(editing ? closeEditor : onBack);
  }, [open, editing, closeEditor, onBack]);

  const refreshHealth = useCallback(() => {
    getAlarmHealth().then(setHealth);
  }, []);

  // Permissions are granted on system pages outside the app, so they are
  // re-read whenever the app comes back into view.
  useEffect(() => {
    if (!open) return;
    refreshHealth();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshHealth();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, refreshHealth]);

  useEffect(() => {
    if (!open || !focusPrayer) return;
    sectionRefs.current[focusPrayer]?.scrollIntoView?.({ block: "start" });
  }, [open, focusPrayer]);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setError(null);
      setChoosingSound(false);
    }
  }, [open]);

  const isOn = (a: PrayerAlarmWithNext) => pending[a.id] ?? a.enabled;
  const num = (n: number) => (lang === "ar" ? toHindiNumbers(n) : String(n));

  /**
   * The first alarm switched on asks for notifications (required) and exact
   * alarms (best effort). Later ones do not ask again.
   */
  const permissionsFor = async (alarm: PrayerAlarm): Promise<boolean> => {
    if (!alarm.enabled) return true;
    const anotherOn = alarms.some((a) => a.id !== alarm.id && isOn(a));
    if (anotherOn) return true;
    return prepareAlarmPermissions();
  };

  const handleSave = async (alarm: PrayerAlarm) => {
    setSaving(true);
    setError(null);
    try {
      if (!(await permissionsFor(alarm))) {
        setError(s.notificationsNeeded);
        return;
      }
      await saveAlarm(alarm);
      setEditing(null);
      await onChanged();
      refreshHealth();
    } catch {
      setError(s.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteAlarm(editing.alarm.id);
      setEditing(null);
      await onChanged();
    } catch {
      setError(s.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (alarm: PrayerAlarmWithNext) => {
    const next = { ...alarm, enabled: !isOn(alarm) };
    setPending((p) => ({ ...p, [alarm.id]: next.enabled }));
    try {
      if (!(await permissionsFor(next))) {
        setPending((p) => ({ ...p, [alarm.id]: alarm.enabled }));
        setError(s.notificationsNeeded);
        return;
      }
      await saveAlarm(stored(next));
      setError(null);
      await onChanged();
    } catch {
      // A switch that looks applied but is not is worse than one that
      // visibly springs back.
      setPending((p) => ({ ...p, [alarm.id]: alarm.enabled }));
      setError(s.saveFailed);
    }
  };

  const changeSettings = async (patch: Partial<AlarmSettings>) => {
    try {
      await setAlarmSettings(patch);
      await onChanged();
    } catch {
      setError(s.saveFailed);
    }
  };

  const chooseSound = async (source: "system" | "file") => {
    setChoosingSound(false);
    const picked = await pickAlarmSound(source).catch(() => null);
    if (picked) await onChanged();
  };

  const allowNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) await openAppSettings();
    refreshHealth();
  };

  // Warnings only matter once an alarm exists to be affected by them.
  const warnings: { text: string; action: string; run: () => void }[] = [];
  if (health && alarms.length > 0) {
    if (!health.notifications) {
      warnings.push({ text: s.warnNotifications, action: s.allow, run: allowNotifications });
    }
    if (!health.exactAlarms) {
      warnings.push({ text: s.warnExact, action: s.allow, run: () => requestExactAlarms() });
    }
    if (!health.fullScreen) {
      warnings.push({ text: s.warnFullScreen, action: s.allow, run: () => requestFullScreenAlarms() });
    }
    if (health.aggressiveBattery && !health.batteryUnrestricted) {
      warnings.push({ text: s.warnBattery, action: s.openSettings, run: () => openAppSettings() });
    }
  }

  if (!open) return null;

  const prayerName = (p: AlarmPrayer) => tp[p];

  /** Today's clock time for an alarm: its prayer today plus the offset. */
  const ringClock = (a: PrayerAlarm): string | null => {
    const prayerAt = times?.[a.prayer];
    if (!prayerAt) return null;
    return formatClock(new Date(prayerAt.getTime() + a.offsetMinutes * 60_000), lang);
  };

  const shiftLabel = { [-1]: s.ramadanEarlier, 0: s.ramadanCalculated, 1: s.ramadanLater } as Record<
    number,
    string
  >;

  return (
    <>
      <div className="sts-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="sts-sheet"
        role="dialog"
        aria-label={s.title}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="sts-handle" aria-hidden="true" />

        <header className="sts-header">
          <div className="sts-header-text">
            <h3 className="sts-title">
              {editing
                ? (editing.isNew ? s.newTitle : s.editTitle).replace(
                    "{prayer}",
                    prayerName(editing.alarm.prayer)
                  )
                : s.title}
            </h3>
            {!editing && <p className="sts-desc">{s.desc}</p>}
          </div>
          <button
            className="sts-close sts-back"
            onClick={editing ? closeEditor : onBack}
            aria-label={editing ? s.back : tp.menuTitle}
          >
            <BackArrow />
          </button>
        </header>

        <div className="sts-body">
          {editing ? (
            <AlarmEditor
              key={editing.alarm.id}
              alarm={editing.alarm}
              isNew={editing.isNew}
              error={error}
              saving={saving}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ) : (
            <>
              {warnings.length > 0 && (
                <ul className="as-warnings">
                  {warnings.map((w) => (
                    <li key={w.text} className="as-warning">
                      <span className="as-warning-text">{w.text}</span>
                      <button type="button" className="rf-btn rf-btn--primary rf-btn--sm" onClick={w.run}>
                        {w.action}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {error && (
                <p className="as-error" role="alert">
                  {error}
                </p>
              )}

              {ALARM_PRAYERS.map((prayer) => {
                const mine = alarms.filter((a) => a.prayer === prayer);
                const prayerAt = times?.[prayer];
                return (
                  <section
                    key={prayer}
                    className="as-prayer"
                    data-prayer={prayer}
                    ref={(el) => {
                      sectionRefs.current[prayer] = el;
                    }}
                  >
                    <h4 className="as-prayer-head">
                      <span>{prayerName(prayer)}</span>
                      {prayerAt && <span className="as-prayer-time">{formatClock(prayerAt, lang)}</span>}
                    </h4>

                    {mine.map((a) => {
                      const on = isOn(a);
                      const clock = ringClock(a);
                      return (
                        <div
                          key={a.id}
                          className={"as-alarm" + (on ? "" : " is-off")}
                          data-alarm={a.id}
                        >
                          <button
                            type="button"
                            className="as-alarm-open"
                            onClick={() => {
                              setError(null);
                              setEditing({ alarm: stored(a), isNew: false });
                            }}
                          >
                            <span className="as-alarm-time">
                              <span className="as-alarm-clock">{clock ?? "—"}</span>
                              <span className="as-alarm-offset">
                                {a.offsetMinutes === 0 ? s.atPrayer : formatOffset(a.offsetMinutes, lang)}
                              </span>
                            </span>
                            <span className="as-alarm-text">
                              {a.label && <span className="as-alarm-label">{a.label}</span>}
                              <span className="as-alarm-repeat">
                                {!on
                                  ? s.off
                                  : a.nextAt === null
                                  ? s.neverRings
                                  : repeatSummary(a, s, lang)}
                              </span>
                            </span>
                          </button>
                          <Switch checked={on} onChange={() => handleToggle(a)} label={s.toggle} />
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      className="as-add"
                      onClick={() => {
                        setError(null);
                        setEditing({ alarm: newAlarm(prayer), isNew: true });
                      }}
                    >
                      <PlusIcon />
                      {s.add}
                    </button>
                  </section>
                );
              })}

              <section className="as-settings">
                <h4 className="as-prayer-head">{s.settingsTitle}</h4>

                <div className="sts-row">
                  <span className="sts-row-label">{s.sound}</span>
                  <button
                    type="button"
                    className="as-value-btn"
                    aria-expanded={choosingSound}
                    onClick={() => setChoosingSound((v) => !v)}
                  >
                    {settings.soundName ?? s.defaultSound}
                  </button>
                </div>
                {choosingSound && (
                  <div className="as-sound-choices">
                    <button
                      type="button"
                      className="rf-btn rf-btn--secondary rf-btn--sm as-sound-choice"
                      onClick={() => chooseSound("system")}
                    >
                      {s.phoneSounds}
                    </button>
                    <button
                      type="button"
                      className="rf-btn rf-btn--secondary rf-btn--sm as-sound-choice"
                      onClick={() => chooseSound("file")}
                    >
                      {s.audioFile}
                    </button>
                  </div>
                )}

                <div className="sts-row">
                  <span className="sts-row-label">{s.snooze}</span>
                  <Segmented
                    compact
                    label={s.snooze}
                    options={SNOOZE_CHOICES.map((m) => ({
                      value: m,
                      label: s.minutesShort.replace("{n}", num(m)),
                    }))}
                    value={settings.snoozeMinutes}
                    onChange={(m) => changeSettings({ snoozeMinutes: m })}
                  />
                </div>

                <div className="sts-row">
                  <span className="sts-row-label">{s.vibrate}</span>
                  <Switch
                    checked={settings.vibrate}
                    onChange={(vibrate) => changeSettings({ vibrate })}
                    label={s.vibrate}
                  />
                </div>

                <div className="as-field as-field--row-end">
                  <span className="sts-row-label">{s.ramadanStarts}</span>
                  <span className="as-hint">{s.ramadanStartsDesc}</span>
                  <Segmented
                    label={s.ramadanStarts}
                    options={RAMADAN_SHIFTS.map((d) => ({ value: d, label: shiftLabel[d] }))}
                    value={settings.ramadanShiftDays}
                    onChange={(d) => changeSettings({ ramadanShiftDays: d })}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default AlarmsSheet;
