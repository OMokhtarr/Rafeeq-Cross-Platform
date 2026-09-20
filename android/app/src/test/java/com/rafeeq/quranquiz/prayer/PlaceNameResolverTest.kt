package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Only `pick` is covered: the Geocoder call itself needs a Context and a
 * network, neither of which a JVM unit test has. The field-priority choice is
 * where the judgement lives, so that is what is pinned here.
 */
class PlaceNameResolverTest {

    @Test
    fun `prefers the locality, which is the city a user recognises`() {
        assertEquals(
            "Cairo",
            PlaceNameResolver.pick("Cairo", "Cairo Governorate", "Cairo", "Egypt"),
        )
    }

    @Test
    fun `falls back through sub-admin, admin, then country`() {
        assertEquals(
            "Cairo Governorate",
            PlaceNameResolver.pick(null, "Cairo Governorate", "Cairo", "Egypt"),
        )
        assertEquals("Cairo", PlaceNameResolver.pick(null, null, "Cairo", "Egypt"))
        assertEquals("Egypt", PlaceNameResolver.pick(null, null, null, "Egypt"))
    }

    @Test
    fun `treats a blank field as absent rather than showing an empty header`() {
        // Some geocoder backends return "" instead of null; a header reading
        // "" would look like a rendering bug to a user.
        assertEquals("Egypt", PlaceNameResolver.pick("", "   ", null, "Egypt"))
    }

    @Test
    fun `yields null when nothing is known, so the caller can fall back`() {
        assertNull(PlaceNameResolver.pick(null, null, null, null))
    }

    @Test
    fun `trims surrounding whitespace so layout is not thrown off`() {
        assertEquals("Cairo", PlaceNameResolver.pick("  Cairo  ", null, null, null))
    }
}
