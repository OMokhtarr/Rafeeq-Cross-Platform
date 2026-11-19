package com.rafeeq.quranquiz.prayer

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.chrono.HijrahDate
import java.time.temporal.ChronoField

/** A day worth fasting, keyed as the web tracker names it ([jsKey]). */
enum class FastingOccasion(val jsKey: String) {
    RAMADAN("ramadan"),
    ARAFAH("arafah"),
    ASHURA("ashura"),
    TASUA("tasua"),
    SHAWWAL("shawwal"),
    WHITE_DAYS("whiteDays"),
    MONDAY("monday"),
    THURSDAY("thursday"),
}

/**
 * Which civil days are fasting days, by the Umm al-Qura calendar the rest of
 * the app shows (java.time's HijrahDate is Umm al-Qura, as is the web's
 * `islamic-umalqura` Intl calendar).
 *
 * [occasionOn] is a port of the tracker's `fastingOccasion()`
 * (src/app/features/tracker/trackerLogic.ts); both are checked against the
 * same fixture, so change them together.
 */
object FastingCalendar {

    private const val MUHARRAM = 1
    private const val RAMADAN_MONTH = 9
    private const val SHAWWAL_MONTH = 10
    private const val DHUL_HIJJAH = 12

    /** The day the six of Shawwal can start, right after Eid al-Fitr. */
    private const val SHAWWAL_ANNOUNCE_DAY = 2

    private data class Hijri(val month: Int, val day: Int)

    /** Null outside the range HijrahDate covers, rather than throwing. */
    private fun hijri(date: LocalDate): Hijri? = runCatching {
        val h = HijrahDate.from(date)
        Hijri(h.get(ChronoField.MONTH_OF_YEAR), h.get(ChronoField.DAY_OF_MONTH))
    }.getOrNull()

    private fun isForbidden(h: Hijri): Boolean =
        (h.month == SHAWWAL_MONTH && h.day == 1) ||
            (h.month == DHUL_HIJJAH && h.day in 10..13)

    /** White Days, then Monday, then Thursday: the occasions any month has. */
    private fun ordinary(date: LocalDate, h: Hijri): FastingOccasion? = when {
        h.day in 13..15 -> FastingOccasion.WHITE_DAYS
        date.dayOfWeek == DayOfWeek.MONDAY -> FastingOccasion.MONDAY
        date.dayOfWeek == DayOfWeek.THURSDAY -> FastingOccasion.THURSDAY
        else -> null
    }

    /** The tracker's occasion for [date], Ramadan included. */
    fun occasionOn(date: LocalDate): FastingOccasion? {
        val h = hijri(date) ?: return null
        if (isForbidden(h)) return null
        return when {
            h.month == RAMADAN_MONTH -> FastingOccasion.RAMADAN
            h.month == DHUL_HIJJAH && h.day == 9 -> FastingOccasion.ARAFAH
            h.month == MUHARRAM && h.day == 10 -> FastingOccasion.ASHURA
            h.month == MUHARRAM && h.day == 9 -> FastingOccasion.TASUA
            h.month == SHAWWAL_MONTH -> FastingOccasion.SHAWWAL
            else -> ordinary(date, h)
        }
    }

    /**
     * What the evening-before reminder announces for [date], or null for none.
     *
     * Ramadan is obligatory, so it is never reminded. Shawwal is announced
     * once, for its 2nd; the rest of the month falls back to the ordinary
     * occasions instead of the tracker's blanket "shawwal", which would
     * otherwise hide every Monday and White Day in it.
     */
    fun reminderFor(date: LocalDate): FastingOccasion? {
        val occasion = occasionOn(date) ?: return null
        return when (occasion) {
            FastingOccasion.RAMADAN -> null
            FastingOccasion.SHAWWAL -> {
                val h = hijri(date) ?: return null
                if (h.day == SHAWWAL_ANNOUNCE_DAY) FastingOccasion.SHAWWAL else ordinary(date, h)
            }
            else -> occasion
        }
    }
}
