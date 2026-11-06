package com.rafeeq.quranquiz.auto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RafeeqAudioUrlsQueueKeysTest {

    private val opaque = listOf("https://cdn/a.mp3", "https://cdn/b.mp3")

    @Test
    fun `a stored range is returned as its own verses`() {
        assertEquals(
            listOf("2:142", "2:143"),
            RafeeqAudioUrls.queueVerseKeys("2:142,2:143", sura = 2, urls = opaque),
        )
    }

    @Test
    fun `a range across surahs keeps each verse's own surah`() {
        assertEquals(
            listOf("1:7", "2:1"),
            RafeeqAudioUrls.queueVerseKeys("1:7,2:1", sura = 1, urls = opaque),
        )
    }

    @Test
    fun `stored verses that do not line up with the urls are not trusted`() {
        assertNull(RafeeqAudioUrls.queueVerseKeys("2:142,2:143,2:144", sura = 2, urls = opaque))
    }

    @Test
    fun `stored verses stand alone when their urls could not be built yet`() {
        assertEquals(
            listOf("2:142", "2:143"),
            RafeeqAudioUrls.queueVerseKeys("2:142,2:143", sura = 2, urls = emptyList()),
        )
    }

    @Test
    fun `a range saved without verses is named from its CDN urls`() {
        assertEquals(
            listOf("2:142", "2:143"),
            RafeeqAudioUrls.queueVerseKeys(
                "",
                sura = 2,
                urls = listOf(
                    "https://verses.quran.foundation/Alafasy/mp3/002142.mp3",
                    "https://verses.quran.foundation/Alafasy/mp3/002143.mp3",
                ),
            ),
        )
    }

    @Test
    fun `a range saved without verses is named from its cached file names`() {
        assertEquals(
            listOf("2:142", "114:6"),
            RafeeqAudioUrls.queueVerseKeys(
                "",
                sura = 2,
                urls = listOf(
                    "file:///data/user/0/app/files/quran-audio/abdul_basit_murattal_2_142.mp3",
                    "file:///data/user/0/app/files/quran-audio/9_114_6.mp3",
                ),
            ),
        )
    }

    @Test
    fun `a mix of cached files and CDN urls is named`() {
        assertEquals(
            listOf("2:142", "2:143"),
            RafeeqAudioUrls.queueVerseKeys(
                "",
                sura = 2,
                urls = listOf(
                    "file:///x/quran-audio/9_2_142.mp3",
                    "https://verses.quran.foundation/Minshawi/Murattal/mp3/002143.mp3",
                ),
            ),
        )
    }

    @Test
    fun `urls with no verse in them and a full surah's count mean that whole surah`() {
        assertEquals(
            listOf("1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7"),
            RafeeqAudioUrls.queueVerseKeys("", sura = 1, urls = List(7) { "https://cdn/$it" }),
        )
    }

    @Test
    fun `urls with no verse in them and too few for the surah cannot be named`() {
        assertNull(RafeeqAudioUrls.queueVerseKeys("", sura = 2, urls = opaque))
    }

    @Test
    fun `one url that cannot be read makes the whole range unnamed`() {
        assertNull(
            RafeeqAudioUrls.queueVerseKeys(
                "",
                sura = 2,
                urls = listOf("https://cdn/002142.mp3", "https://cdn/mystery.mp3"),
            ),
        )
    }

    @Test
    fun `a number that is not a real verse is not read as one`() {
        assertNull(RafeeqAudioUrls.verseKeyFromUrl("https://cdn/115001.mp3"))
        assertNull(RafeeqAudioUrls.verseKeyFromUrl("https://cdn/001008.mp3"))
        assertNull(RafeeqAudioUrls.verseKeyFromUrl("https://cdn/001000.mp3"))
    }

    @Test
    fun `nothing stored and no urls cannot be named`() {
        assertNull(RafeeqAudioUrls.queueVerseKeys("", sura = 1, urls = emptyList()))
    }

    @Test
    fun `a known reciter's queue gets its urls in queue order`() {
        assertEquals(
            listOf(
                "https://verses.quran.foundation/Alafasy/mp3/002142.mp3",
                "https://verses.quran.foundation/Alafasy/mp3/003001.mp3",
            ),
            RafeeqAudioUrls.buildQueueUrls("7", "2:142,3:1"),
        )
    }

    @Test
    fun `an unknown reciter gets no urls rather than the default reciter's voice`() {
        assertTrue(RafeeqAudioUrls.buildQueueUrls("999", "2:142,2:143").isEmpty())
    }

    @Test
    fun `every reciter in the in-app catalog has its own urls`() {
        val cases = mapOf(
            "10" to "https://verses.quran.foundation/Shuraym/mp3/002142.mp3",
            "11" to "https://mirrors.quranicaudio.com/everyayah/Mohammad_al_Tablaway_128kbps/002142.mp3",
            "12" to "https://mirrors.quranicaudio.com/everyayah/Husary_Muallim_128kbps/002142.mp3",
            "6" to "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/002142.mp3",
        )
        for ((reciter, url) in cases) {
            assertEquals(reciter, listOf(url), RafeeqAudioUrls.buildQueueUrls(reciter, "2:142"))
        }
    }

    @Test
    fun `a malformed verse list gets no urls`() {
        assertTrue(RafeeqAudioUrls.buildQueueUrls("7", "2:142,oops").isEmpty())
        assertTrue(RafeeqAudioUrls.buildQueueUrls("7", "").isEmpty())
    }
}
