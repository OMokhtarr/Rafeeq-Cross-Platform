package com.rafeeq.quranquiz.prayer

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek

/**
 * One ringing alarm tied to a prayer, e.g. "Fajr − 1:30, Suhoor, Ramadan only".
 *
 * [offsetMinutes] is negative before the prayer and positive after it. [days]
 * and [ramadanOnly] are judged against the date of the *prayer*, not the
 * instant the alarm rings — an "Isha +3:00" ringing after midnight still
 * belongs to the Isha's day (see PrayerAlarmMath).
 */
data class PrayerAlarm(
    val id: String,
    val prayer: PrayerName,
    val offsetMinutes: Int,
    val label: String,
    val enabled: Boolean,
    val days: Set<DayOfWeek>,
    val ramadanOnly: Boolean,
)

/** Settings shared by every alarm. */
data class AlarmSettings(
    /** A ringtone or audio-document URI; null plays the device's default alarm. */
    val soundUri: String?,
    /** The sound's display name, captured when it was picked. */
    val soundName: String?,
    val snoozeMinutes: Int,
    val vibrate: Boolean,
    /**
     * Moves the start of Ramadan for "Ramadan only" alarms when local moon
     * sighting disagrees with the Umm al-Qura calendar: +1 means Ramadan
     * starts (and ends) a day later than calculated.
     */
    val ramadanShiftDays: Int,
)

/**
 * The prayer alarms and their shared settings, in SharedPreferences as JSON.
 *
 * Native rather than in the web layer because the scheduler re-arms after a
 * reboot with no WebView running, exactly like the reminder settings in
 * [PrayerConfig]. Decoding never throws: it runs inside broadcast receivers,
 * where an exception would end the alarm chain for good.
 */
object PrayerAlarmConfig {

    /** Sunrise and the supplementary times are not prayers and take no alarm. */
    val ALARM_PRAYERS = listOf(
        PrayerName.FAJR,
        PrayerName.DHUHR,
        PrayerName.ASR,
        PrayerName.MAGHRIB,
        PrayerName.ISHA,
    )

    const val MAX_OFFSET = 180
    const val MAX_LABEL = 40
    val SNOOZE_CHOICES = listOf(5, 10, 15)
    const val DEFAULT_SNOOZE = 10

    val DEFAULT_SETTINGS = AlarmSettings(
        soundUri = null,
        soundName = null,
        snoozeMinutes = DEFAULT_SNOOZE,
        vibrate = true,
        ramadanShiftDays = 0,
    )

    private const val KEY_ALARMS = "alarms_json"
    private const val KEY_SETTINGS = "alarm_settings_json"

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PrayerConfig.PREFS_NAME, Context.MODE_PRIVATE)

    fun sanitise(a: PrayerAlarm): PrayerAlarm = a.copy(
        offsetMinutes = a.offsetMinutes.coerceIn(-MAX_OFFSET, MAX_OFFSET),
        label = a.label.trim().take(MAX_LABEL),
        // An alarm with no days would never ring, which reads as broken
        // rather than as a choice; switching it off is how to silence it.
        days = a.days.ifEmpty { DayOfWeek.values().toSet() },
    )

    fun alarmToJson(a: PrayerAlarm): JSONObject = JSONObject()
        .put("id", a.id)
        .put("prayer", a.prayer.name.lowercase())
        .put("offsetMinutes", a.offsetMinutes)
        .put("label", a.label)
        .put("enabled", a.enabled)
        .put("days", JSONArray(a.days.map { it.value }.sorted()))
        .put("ramadanOnly", a.ramadanOnly)

    /** Null for anything that is not a usable alarm. */
    fun alarmFromJson(o: JSONObject): PrayerAlarm? {
        val id = o.optString("id", "").ifBlank { return null }
        val prayer = ALARM_PRAYERS.firstOrNull { it.name.lowercase() == o.optString("prayer") }
            ?: return null
        val days = mutableSetOf<DayOfWeek>()
        o.optJSONArray("days")?.let { arr ->
            for (i in 0 until arr.length()) {
                val v = arr.optInt(i, 0)
                if (v in 1..7) days += DayOfWeek.of(v)
            }
        }
        return sanitise(
            PrayerAlarm(
                id = id,
                prayer = prayer,
                offsetMinutes = o.optInt("offsetMinutes", 0),
                label = o.optString("label", ""),
                enabled = o.optBoolean("enabled", true),
                days = days,
                ramadanOnly = o.optBoolean("ramadanOnly", false),
            ),
        )
    }

    fun encodeAlarms(list: List<PrayerAlarm>): String =
        JSONArray(list.map { alarmToJson(it) }).toString()

    fun decodeAlarms(json: String?): List<PrayerAlarm> {
        if (json.isNullOrBlank()) return emptyList()
        val arr = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let { alarmFromJson(it) }
        }
    }

    fun settingsToJson(s: AlarmSettings): JSONObject = JSONObject()
        .put("soundUri", s.soundUri ?: JSONObject.NULL)
        .put("soundName", s.soundName ?: JSONObject.NULL)
        .put("snoozeMinutes", s.snoozeMinutes)
        .put("vibrate", s.vibrate)
        .put("ramadanShiftDays", s.ramadanShiftDays)

    fun encodeSettings(s: AlarmSettings): String = settingsToJson(s).toString()

    fun decodeSettings(json: String?): AlarmSettings {
        if (json.isNullOrBlank()) return DEFAULT_SETTINGS
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return DEFAULT_SETTINGS
        val snooze = o.optInt("snoozeMinutes", DEFAULT_SNOOZE)
        return AlarmSettings(
            soundUri = o.optStringOrNull("soundUri"),
            soundName = o.optStringOrNull("soundName"),
            snoozeMinutes = if (snooze in SNOOZE_CHOICES) snooze else DEFAULT_SNOOZE,
            vibrate = o.optBoolean("vibrate", true),
            ramadanShiftDays = o.optInt("ramadanShiftDays", 0).coerceIn(-1, 1),
        )
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (isNull(key)) null else optString(key, "").ifEmpty { null }

    fun alarms(ctx: Context): List<PrayerAlarm> =
        decodeAlarms(prefs(ctx).getString(KEY_ALARMS, null))

    fun setAlarms(ctx: Context, list: List<PrayerAlarm>) {
        prefs(ctx).edit().putString(KEY_ALARMS, encodeAlarms(list.map { sanitise(it) })).apply()
    }

    /** Inserts, or replaces the alarm with the same id in place. */
    fun upsert(ctx: Context, alarm: PrayerAlarm): PrayerAlarm {
        val clean = sanitise(alarm)
        val current = alarms(ctx)
        val next = if (current.any { it.id == clean.id }) {
            current.map { if (it.id == clean.id) clean else it }
        } else {
            current + clean
        }
        setAlarms(ctx, next)
        return clean
    }

    fun delete(ctx: Context, id: String) {
        setAlarms(ctx, alarms(ctx).filterNot { it.id == id })
    }

    fun settings(ctx: Context): AlarmSettings =
        decodeSettings(prefs(ctx).getString(KEY_SETTINGS, null))

    fun setSettings(ctx: Context, s: AlarmSettings) {
        prefs(ctx).edit().putString(KEY_SETTINGS, encodeSettings(s)).apply()
    }
}
