package com.rafeeq.quranquiz.prayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.rafeeq.quranquiz.R
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Rings a prayer alarm: the sound on the alarm stream, vibration, and the
 * alarm notification whose full-screen intent opens [AlarmRingActivity] over
 * the lock screen.
 *
 * A foreground service of type systemExempted, which Android reserves for
 * apps holding the exact-alarm permission that continue an alarm in the
 * background — this case exactly. It stops itself on Stop, on Snooze, or
 * after [AUTO_STOP_MS] untouched, posting a missed-alarm notification then.
 *
 * The screen and the service share [current] and a listener set rather than
 * a binder: both live in this process, and the screen only needs to know
 * what is ringing and when it ends.
 */
class AlarmRingService : Service() {

    data class Ringing(val ids: List<String>, val prayerAts: LongArray)

    companion object {
        const val AUTO_STOP_MS = 2 * 60_000L

        private const val ACTION_START = "com.rafeeq.quranquiz.prayer.ALARM_START"
        const val ACTION_STOP = "com.rafeeq.quranquiz.prayer.ALARM_STOP"
        const val ACTION_SNOOZE = "com.rafeeq.quranquiz.prayer.ALARM_SNOOZE"

        private const val TAG = "RafeeqAlarm"
        private const val CHANNEL = "rafeeq_prayer_alarm"
        private const val MISSED_CHANNEL = "rafeeq_prayer_alarm_missed"
        private const val NOTIFICATION_ID = 4230
        private const val MISSED_NOTIFICATION_ID = 4235

        /** Quiet start, full alarm volume after this long. */
        private const val RAMP_MS = 20_000L
        private const val TICK_MS = 1_000L
        private const val START_VOLUME = 0.1f

        @Volatile
        var current: Ringing? = null
            private set

        private val listeners = CopyOnWriteArraySet<() -> Unit>()
        fun addListener(l: () -> Unit) { listeners += l }
        fun removeListener(l: () -> Unit) { listeners -= l }

        fun startIntent(ctx: Context, ids: List<String>, prayerAts: LongArray): Intent =
            Intent(ctx, AlarmRingService::class.java).apply {
                action = ACTION_START
                putExtra(PrayerAlarmClockScheduler.EXTRA_ALARM_IDS, ids.toTypedArray())
                putExtra(PrayerAlarmClockScheduler.EXTRA_PRAYER_AT, prayerAts)
            }

        fun commandIntent(ctx: Context, action: String): Intent =
            Intent(ctx, AlarmRingService::class.java).setAction(action)
    }

    private val handler = Handler(Looper.getMainLooper())
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var startedAt = 0L

    private val autoStop = Runnable { finish(missed = true) }

    /** Raises the volume step by step and, below API 28, restarts the
     *  sound each time it ends, since Ringtone cannot loop there. */
    private val tick = object : Runnable {
        override fun run() {
            val r = ringtone ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val progress = ((System.currentTimeMillis() - startedAt).toFloat() / RAMP_MS).coerceIn(0f, 1f)
                r.volume = START_VOLUME + (1f - START_VOLUME) * progress
            } else if (!r.isPlaying) {
                runCatching { r.play() }
            }
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> finish(missed = false)
            ACTION_SNOOZE -> {
                current?.let { PrayerAlarmClockScheduler.scheduleSnooze(this, it.ids, it.prayerAts) }
                finish(missed = false)
            }
            else -> if (current == null) stopSelf()
        }
        // An alarm cut short by the system is not resumed later: by then it
        // would name the wrong moment.
        return START_NOT_STICKY
    }

    private fun start(intent: Intent) {
        val ids = intent.getStringArrayExtra(PrayerAlarmClockScheduler.EXTRA_ALARM_IDS)?.toList().orEmpty()
        val ats = intent.getLongArrayExtra(PrayerAlarmClockScheduler.EXTRA_PRAYER_AT) ?: LongArray(0)
        val already = current
        current = if (already == null) {
            Ringing(ids, ats)
        } else {
            // A second alarm while one rings joins it: one sound, both named.
            val newIdx = ids.indices.filter { ids[it] !in already.ids }
            Ringing(already.ids + newIdx.map { ids[it] }, already.prayerAts + LongArray(newIdx.size) { ats[newIdx[it]] })
        }

        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, buildNotification(),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
                } else {
                    0
                },
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground refused — ringing as a notification", e)
            current = null
            PrayerAlarmRingReceiver.postFallback(this, ids, ats)
            stopSelf()
            return
        }

        if (already == null) {
            startedAt = System.currentTimeMillis()
            acquireWakeLock()
            startSound()
            startVibration()
            handler.postDelayed(autoStop, AUTO_STOP_MS)
        }
        listeners.forEach { it() }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rafeeq:prayer-alarm").apply {
            setReferenceCounted(false)
            acquire(AUTO_STOP_MS + 30_000L)
        }
    }

    private fun inCall(): Boolean {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.mode == AudioManager.MODE_IN_CALL || am.mode == AudioManager.MODE_IN_COMMUNICATION
    }

    /**
     * A document picked with the file chooser is only playable while its
     * persisted read grant lasts, so it is checked before use. Media-store
     * and settings URIs from the ringtone picker are not: when this process
     * cannot read one, Ringtone hands playback to the system's own player.
     */
    private fun playable(uri: Uri): Boolean {
        if (uri.scheme != ContentResolver.SCHEME_CONTENT) return true
        if (uri.authority == "media" || uri.authority == "settings") return true
        return runCatching { contentResolver.openAssetFileDescriptor(uri, "r")?.close() }.isSuccess
    }

    private fun startSound() {
        if (inCall()) return
        val chosen = PrayerAlarmConfig.settings(this).soundUri?.let { runCatching { Uri.parse(it) }.getOrNull() }
        val candidates = listOfNotNull(
            chosen?.takeIf { playable(it) },
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        )
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        for (uri in candidates) {
            val r = runCatching { RingtoneManager.getRingtone(this, uri) }.getOrNull() ?: continue
            val started = runCatching {
                r.audioAttributes = attrs
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    r.isLooping = true
                    r.volume = START_VOLUME
                }
                r.play()
            }.isSuccess
            if (started) {
                ringtone = r
                handler.post(tick)
                return
            }
        }
        Log.w(TAG, "no playable alarm sound — vibration and notification only")
    }

    private fun startVibration() {
        if (!PrayerAlarmConfig.settings(this).vibrate) return
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        val effect = VibrationEffect.createWaveform(longArrayOf(0, 800, 800), 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        }
        vibrator = v
    }

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.alarm_channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
                description = getString(R.string.alarm_channel_desc)
                // The service plays the sound and vibrates itself, with the
                // ramp and the user's choice; the channel stays silent.
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(MISSED_CHANNEL, getString(R.string.alarm_missed_channel_name), NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    private fun buildNotification(): Notification {
        ensureChannels()
        val res = AlarmText.appResources(this)
        val lines = AlarmText.ringLines(this, current?.ids.orEmpty())
        val immutable = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val screen = PendingIntent.getActivity(
            this, 4236,
            Intent(this, AlarmRingActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            immutable,
        )
        val stop = PendingIntent.getService(this, 4237, commandIntent(this, ACTION_STOP), immutable)
        val snooze = PendingIntent.getService(this, 4238, commandIntent(this, ACTION_SNOOZE), immutable)
        val largeIcon = ContextCompat.getDrawable(this, R.mipmap.ic_launcher_round)?.toBitmap(192, 192)

        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(largeIcon)
            .setColor(ContextCompat.getColor(this, R.color.colorPrimary))
            // Allowed for foreground-service notifications only: a green
            // card sets the alarm apart from the gold prayer reminders.
            .setColorized(true)
            .setContentTitle(lines.firstOrNull() ?: res.getString(R.string.app_name))
            .setContentText(lines.drop(1).joinToString("\n").ifEmpty { res.getString(R.string.alarm_ringing) })
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(screen)
            .setFullScreenIntent(screen, true)
            .addAction(0, res.getString(R.string.alarm_snooze), snooze)
            .addAction(0, res.getString(R.string.alarm_stop), stop)
            .build()
    }

    private fun postMissed(ids: List<String>) {
        val res = AlarmText.appResources(this)
        val open = PendingIntent.getActivity(
            this, 4239,
            Intent(this, com.rafeeq.quranquiz.MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, MISSED_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.colorPrimary))
            .setContentTitle(res.getString(R.string.alarm_missed_title))
            .setContentText(AlarmText.ringLines(this, ids).joinToString("\n"))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(MISSED_NOTIFICATION_ID, notification)
    }

    private fun finish(missed: Boolean) {
        val ringing = current
        handler.removeCallbacksAndMessages(null)
        runCatching { ringtone?.stop() }
        ringtone = null
        runCatching { vibrator?.cancel() }
        vibrator = null
        current = null
        if (missed && ringing != null) postMissed(ringing.ids)
        listeners.forEach { it() }
        runCatching { wakeLock?.release() }
        wakeLock = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (current != null) finish(missed = false)
        super.onDestroy()
    }
}
