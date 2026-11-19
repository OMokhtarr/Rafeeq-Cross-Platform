package com.rafeeq.quranquiz.prayer

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.chrono.HijrahDate

class FastingCalendarTest {

    /** Generated from the tracker's fastingOccasion(); see fastingParity.test.ts. */
    private val fixture: JSONObject by lazy {
        val text = javaClass.classLoader!!.getResource("fasting-occasions.json")!!.readText()
        JSONObject(text)
    }

    private fun hijri(year: Int, month: Int, day: Int): LocalDate =
        LocalDate.from(HijrahDate.of(year, month, day))

    @Test
    fun `occasionOn matches the tracker on every fixture day`() {
        val mismatches = fixture.keys().asSequence().mapNotNull { key ->
            val expected = if (fixture.isNull(key)) null else fixture.getString(key)
            val actual = FastingCalendar.occasionOn(LocalDate.parse(key))?.jsKey
            if (expected != actual) "$key: expected $expected, got $actual" else null
        }.toList()
        assertEquals(emptyList<String>(), mismatches)
        assertEquals(730, fixture.length())
    }

    @Test
    fun `no reminder for Ramadan`() {
        assertNull(FastingCalendar.reminderFor(hijri(1448, 9, 5)))
    }

    @Test
    fun `no reminder for Eid al-Fitr`() {
        assertNull(FastingCalendar.reminderFor(hijri(1448, 10, 1)))
    }

    @Test
    fun `Shawwal is announced for the 2nd only`() {
        assertEquals(FastingOccasion.SHAWWAL, FastingCalendar.reminderFor(hijri(1448, 10, 2)))
        assertEquals(FastingOccasion.WHITE_DAYS, FastingCalendar.reminderFor(hijri(1448, 10, 13)))
    }

    @Test
    fun `a Monday later in Shawwal is still a Monday`() {
        val monday = (3..12).map { hijri(1448, 10, it) }.first { it.dayOfWeek == DayOfWeek.MONDAY }
        assertEquals(FastingOccasion.MONDAY, FastingCalendar.reminderFor(monday))
    }

    @Test
    fun `an ordinary Shawwal weekday has no reminder`() {
        val tuesday = (3..12).map { hijri(1448, 10, it) }.first { it.dayOfWeek == DayOfWeek.TUESDAY }
        assertNull(FastingCalendar.reminderFor(tuesday))
    }

    @Test
    fun `Arafah, then nothing through Eid al-Adha and Tashreeq`() {
        assertEquals(FastingOccasion.ARAFAH, FastingCalendar.reminderFor(hijri(1448, 12, 9)))
        (10..13).forEach { assertNull(FastingCalendar.reminderFor(hijri(1448, 12, it))) }
    }

    @Test
    fun `a date outside the Hijri calendar's range has no occasion`() {
        assertNull(FastingCalendar.occasionOn(LocalDate.of(2200, 1, 1)))
        assertNull(FastingCalendar.reminderFor(LocalDate.of(2200, 1, 1)))
    }
}
