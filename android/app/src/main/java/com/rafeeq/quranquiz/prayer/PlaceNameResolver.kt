package com.rafeeq.quranquiz.prayer

import android.content.Context
import android.location.Geocoder
import android.util.Log
import java.util.Locale

/**
 * The human name for a set of coordinates.
 *
 * Android's Geocoder performs a NETWORK lookup — it returns an empty list
 * offline, and Geocoder.isPresent() is false where no backend exists at all.
 * So this is called once, when a location fix is stored, and the answer is
 * cached in PrayerConfig. It is never called to render a frame.
 *
 * The name is decoration on coordinates: the compass and the times are driven
 * entirely by lat/lng, and every failure here resolves to null, which the page
 * renders as its own title.
 */
object PlaceNameResolver {

    private const val TAG = "RafeeqPrayer"

    /**
     * The most human of the fields an Address carries, in descending
     * specificity. Blank strings count as absent: some backends return "".
     */
    fun pick(
        locality: String?,
        subAdminArea: String?,
        adminArea: String?,
        countryName: String?,
    ): String? =
        listOf(locality, subAdminArea, adminArea, countryName)
            .firstOrNull { !it.isNullOrBlank() }
            ?.trim()

    /**
     * Blocking network call — callers must be on a worker thread.
     * Returns null on any failure, which is a normal offline outcome.
     */
    @Suppress("DEPRECATION")
    fun resolve(ctx: Context, lat: Double, lng: Double, locale: Locale): String? {
        if (!Geocoder.isPresent()) return null
        return try {
            val addresses = Geocoder(ctx, locale).getFromLocation(lat, lng, 1)
            val a = addresses?.firstOrNull() ?: return null
            pick(a.locality, a.subAdminArea, a.adminArea, a.countryName)
        } catch (e: Exception) {
            // Offline, no backend, or a malformed response. All the same here:
            // the header simply falls back to the page title.
            Log.w(TAG, "reverse geocoding failed", e)
            null
        }
    }

    /**
     * Resolves the stored coordinates in English and Arabic and caches both,
     * so the widget can follow a device-language change without going back
     * to the network. Blocking — callers must be on a worker thread.
     *
     * A newer fix may land while this is on the network; writing then would
     * label the new coordinates with the old city, so the result is dropped
     * unless the coordinates still match.
     */
    fun resolveAndStore(ctx: Context, lat: Double, lng: Double) {
        val english = resolve(ctx, lat, lng, Locale.US)
        val arabic = resolve(ctx, lat, lng, Locale("ar"))
        val current = PrayerConfig.coords(ctx)
        if (current?.first == lat && current.second == lng) {
            PrayerConfig.setPlaceNames(ctx, english, arabic)
            PrayerWidgetProvider.refresh(ctx)
        }
    }
}
