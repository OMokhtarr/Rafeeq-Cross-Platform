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

    /**
     * 12-hour clock by default.
     *
     * Not `DateFormat.is24HourFormat(ctx)`: the widget shows prayer times,
     * which are spoken and written as "5:15 in the morning" across the app's
     * audience, and the device setting is as often an untouched ROM default
     * as a real preference. The user can still choose 24-hour explicitly.
     */
    const val DEFAULT_USE_24_HOUR = false

    private const val KEY_LAT = "lat"
    private const val KEY_LNG = "lng"
    private const val KEY_METHOD = "method"
    private const val KEY_MADHAB = "madhab"
    private const val KEY_PLACE_NAME = "place_name"

    /** Sunrise is absent by design: it is displayed with the prayers but is
     *  not one, and never carries a reminder. */
    val DEFAULT_ENABLED_PRAYERS: Set<String> =
        setOf("fajr", "dhuhr", "asr", "maghrib", "isha")

    private const val KEY_REMINDERS = "reminders_enabled"
    private const val KEY_ENABLED_PRAYERS = "enabled_prayers"
    private const val KEY_USE_24_HOUR = "use_24_hour"
    private const val KEY_APP_NIGHT = "app_night"

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
            // A name belongs to the coordinates it was resolved for. Dropping
            // it here means a user who travels and re-fixes can never be shown
            // the city they left, even if the new lookup fails.
            .remove(KEY_PLACE_NAME)
            .apply()
    }

    /** The cached human name for the stored coordinates, if one resolved. */
    fun placeName(ctx: Context): String? =
        prefs(ctx).getString(KEY_PLACE_NAME, null)

    fun setPlaceName(ctx: Context, name: String?) {
        val e = prefs(ctx).edit()
        if (name.isNullOrBlank()) e.remove(KEY_PLACE_NAME) else e.putString(KEY_PLACE_NAME, name)
        e.apply()
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

    /** Clock the widget renders its times in. Global, not per-widget: two
     *  widgets showing the same timetable in different clocks would read as
     *  a bug rather than a choice. */
    fun use24Hour(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_USE_24_HOUR, DEFAULT_USE_24_HOUR)

    fun setUse24Hour(ctx: Context, use24: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_USE_24_HOUR, use24).apply()
    }

    /**
     * Whether the app itself is in night mode.
     *
     * Rafeeq's theme is a stored preference of its own, not the device's, and
     * it lives in localStorage where no Activity can reach it. The web layer
     * mirrors it here on every change so native screens opened from the app —
     * the widget's appearance settings — can match it instead of following
     * the device and rendering white inside a dark app.
     *
     * Defaults to true because the app's own default theme is night
     * (ThemeContext DEFAULT_THEME).
     */
    fun appNight(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_APP_NIGHT, true)

    fun setAppNight(ctx: Context, night: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_APP_NIGHT, night).apply()
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

    /**
     * Times the user may never hide. A prayer-times app that can be configured
     * to omit Fajr is not one, so this is enforced here rather than only in the
     * UI — every read passes through sanitiseVisibleTimes.
     */
    val OBLIGATORY_TIMES: Set<String> =
        setOf("fajr", "dhuhr", "asr", "maghrib", "isha")

    /**
     * Sunrise joins the obligatory five; the supplementary times start hidden,
     * so the page looks exactly as it did before this preference existed.
     */
    val DEFAULT_VISIBLE_TIMES: Set<String> = OBLIGATORY_TIMES + "sunrise"

    private const val KEY_VISIBLE_TIMES = "visible_times"

    /** Forces the obligatory times in and drops anything that is not a real time. */
    fun sanitiseVisibleTimes(times: Set<String>): Set<String> {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        return (times + OBLIGATORY_TIMES).filter { it in known }.toSet()
    }

    fun visibleTimes(ctx: Context): Set<String> {
        val stored = prefs(ctx).getStringSet(KEY_VISIBLE_TIMES, null)
            ?: return DEFAULT_VISIBLE_TIMES
        return sanitiseVisibleTimes(stored)
    }

    fun setVisibleTimes(ctx: Context, times: Set<String>) {
        prefs(ctx).edit()
            .putStringSet(KEY_VISIBLE_TIMES, sanitiseVisibleTimes(times))
            .apply()
    }
}
