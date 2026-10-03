package com.rafeeq.quranquiz.prayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.rafeeq.quranquiz.R

/**
 * Where a prayer alarm arrives, from AlarmManager (ring or snooze), and where
 * the fallback notification's buttons land.
 *
 * A ring starts [AlarmRingService]. Android only lets a background app start
 * a foreground service from an *exact* alarm, so when exact alarms are not
 * allowed the alarm rings as an insistent notification instead, which
 * repeats its sound until dismissed (see [ringMode]). Either way the chain
 * is re-armed in `finally`: it is the only link to every later ring.
 */
enum class RingMode { SILENT, STALE, SERVICE, NOTIFICATION }

class PrayerAlarmRingReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_RING = "com.rafeeq.quranquiz.prayer.ALARM_RING"
        const val ACTION_FALLBACK_STOP = "com.rafeeq.quranquiz.prayer.ALARM_FALLBACK_STOP"
        const val ACTION_FALLBACK_SNOOZE = "com.rafeeq.quranquiz.prayer.ALARM_FALLBACK_SNOOZE"

        private const val TAG = "RafeeqAlarm"
        private const val FALLBACK_CHANNEL = "rafeeq_prayer_alarm_fallback"
        private const val FALLBACK_NOTIFICATION_ID = 4231

        /** Same window as the reminders: past this, the ring names the wrong moment. */
        internal const val MAX_LATENESS_MS = PrayerAlarmReceiver.MAX_LATENESS_MS

        /**
         * How a delivered ring is answered. Without exact alarms the service
         * is never started: its systemExempted type needs that permission on
         * Android 14+, and a service started in the foreground that cannot
         * reach it crashes the app when it stops.
         */
        internal fun ringMode(ids: List<String>, ringAt: Long, now: Long, exactAllowed: Boolean): RingMode = when {
            ids.isEmpty() -> RingMode.SILENT
            ringAt > 0 && now - ringAt > MAX_LATENESS_MS -> RingMode.STALE
            exactAllowed -> RingMode.SERVICE
            else -> RingMode.NOTIFICATION
        }

        /** Rings as an insistent notification when the service cannot start. */
        fun postFallback(context: Context, ids: List<String>, prayerAts: LongArray) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // A channel's sound is fixed once created, so this one uses the
                // device's alarm sound rather than the picked one, which can change.
                val channel = NotificationChannel(
                    FALLBACK_CHANNEL,
                    context.getString(R.string.alarm_fallback_channel_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
                    )
                }
                nm.createNotificationChannel(channel)
            }

            val res = AlarmText.appResources(context)
            val lines = AlarmText.ringLines(context, ids)
            fun action(action: String, code: Int) = PendingIntent.getBroadcast(
                context, code,
                Intent(context, PrayerAlarmRingReceiver::class.java).apply {
                    this.action = action
                    putExtra(PrayerAlarmClockScheduler.EXTRA_ALARM_IDS, ids.toTypedArray())
                    putExtra(PrayerAlarmClockScheduler.EXTRA_PRAYER_AT, prayerAts)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val notification = NotificationCompat.Builder(context, FALLBACK_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.colorPrimary))
                .setContentTitle(lines.firstOrNull() ?: res.getString(R.string.app_name))
                .setContentText(lines.drop(1).joinToString("\n"))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setTimeoutAfter(AlarmRingService.AUTO_STOP_MS)
                .setDeleteIntent(action(ACTION_FALLBACK_STOP, 4232))
                .addAction(0, res.getString(R.string.alarm_snooze), action(ACTION_FALLBACK_SNOOZE, 4233))
                .addAction(0, res.getString(R.string.alarm_stop), action(ACTION_FALLBACK_STOP, 4234))
                .build()
            notification.flags = notification.flags or Notification.FLAG_INSISTENT
            nm.notify(FALLBACK_NOTIFICATION_ID, notification)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_RING -> onRing(context, intent)
            ACTION_FALLBACK_STOP -> cancelFallback(context)
            ACTION_FALLBACK_SNOOZE -> {
                cancelFallback(context)
                val ids = intent.getStringArrayExtra(PrayerAlarmClockScheduler.EXTRA_ALARM_IDS)?.toList().orEmpty()
                val prayerAts = intent.getLongArrayExtra(PrayerAlarmClockScheduler.EXTRA_PRAYER_AT) ?: LongArray(0)
                if (ids.isNotEmpty()) PrayerAlarmClockScheduler.scheduleSnooze(context, ids, prayerAts)
            }
        }
    }

    private fun onRing(context: Context, intent: Intent) {
        val ringAt = intent.getLongExtra(PrayerAlarmClockScheduler.EXTRA_RING_AT, 0L)
        try {
            val now = System.currentTimeMillis()
            // Alarms deleted or switched off since this ring was armed (a
            // snooze outliving an edit) stay silent.
            val live = PrayerAlarmConfig.alarms(context).filter { it.enabled }.map { it.id }.toSet()
            val rawIds = intent.getStringArrayExtra(PrayerAlarmClockScheduler.EXTRA_ALARM_IDS).orEmpty()
            val rawAts = intent.getLongArrayExtra(PrayerAlarmClockScheduler.EXTRA_PRAYER_AT) ?: LongArray(0)
            val keep = rawIds.indices.filter { rawIds[it] in live }
            val ids = keep.map { rawIds[it] }
            val prayerAts = LongArray(keep.size) { rawAts.getOrElse(keep[it]) { 0L } }

            when (ringMode(ids, ringAt, now, PrayerAlarmScheduler.canScheduleExact(context))) {
                RingMode.SILENT -> Unit
                RingMode.STALE ->
                    Log.w(TAG, "alarm $ids delivered ${(now - ringAt) / 60_000} min late — not rung")
                RingMode.SERVICE -> startRinging(context, ids, prayerAts)
                RingMode.NOTIFICATION -> postFallback(context, ids, prayerAts)
            }
        } catch (e: Exception) {
            Log.e(TAG, "ring failed — still re-arming", e)
        } finally {
            // Strictly after the ring just handled, so it is never picked again.
            PrayerAlarmClockScheduler.scheduleNext(context, maxOf(System.currentTimeMillis(), ringAt))
        }
    }

    private fun startRinging(context: Context, ids: List<String>, prayerAts: LongArray) {
        try {
            ContextCompat.startForegroundService(context, AlarmRingService.startIntent(context, ids, prayerAts))
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException (API 31+) without the
            // exact-alarm exemption, or a refused service type.
            Log.w(TAG, "could not start the ringing service — falling back to a notification", e)
            postFallback(context, ids, prayerAts)
        }
    }

    private fun cancelFallback(context: Context) {
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(FALLBACK_NOTIFICATION_ID)
    }
}
