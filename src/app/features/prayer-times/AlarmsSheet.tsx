/**
 * ALARMS SHEET
 * Ringing alarms set around prayer times, reached from the Prayer Times
 * page's ⋮ menu or from the alarm icon on a timetable row. Android only —
 * the page never mounts it elsewhere.
 *
 * It opens on the next alarm, the question the user usually comes with,
 * then one tab per prayer, because an alarm is always thought of through
 * its prayer ("before Fajr"). The chosen prayer's alarms are cards led by
 * the clock time they ring at today, with where that falls against the
 * adhan said in words beneath ("10 min before the adhan").
 *
 * The list and the alarm editor are two views of one sheet rather than two
 * sheets, so going into an alarm and back keeps the list's scroll position
 * and never flashes the backdrop.
 *
 * The page owns the alarm list (it also drives the menu status and the row
 * icons); this sheet writes through the service and asks the page to reload.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useLang } from "../../core/context/LanguageContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import {
  deleteAlarm,
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
import { countLabel, formatClock, formatWhen, offsetPhrase, repeatSummary } from "./alarmFormat";
import { AlarmIcon } from "./PrayerMenuSheet";
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
  /** The prayer whose tab opens first (the row icon tapped); otherwise the
   *  prayer of the next alarm. */
  focusPrayer: AlarmPrayer | null;
  onChanged: () => void | Promise<void>;
}

type Editing = { alarm: PrayerAlarm; isNew: boolean };

/** The alarm as stored, without the computed next ring. */
const stored = ({ nextAt, ...alarm }: PrayerAlarmWithNext): PrayerAlarm => alarm;

/** The switched-on alarm that rings soonest, if any will. */
function soonest(alarms: PrayerAlarmWithNext[], isOn: (a: PrayerAlarmWithNext) => boolean) {
  return (
    alarms
      .filter((a) => isOn(a) && a.nextAt)
      .sort((a, b) => a.nextAt!.getTime() - b.nextAt!.getTime())[0] ?? null
  );
}

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
  const [selected, setSelected] = useState<AlarmPrayer>(
    () => focusPrayer ?? soonest(alarms, (a) => a.enabled)?.prayer ?? "fajr"
  );

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

  // Each opening starts on the asked-for prayer, else on the next alarm's.
  // Keyed on the opening only: the list changing while the sheet is open
  // must not pull the user off the tab they chose.
  useEffect(() => {
    if (!open) return;
    setSelected(focusPrayer ?? soonest(alarms, (a) => a.enabled)?.prayer ?? "fajr");
  }, [open, focusPrayer]);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setError(null);
      setChoosingSound(false);
    }
  }, [open]);

  const isOn = (a: PrayerAlarmWithNext) => pending[a.id] ?? a.enabled;
  const nextAlarm = soonest(alarms, isOn);
  // Before the prayer first, then after it, as they ring.
  const shown = alarms
    .filter((a) => a.prayer === selected)
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes);
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
              {/* The one question the user opens this sheet with: when do I
                  next get woken? Tapping it shows that alarm's prayer. */}
              {nextAlarm && nextAlarm.nextAt && (
                <button type="button" className="as-next" onClick={() => setSelected(nextAlarm.prayer)}>
                  <AlarmIcon className="as-next-icon" />
                  <span className="as-next-text">
                    <span className="as-next-title">{s.nextAlarm}</span>
                    <span className="as-next-when">{formatWhen(nextAlarm.nextAt, new Date(), lang, s)}</span>
                  </span>
                  <span className="as-next-name">{nextAlarm.label || prayerName(nextAlarm.prayer)}</span>
                </button>
              )}

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

              <div role="tablist" aria-label={s.tabsLabel} className="as-tabs">
                {ALARM_PRAYERS.map((prayer) => {
                  const count = alarms.filter((a) => a.prayer === prayer).length;
                  const chosen = prayer === selected;
                  return (
                    <button
                      key={prayer}
                      type="button"
                      role="tab"
                      data-prayer={prayer}
                      aria-selected={chosen}
                      className={"as-tab" + (chosen ? " is-active" : "") + (count ? "" : " is-empty")}
                      onClick={() => setSelected(prayer)}
                    >
                      <span className="as-tab-name">{prayerName(prayer)}</span>
                      <span className="as-tab-count">{countLabel(count, s, lang)}</span>
                    </button>
                  );
                })}
              </div>

              <section className="as-panel" role="tabpanel" aria-label={prayerName(selected)}>
                <div className="as-adhan">
                  <span className="as-adhan-name">{s.adhanOf.replace("{prayer}", prayerName(selected))}</span>
                  {times?.[selected] && (
                    <span className="as-adhan-time">{formatClock(times[selected]!, lang)}</span>
                  )}
                </div>

                {shown.map((a) => {
                  const on = isOn(a);
                  return (
                    <div key={a.id} className={"as-card" + (on ? "" : " is-off")} data-alarm={a.id}>
                      <button
                        type="button"
                        className="as-alarm-open"
                        onClick={() => {
                          setError(null);
                          setEditing({ alarm: stored(a), isNew: false });
                        }}
                      >
                        <span className="as-card-time">{ringClock(a) ?? "—"}</span>
                        <span className={"as-card-label" + (a.label ? "" : " is-untitled")}>
                          {a.label || s.untitled}
                        </span>
                        <span className="as-card-meta">
                          <span className="as-card-offset">{offsetPhrase(a.offsetMinutes, s, lang)}</span>
                          <span className="as-card-days">
                            {!on ? s.off : a.nextAt === null ? s.neverRings : repeatSummary(a, s, lang)}
                          </span>
                        </span>
                      </button>
                      <Switch checked={on} onChange={() => handleToggle(a)} label={s.toggle} />
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="as-new"
                  onClick={() => {
                    setError(null);
                    setEditing({ alarm: newAlarm(selected), isNew: true });
                  }}
                >
                  <PlusIcon />
                  {s.newTitle.replace("{prayer}", prayerName(selected))}
                </button>
              </section>

              <section className="as-settings">
                <h4 className="as-section-head">{s.settingsTitle}</h4>

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
