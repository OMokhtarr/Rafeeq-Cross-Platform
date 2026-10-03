package com.rafeeq.quranquiz.prayer

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import com.rafeeq.quranquiz.R
import kotlin.math.abs

/**
 * The words an alarm rings with — shared by the ringing screen, its
 * notification and the missed-alarm notification, so all three name an
 * alarm the same way: "Fajr − 1:30 · Suhoor".
 */
object AlarmText {

    private const val ARABIC_ZERO = '٠'

    /** |minutes| as h:mm, e.g. -90 → "1:30". */
    fun formatOffset(minutes: Int): String {
        val m = abs(minutes)
        return "%d:%02d".format(m / 60, m % 60)
    }

    private fun localiseDigits(s: String, arabic: Boolean): String =
        if (!arabic) s else s.map { if (it in '0'..'9') ARABIC_ZERO + (it - '0') else it }.joinToString("")

    /** The prayer, the signed offset when there is one, then the label. */
    fun ringLine(prayerName: String, offsetMinutes: Int, label: String, arabic: Boolean): String {
        val parts = mutableListOf(
            if (offsetMinutes == 0) {
                prayerName
            } else {
                val sign = if (offsetMinutes < 0) "−" else "+"
                "$prayerName $sign ${localiseDigits(formatOffset(offsetMinutes), arabic)}"
            },
        )
        if (label.isNotBlank()) parts += label
        return parts.joinToString(" · ")
    }

    /** Resources in the app's own language, which the alarm screens speak. */
    fun appResources(ctx: Context): Resources {
        val config = Configuration(ctx.resources.configuration)
        config.setLocale(PrayerConfig.appLocale(ctx))
        return ctx.createConfigurationContext(config).resources
    }

    private fun prayerName(res: Resources, prayer: PrayerName): String = res.getString(
        when (prayer) {
            PrayerName.FAJR -> R.string.prayer_widget_name_fajr
            PrayerName.DHUHR -> R.string.prayer_widget_name_dhuhr
            PrayerName.ASR -> R.string.prayer_widget_name_asr
            PrayerName.MAGHRIB -> R.string.prayer_widget_name_maghrib
            else -> R.string.prayer_widget_name_isha
        },
    )

    /** One line per alarm in [ids], in the app's language; unknown ids are skipped. */
    fun ringLines(ctx: Context, ids: List<String>): List<String> {
        val res = appResources(ctx)
        val arabic = PrayerConfig.appLocale(ctx).language == "ar"
        val byId = PrayerAlarmConfig.alarms(ctx).associateBy { it.id }
        return ids.mapNotNull { byId[it] }.map {
            ringLine(prayerName(res, it.prayer), it.offsetMinutes, it.label, arabic)
        }
    }
}
