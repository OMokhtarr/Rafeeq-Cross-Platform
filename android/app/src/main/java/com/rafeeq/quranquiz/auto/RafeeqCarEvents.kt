package com.rafeeq.quranquiz.auto

/** Rules for what passes between the car, the media service and the JS brain. */
object RafeeqCarEvents {

    private const val SURAH_PREFIX = "surah:"

    data class SurahSelection(val surah: Int, val reciter: String?)

    /**
     * A surah's id in the car's browse tree. It names the reciter of the folder it's listed under:
     * Android Auto keeps folders cached, and reloads them when the app opens, so "the folder loaded
     * last" says nothing about which folder an item was picked from.
     */
    fun surahMediaId(surah: Int, reciter: String): String = "$SURAH_PREFIX$surah:$reciter"

    /** Null if this isn't a surah item. [SurahSelection.reciter] is null for an id with none. */
    fun parseSurahMediaId(mediaId: String): SurahSelection? {
        if (!mediaId.startsWith(SURAH_PREFIX)) return null
        val parts = mediaId.removePrefix(SURAH_PREFIX).split(":", limit = 2)
        val surah = parts[0].toIntOrNull() ?: return null
        return SurahSelection(surah, parts.getOrNull(1)?.takeIf { it.isNotEmpty() })
    }

    private val BRAIN_ONLY = setOf(
        "nativePosition",
        "nativePlaying",
        "nativeTrackEnded",
        "nativeIntroEnded",
        "setSpeed",
    )

    /**
     * True for reports that only matter to a brain that is already running. They are dropped when
     * there's none and must never open the app. Some fire every second while playing, so routing
     * them through the wake path relaunches the activity and overwrites pending user commands.
     */
    fun isBrainOnly(action: String): Boolean = action in BRAIN_ONLY
}
