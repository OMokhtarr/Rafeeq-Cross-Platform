package com.rafeeq.quranquiz.prayer

import android.content.Context

/**
 * The prayer feature's stored state, in SharedPreferences.
 *
 * SharedPreferences rather than Capacitor Preferences because the widget and
 * the alarm receiver have no bridge to read the latter — they run with the app
 * closed. The web layer reaches this through RafeeqPrayerPlugin.
 */
object PrayerConfig {
    const val PREFS_NAME = "rafeeq_prayer"

    const val DEFAULT_METHOD = "egyptian"
    const val DEFAULT_MADHAB = "shafi"

    private const val KEY_LAT = "lat"
    private const val KEY_LNG = "lng"
    private const val KEY_METHOD = "method"
    private const val KEY_MADHAB = "madhab"

    /** Sunrise is absent by design: it is displayed with the prayers but is
     *  not one, and never carries a reminder. */
    val DEFAULT_ENABLED_PRAYERS: Set<String> =
        setOf("fajr", "dhuhr", "asr", "maghrib", "isha")

    private const val KEY_REMINDERS = "reminders_enabled"
    private const val KEY_ENABLED_PRAYERS = "enabled_prayers"

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Null until a location has been granted and stored at least once. */
    fun coords(ctx: Context): Pair<Double, Double>? {
        val p = prefs(ctx)
        if (!p.contains(KEY_LAT) || !p.contains(KEY_LNG)) return null
        // Stored as bits because SharedPreferences has no Double accessor.
        val lat = Double.fromBits(p.getLong(KEY_LAT, 0L))
        val lng = Double.fromBits(p.getLong(KEY_LNG, 0L))
        return lat to lng
    }

    fun setCoords(ctx: Context, lat: Double, lng: Double) {
        prefs(ctx).edit()
            .putLong(KEY_LAT, lat.toRawBits())
            .putLong(KEY_LNG, lng.toRawBits())
            .apply()
    }

    fun method(ctx: Context): String =
        prefs(ctx).getString(KEY_METHOD, DEFAULT_METHOD) ?: DEFAULT_METHOD

    fun madhab(ctx: Context): String =
        prefs(ctx).getString(KEY_MADHAB, DEFAULT_MADHAB) ?: DEFAULT_MADHAB

    fun setMethod(ctx: Context, method: String) {
        prefs(ctx).edit().putString(KEY_METHOD, method).apply()
    }

    fun setMadhab(ctx: Context, madhab: String) {
        prefs(ctx).edit().putString(KEY_MADHAB, madhab).apply()
    }

    fun remindersEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_REMINDERS, false)

    fun setRemindersEnabled(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_REMINDERS, enabled).apply()
    }

    fun enabledPrayers(ctx: Context): Set<String> =
        prefs(ctx).getStringSet(KEY_ENABLED_PRAYERS, DEFAULT_ENABLED_PRAYERS)
            ?: DEFAULT_ENABLED_PRAYERS

    fun setEnabledPrayers(ctx: Context, prayers: Set<String>) {
        prefs(ctx).edit().putStringSet(KEY_ENABLED_PRAYERS, prayers).apply()
    }
}
