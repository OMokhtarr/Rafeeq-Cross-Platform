package com.rafeeq.quranquiz.prayer

import com.batoulapps.adhan.CalculationMethod
import com.batoulapps.adhan.CalculationParameters
import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.HighLatitudeRule
import com.batoulapps.adhan.Madhab
import com.batoulapps.adhan.PrayerTimes
import com.batoulapps.adhan.SunnahTimes
import com.batoulapps.adhan.data.DateComponents
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

/**
 * Every time the engine can report.
 *
 * The first six are the daily timetable. DUHA, MIDNIGHT and LAST_THIRD are
 * supplementary: they are displayed, but they are not prayers — like SUNRISE
 * they never carry a reminder and are never the "next prayer" in a countdown.
 * PRAYERS_ONLY is the list that draws that line.
 */
enum class PrayerName {
    FAJR,
    SUNRISE,
    DUHA,
    DHUHR,
    ASR,
    MAGHRIB,
    ISHA,
    MIDNIGHT,
    LAST_THIRD,
}

data class DayTimes(val times: Map<PrayerName, Date?>)

data class NextPrayer(val name: PrayerName, val at: Date)

/**
 * Prayer-time calculation, shared by every consumer: the Capacitor plugin that
 * feeds the React page, the alarm scheduler, and the home-screen widget.
 *
 * It lives in Kotlin rather than in the web layer because the widget renders in
 * the launcher process, where there is no WebView to run JavaScript — and the
 * exact alarms must fire when the app is not running at all. Computing in both
 * places would let the page and the widget disagree about when Maghrib is.
 *
 * Pure functions over their arguments: no Android UI types, no stored state, so
 * the whole thing is unit-testable on the JVM.
 */
object PrayerTimesEngine {

    /** Sunrise is displayed with the prayers but is not one; it never gets a
     *  reminder and is never the "next prayer" in the countdown. */
    /**
     * Minutes after sunrise at which Duha is reported.
     *
     * adhan-java does not compute Duha, and there is no single agreed value —
     * 20 and 24 are both in common use. 24 matches the timetable this page was
     * designed against, and lives here so the convention is stated once.
     */
    const val DUHA_AFTER_SUNRISE_MINUTES = 24

    /**
     * The daily timetable: the five prayers plus sunrise, in display order.
     *
     * This is the display-priority prefix used wherever a limited number of
     * slots must be filled from a larger, user-configurable set of visible
     * times (see PrayerWidgetProvider.selectForDisplay): these six names
     * always outrank the supplementary times (Duha, Midnight, Last third),
     * so a supplementary time can only ever occupy a slot this list left
     * spare — never one it needs. The five obligatory prayers must never be
     * displaced; this list's order also happens to put SUNRISE at rank 2
     * (interleaved between FAJR and DHUHR) rather than after the obligatory
     * five, which is what makes "all nine visible" resolve to "the five
     * prayers plus sunrise" rather than something else.
     */
    val DAILY_TIMETABLE = listOf(
        PrayerName.FAJR,
        PrayerName.SUNRISE,
        PrayerName.DHUHR,
        PrayerName.ASR,
        PrayerName.MAGHRIB,
        PrayerName.ISHA,
    )

    private val PRAYERS_ONLY = listOf(
        PrayerName.FAJR,
        PrayerName.DHUHR,
        PrayerName.ASR,
        PrayerName.MAGHRIB,
        PrayerName.ISHA,
    )

    /**
     * adhan-java exposes getParameters() as a method; the `.parameters`
     * property form belongs to the separate adhan-kotlin library. Verified
     * against the adhan-java README before this was written.
     *
     * Valid method values: "egyptian", "umm_al_qura", "muslim_world_league",
     * "karachi", "north_america", "dubai", "qatar", "kuwait", "singapore",
     * "moon_sighting_committee". Unknown or corrupt values default to Egyptian.
     */
    fun parametersFor(method: String, madhab: String): CalculationParameters {
        val params = when (method) {
            "umm_al_qura" -> CalculationMethod.UMM_AL_QURA.getParameters()
            "muslim_world_league" -> CalculationMethod.MUSLIM_WORLD_LEAGUE.getParameters()
            "karachi" -> CalculationMethod.KARACHI.getParameters()
            "north_america" -> CalculationMethod.NORTH_AMERICA.getParameters()
            "dubai" -> CalculationMethod.DUBAI.getParameters()
            "qatar" -> CalculationMethod.QATAR.getParameters()
            "kuwait" -> CalculationMethod.KUWAIT.getParameters()
            "singapore" -> CalculationMethod.SINGAPORE.getParameters()
            "moon_sighting_committee" -> CalculationMethod.MOON_SIGHTING_COMMITTEE.getParameters()
            else -> CalculationMethod.EGYPTIAN.getParameters()
        }
        params.madhab = if (madhab == "hanafi") Madhab.HANAFI else Madhab.SHAFI
        // Set explicitly for intent, even though this is adhan-java's default, to document
        // that high-latitude situations are intentionally handled via the library's rule.
        params.highLatitudeRule = HighLatitudeRule.MIDDLE_OF_THE_NIGHT
        return params
    }

    private fun computeFor(
        lat: Double,
        lng: Double,
        date: Date,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): PrayerTimes {
        val cal = Calendar.getInstance(tz)
        cal.time = date
        val components = DateComponents(
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH),
        )
        return PrayerTimes(
            Coordinates(lat, lng),
            components,
            parametersFor(method, madhab),
        )
    }

    fun timesFor(
        lat: Double,
        lng: Double,
        date: Date,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): DayTimes {
        val p = computeFor(lat, lng, date, method, madhab, tz)

        // SunnahTimes divides the night between sunset and the next dawn, so it
        // is only meaningful when the day actually produced times. Inside the
        // midnight-sun window adhan-java returns nulls throughout, and deriving
        // from those would invent a time rather than report absence.
        val sunnah = if (p.maghrib != null && p.fajr != null) {
            runCatching { SunnahTimes(p) }.getOrNull()
        } else {
            null
        }

        return DayTimes(
            mapOf(
                PrayerName.FAJR to p.fajr,
                PrayerName.SUNRISE to p.sunrise,
                PrayerName.DUHA to p.sunrise?.let {
                    Date(it.time + DUHA_AFTER_SUNRISE_MINUTES * 60_000L)
                },
                PrayerName.DHUHR to p.dhuhr,
                PrayerName.ASR to p.asr,
                PrayerName.MAGHRIB to p.maghrib,
                PrayerName.ISHA to p.isha,
                PrayerName.MIDNIGHT to sunnah?.middleOfTheNight,
                PrayerName.LAST_THIRD to sunnah?.lastThirdOfTheNight,
            ),
        )
    }

    /**
     * The next of the five prayers strictly after [now].
     *
     * Rolls to tomorrow's Fajr once today's Isha has passed, so the caller never
     * has to special-case the end of the day.
     *
     * Returns null if no next prayer can be determined (e.g., at high latitudes
     * during midnight sun when adhan-java cannot compute valid times). For a
     * religious obligation, unavailable is the correct answer, not a fabricated time.
     */
    fun nextAfter(
        now: Date,
        lat: Double,
        lng: Double,
        method: String,
        madhab: String,
        tz: TimeZone,
    ): NextPrayer? {
        val today = timesFor(lat, lng, now, method, madhab, tz)
        PRAYERS_ONLY.forEach { name ->
            val at = today.times[name]
            if (at != null && at.after(now)) return NextPrayer(name, at)
        }

        val cal = Calendar.getInstance(tz)
        cal.time = now
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val tomorrow = timesFor(lat, lng, cal.time, method, madhab, tz)
        val tomorrowFajr = tomorrow.times[PrayerName.FAJR]
        return if (tomorrowFajr != null) NextPrayer(PrayerName.FAJR, tomorrowFajr) else null
    }
}
