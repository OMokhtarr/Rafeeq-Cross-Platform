package com.rafeeq.quranquiz.prayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms the pending prayer alarm after events that silently clear it.
 *
 * A device reboot drops every AlarmManager alarm outright, and a timezone
 * change (travel, or a manual clock change) invalidates whatever time was
 * pending since it was computed against the old zone. Both cases just need
 * [PrayerAlarmScheduler.scheduleNext] to run again; it already no-ops
 * safely when reminders are off or there is no stored location yet.
 *
 * The widget's own midnight-roll alarm is dropped by the same reboot and
 * needs the same re-arm; [PrayerAlarmScheduler.scheduleMidnightRoll] no-ops
 * safely without a stored location, same as scheduleNext.
 */
class PrayerBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        PrayerAlarmScheduler.scheduleNext(context)
        PrayerAlarmScheduler.scheduleMidnightRoll(context)
        PrayerWidgetProvider.refresh(context)
    }
}
