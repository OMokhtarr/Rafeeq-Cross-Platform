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
     * Whole-surah audio duration in ms for a reciter, via /audio/reciters/{id}/timestamp
     * ?chapter_number=N (timestamp_to - timestamp_from). The endpoint wants a CHAPTER-reciter
     * id; for this app's reciters that equals the numeric recitation id, so we resolve the
     * slug → numeric id first. Returns 0 on any failure (caller falls back to ExoPlayer durations).
     */
    fun fetchChapterDurationMs(reciter: String, chapter: Int): Long {
        if (!configured()) return 0L
        val reciterId = RafeeqAudioUrls.timestampReciterId(reciter) ?: return 0L
        val path = "/audio/reciters/$reciterId/timestamp?chapter_number=$chapter"

        // One retry: a 401 forces a token refresh.
        for (attempt in 0..1) {
            val token = getToken(forceRefresh = attempt > 0) ?: return 0L
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
                    return 0L
                }
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                val result = JSONObject(body).optJSONObject("result") ?: return 0L
                val from = result.optLong("timestamp_from", 0L)
                val to = result.optLong("timestamp_to", 0L)
                return (to - from).coerceAtLeast(0L)
            } catch (e: Exception) {
                Log.w(TAG, "timestamp fetch failed: ${e.message}")
                return 0L
            }
        }
        return 0L
    }
}
