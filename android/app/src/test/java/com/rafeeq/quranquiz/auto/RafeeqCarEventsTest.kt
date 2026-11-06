package com.rafeeq.quranquiz.auto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RafeeqCarEventsTest {

    @Test
    fun `player reports never open the app`() {
        for (action in listOf("nativePosition", "nativePlaying", "nativeTrackEnded", "nativeIntroEnded", "setSpeed")) {
            assertTrue(action, RafeeqCarEvents.isBrainOnly(action))
        }
    }

    @Test
    fun `commands from the car or notification may still open the app`() {
        for (action in listOf("play", "pause", "next", "prev", "stop", "selectSurah", "seekTo", "replayPage", "jumpToAya")) {
            assertFalse(action, RafeeqCarEvents.isBrainOnly(action))
        }
    }

    @Test
    fun `a surah item carries the reciter of the folder it was listed under`() {
        val selection = RafeeqCarEvents.parseSurahMediaId(RafeeqCarEvents.surahMediaId(18, "abdul_basit_murattal"))
        assertEquals(RafeeqCarEvents.SurahSelection(18, "abdul_basit_murattal"), selection)
    }

    @Test
    fun `items from the same folder list keep their own reciter however folders were browsed`() {
        val alafasy = RafeeqCarEvents.surahMediaId(2, "alafasy")
        val sudais = RafeeqCarEvents.surahMediaId(2, "sudais")
        assertEquals("alafasy", RafeeqCarEvents.parseSurahMediaId(alafasy)?.reciter)
        assertEquals("sudais", RafeeqCarEvents.parseSurahMediaId(sudais)?.reciter)
    }

    @Test
    fun `an item saved by an older version still plays, with no reciter of its own`() {
        assertEquals(RafeeqCarEvents.SurahSelection(18, null), RafeeqCarEvents.parseSurahMediaId("surah:18"))
    }

    @Test
    fun `anything else is not a surah`() {
        assertNull(RafeeqCarEvents.parseSurahMediaId("reciter:7"))
        assertNull(RafeeqCarEvents.parseSurahMediaId("surah:oops"))
        assertNull(RafeeqCarEvents.parseSurahMediaId("surah:"))
    }
}
