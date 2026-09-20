package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PrayerConfig's storage needs a Context, which a JVM unit test does not have,
 * so what is tested here is the part that has no Android dependency: the
 * defaults that every consumer falls back to.
 */
class PrayerConfigTest {

    @Test
    fun `defaults are the egyptian method and the shafi madhab`() {
        assertEquals("egyptian", PrayerConfig.DEFAULT_METHOD)
        assertEquals("shafi", PrayerConfig.DEFAULT_MADHAB)
    }

    @Test
    fun `an unknown method still yields usable parameters`() {
        // Falls back rather than throwing: a corrupt stored value must never
        // stop the widget or an alarm from computing a time.
        val params = PrayerTimesEngine.parametersFor("not-a-method", "shafi")
        assertEquals(
            PrayerTimesEngine.parametersFor(PrayerConfig.DEFAULT_METHOD, "shafi").fajrAngle,
            params.fajrAngle,
            0.001,
        )
    }
}
