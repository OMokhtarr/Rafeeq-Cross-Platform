package com.rafeeq.quranquiz.prayer

import android.hardware.GeomagneticField
import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.Qibla

/**
 * Direction to the Kaaba, and the correction a magnetic compass needs.
 *
 * adhan-java reports the bearing relative to TRUE north. A device compass
 * reports its heading relative to MAGNETIC north. Subtracting one from the
 * other without correcting for the local declination produces a needle wrong
 * by up to twenty degrees — so the correction happens here, once, rather than
 * being left to each consumer.
 *
 * GeomagneticField is part of the Android platform and works entirely offline:
 * it evaluates the World Magnetic Model from a built-in table.
 */
object QiblaEngine {

    /** Degrees clockwise from true north, 0 (inclusive) to 360 (exclusive). */
    fun bearing(lat: Double, lng: Double): Double =
        normalise(Qibla(Coordinates(lat, lng)).direction)

    /**
     * Local magnetic declination in degrees: positive where magnetic north
     * lies east of true north.
     */
    fun declination(lat: Double, lng: Double): Float =
        GeomagneticField(
            lat.toFloat(),
            lng.toFloat(),
            0f,
            System.currentTimeMillis(),
        ).declination

    /**
     * The bearing a magnetic compass needle should show — the true bearing
     * less the declination.
     */
    fun magneticBearing(lat: Double, lng: Double): Double =
        normalise(bearing(lat, lng) - declination(lat, lng))

    private fun normalise(degrees: Double): Double = ((degrees % 360.0) + 360.0) % 360.0
}
