package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * Reference bearings are great-circle initial bearings to the Kaaba
 * (21.4225N, 39.8262E), computed independently of adhan-java. A one-degree
 * tolerance absorbs the difference between spherical and ellipsoidal models.
 */
class QiblaEngineTest {

    private fun assertDegreesClose(expected: Double, actual: Double, label: String) {
        // Compare on the circle: 359.5 and 0.5 are one degree apart, not 359.
        val diff = abs((expected - actual + 540.0) % 360.0 - 180.0)
        assertTrue("$label: expected about $expected but was $actual", diff <= 1.0)
    }

    @Test
    fun `cairo faces south-east toward the kaaba`() {
        assertDegreesClose(136.14, QiblaEngine.bearing(30.0444, 31.2357), "Cairo")
    }

    @Test
    fun `jakarta faces north-west toward the kaaba`() {
        assertDegreesClose(295.15, QiblaEngine.bearing(-6.2088, 106.8456), "Jakarta")
    }

    @Test
    fun `london faces south-east toward the kaaba`() {
        assertDegreesClose(118.99, QiblaEngine.bearing(51.5074, -0.1278), "London")
    }

    @Test
    fun `a point due north of mecca faces due south`() {
        // Same meridian, higher latitude: the great circle runs straight down it.
        assertDegreesClose(180.0, QiblaEngine.bearing(40.0, 39.8262), "due north of Mecca")
    }

    @Test
    fun `bearings are always normalised to the zero-to-360 range`() {
        listOf(
            30.0444 to 31.2357,
            -6.2088 to 106.8456,
            51.5074 to -0.1278,
            -33.8688 to 151.2093,
            64.1466 to -21.9426,
        ).forEach { (lat, lng) ->
            val b = QiblaEngine.bearing(lat, lng)
            assertTrue("bearing at $lat,$lng was $b", b >= 0.0 && b < 360.0)
        }
    }

    @Test
    fun `magnetic bearing differs from true bearing by the declination`() {
        val lat = 30.0444
        val lng = 31.2357
        val trueBearing = QiblaEngine.bearing(lat, lng)
        val magnetic = QiblaEngine.magneticBearing(lat, lng)
        val decl = QiblaEngine.declination(lat, lng)

        val expected = (trueBearing - decl + 360.0) % 360.0
        assertEquals(expected, magnetic, 0.001)
    }

    @Test
    fun `magnetic bearing is also normalised`() {
        val b = QiblaEngine.magneticBearing(64.1466, -21.9426) // Reykjavik: large declination
        assertTrue("magnetic bearing was $b", b >= 0.0 && b < 360.0)
    }
}
