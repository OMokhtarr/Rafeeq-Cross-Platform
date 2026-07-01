package com.rafeeq.quranquiz.auto

import android.util.Log
import com.rafeeq.quranquiz.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * RafeeqQfApi — minimal native client for the Quran Foundation audio-timestamp endpoint.
 *
 * Used ONLY by the Android Auto native cold-start path to fetch the exact whole-surah audio
 * duration so the car's duration bar/timestamps are correct without the JS brain. The web/JS
 * path keeps using its own client (quran-api.client.ts); this mirrors just the token-broker
 * POST + the one GET we need.
 *
 * Auth: POST the token broker (holds the OAuth secret server-side) → {access_token, expires_in};
 * then GET the timestamp endpoint with authorization/x-auth-token/x-client-id headers. The
 * broker URL + client id come from BuildConfig (injected from the same root .env as the web
 * build), so there are no duplicated/hardcoded values.
 *
 * All calls are blocking and MUST run off the main thread (see RafeeqMediaService usage).
 */
object RafeeqQfApi {

    private const val TAG = "RafeeqQfApi"

    @Volatile private var cachedToken: String? = null
    @Volatile private var tokenExpiryMs: Long = 0L

    private fun configured(): Boolean =
        BuildConfig.QF_TOKEN_BROKER_URL.isNotEmpty() &&
            BuildConfig.QF_CONTENT_API_BASE.isNotEmpty()

    /** Get a cached access token, refreshing via the broker when missing/near expiry. */
    @Synchronized
    private fun getToken(forceRefresh: Boolean): String? {
        val now = System.currentTimeMillis()
        if (!forceRefresh) {
            val t = cachedToken
            if (t != null && tokenExpiryMs - 60_000 > now) return t
        }
        return try {
            val conn = (URL(BuildConfig.QF_TOKEN_BROKER_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = false
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "token broker HTTP $code")
                conn.disconnect()
                return null
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            val token = json.optString("access_token", "")
            val expiresIn = json.optLong("expires_in", 3600L)
            if (token.isEmpty()) return null
            cachedToken = token
            tokenExpiryMs = now + expiresIn * 1000L
            token
        } catch (e: Exception) {
            Log.w(TAG, "token fetch failed: ${e.message}")
            null
        }
    }

    /**
     * GET the timestamp endpoint and return its `result` object, or null on failure.
     * `query` is e.g. "chapter_number=20" or "verse_key=20:135". Handles auth headers and one
     * 401-retry (token refresh). The endpoint wants a CHAPTER-reciter id; for this app's reciters
     * that equals the numeric recitation id, so we resolve the slug → numeric id first.
     */
    private fun getTimestampResult(reciter: String, query: String): JSONObject? {
        if (!configured()) return null
        val reciterId = RafeeqAudioUrls.timestampReciterId(reciter) ?: return null
        val path = "/audio/reciters/$reciterId/timestamp?$query"

        // One retry: a 401 forces a token refresh.
        for (attempt in 0..1) {
            val token = getToken(forceRefresh = attempt > 0) ?: return null
            try {
                val conn = (URL(BuildConfig.QF_CONTENT_API_BASE + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("accept", "application/json")
                    setRequestProperty("authorization", "Bearer $token")
                    setRequestProperty("x-auth-token", token)
                    if (BuildConfig.QF_CLIENT_ID.isNotEmpty()) {
                        setRequestProperty("x-client-id", BuildConfig.QF_CLIENT_ID)
                    }
                }
                val code = conn.responseCode
                if (code == 401 && attempt == 0) { conn.disconnect(); continue }
                if (code !in 200..299) {
                    Log.w(TAG, "timestamp HTTP $code for $path")
                    conn.disconnect()
                    return null
                }
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                val root = JSONObject(body)
                // The timestamp fields come back EITHER nested under "result" (chapter_number)
                // OR at the top level (verse_key). Mirror the web client's `data.result ?? data`
                // so verse-level lookups (page-jump landing position) resolve correctly.
                return root.optJSONObject("result") ?: root
            } catch (e: Exception) {
                Log.w(TAG, "timestamp fetch failed: ${e.message}")
                return null
            }
        }
        return null
    }

    /**
     * Whole-surah audio duration in ms (timestamp_to - timestamp_from for the chapter).
     * Returns 0 on any failure (caller falls back to ExoPlayer durations).
     */
    fun fetchChapterDurationMs(reciter: String, chapter: Int): Long {
        val result = getTimestampResult(reciter, "chapter_number=$chapter") ?: return 0L
        val from = result.optLong("timestamp_from", 0L)
        val to = result.optLong("timestamp_to", 0L)
        return (to - from).coerceAtLeast(0L)
    }

    /**
     * The exact start (ms) of a verse on its surah's full timeline — i.e. timestamp_from for
     * verse_key "sura:aya". This is the CUMULATIVE position to land on when jumping to that verse
     * (e.g. a page's first ayah), so the duration bar lands accurately instead of using an
     * averaged estimate that overshoots. Returns -1 on failure (caller keeps its estimate).
     */
    fun fetchVerseStartMs(reciter: String, sura: Int, aya: Int): Long {
        val result = getTimestampResult(reciter, "verse_key=$sura:$aya") ?: return -1L
        if (!result.has("timestamp_from")) return -1L
        return result.optLong("timestamp_from", 0L).coerceAtLeast(0L)
    }
}
