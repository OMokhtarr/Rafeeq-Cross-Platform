package com.rafeeq.quranquiz.auto

import android.content.Intent
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * RafeeqAutoPlugin — Capacitor bridge between JS and RafeeqMediaService.
 *
 * JS → Native:
 *   setContentTree(reciters, surahs)   — push browsable content to Android Auto
 *   updatePlaybackState(state)         — sync car display (title, playing/paused)
 *   jsReady()                         — JS signals listener is registered; flushes pending events
 *
 * Native → JS:
 *   'carAction' events fired by RafeeqMediaService.SessionCallback when the
 *   user interacts with car controls or selects a surah.
 *
 *   Event payload: { action: string, reciter?: string, surah?: number }
 */
@CapacitorPlugin(name = "RafeeqAuto")
class RafeeqAutoPlugin : Plugin() {

    companion object {
        @Volatile var instance: RafeeqAutoPlugin? = null

        // Pre-launch pending event: set by RafeeqMediaService when the plugin
        // instance doesn't exist yet (car event arrived before MainActivity started).
        // Picked up by load() and moved into the instance's pendingEvent slot.
        // Guarded by `lock` to prevent a race between the binder thread (service)
        // writing storePendingEvent and the main thread reading it in load().
        private val lock = Any()
        private var preLaunchPendingEvent: JSObject? = null

        fun storePendingEvent(
            action: String,
            reciter: String?,
            surah: Int?,
            aya: Int?,
            positionMs: Long?
        ) {
            val event = JSObject().apply {
                put("action", action)
                if (reciter != null) put("reciter", reciter)
                if (surah != null) put("surah", surah)
                if (aya != null) put("aya", aya)
                if (positionMs != null) put("positionMs", positionMs)
            }
            // If a live plugin instance already exists, deliver directly
            val live = instance
            if (live != null) {
                live.pendingEvent = event
                return
            }
            synchronized(lock) { preLaunchPendingEvent = event }
        }

        fun takePendingEvent(): JSObject? = synchronized(lock) {
            val e = preLaunchPendingEvent
            preLaunchPendingEvent = null
            e
        }
    }

    // Holds at most one pending event while JS is not yet ready (cold launch).
    // Only the latest event is kept — intermediate ones (e.g. double-tap) are dropped.
    @Volatile private var pendingEvent: JSObject? = null
    @Volatile private var jsReady = false

    override fun load() {
        instance = this
        jsReady = false
        // Pick up any event that arrived before the plugin was initialised
        // (e.g. car pressed play before MainActivity ever started).
        val pre = takePendingEvent()
        if (pre != null) {
            pendingEvent = pre
            Log.d("RafeeqAuto", "load: picked up pre-launch pending event: ${pre.getString("action")}")
        }
        // Start the media service so Android Auto can discover it
        val intent = Intent(context, RafeeqMediaService::class.java)
        context.startForegroundService(intent)
    }

    override fun handleOnDestroy() {
        instance = null
        jsReady = false
        pendingEvent = null
        super.handleOnDestroy()
    }

    // ── JS → Native ────────────────────────────────────────────────────────────

    /**
     * Called by JS (PlaybackContext) as soon as the carAction listener is registered.
     * Flushes any event that arrived before JS was ready.
     */
    @PluginMethod
    fun jsReady(call: PluginCall) {
        jsReady = true
        val pending = pendingEvent
        if (pending != null) {
            pendingEvent = null
            Log.d("RafeeqAuto", "jsReady: flushing pending event: ${pending.getString("action")}")
            // notifyListeners must run on the main thread; PluginMethod threads vary.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                notifyListeners("carAction", pending)
            }, 100)
        }
        call.resolve()
    }

    @PluginMethod
    fun setContentTree(call: PluginCall) {
        val service = RafeeqMediaService.instance
        if (service == null) {
            call.reject("MediaService not running")
            return
        }

        val recitersArr = call.getArray("reciters") ?: JSArray()
        val surahsArr = call.getArray("surahs") ?: JSArray()

        val reciters = (0 until recitersArr.length()).mapNotNull { i ->
            val obj = recitersArr.getJSONObject(i)
            val id = obj.optString("id").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val name = obj.optString("name", id)
            RafeeqMediaService.ReciterItem(id, name)
        }

        val surahs = (0 until surahsArr.length()).mapNotNull { i ->
            val obj = surahsArr.getJSONObject(i)
            val number = obj.optInt("number", -1).takeIf { it > 0 } ?: return@mapNotNull null
            val name = obj.optString("name", "Surah $number")
            val arabicName = obj.optString("arabicName", name)
            RafeeqMediaService.SurahItem(number, name, arabicName)
        }

        service.setReciters(reciters)
        service.setSurahs(surahs)
        call.resolve()
    }

    @PluginMethod
    fun updatePlaybackState(call: PluginCall) {
        val service = RafeeqMediaService.instance
        if (service == null) {
            call.reject("MediaService not running")
            return
        }

        val isPlaying = call.getBoolean("isPlaying") ?: false
        val surahName = call.getString("surahName") ?: ""
        val verseKey = call.getString("verseKey") ?: ""
        val reciterName = call.getString("reciterName") ?: ""
        val positionMs = (call.getDouble("positionMs") ?: 0.0).toLong()
        val durationMs = (call.getDouble("durationMs") ?: 0.0).toLong()
        val currentPage = call.getInt("currentPage") ?: 0

        val markersArr = call.getArray("pageMarkers")
        val pageMarkers = if (markersArr != null) {
            (0 until markersArr.length()).mapNotNull { i ->
                val obj = markersArr.getJSONObject(i)
                val page = obj.optInt("page", -1).takeIf { it > 0 } ?: return@mapNotNull null
                val aya = obj.optInt("aya", -1).takeIf { it > 0 } ?: return@mapNotNull null
                RafeeqMediaService.PageMarker(page, aya)
            }
        } else null

        val repeatPageActive = call.getBoolean("repeatPageActive") ?: false

        Log.d("RafeeqAuto", "updatePlaybackState: markersArr=${markersArr?.length() ?: "null"} parsed=${pageMarkers?.size ?: "null"} page=$currentPage surah=$surahName repeatPage=$repeatPageActive")

        service.updateState(isPlaying, surahName, verseKey, reciterName, positionMs, durationMs, pageMarkers, currentPage, repeatPageActive)
        call.resolve()
    }

    // ── Native → JS ────────────────────────────────────────────────────────────

    /**
     * Called by RafeeqMediaService.SessionCallback to push car events to JS.
     * action: "play" | "pause" | "next" | "prev" | "stop" | "selectSurah" | "seekTo" | "replayPage"
     *
     * If JS is not yet ready (cold launch), we:
     *  1. Wake MainActivity so the WebView initialises.
     *  2. Store the event — jsReady() will flush it once the listener is registered.
     * If JS is already ready, fire immediately (app was already in foreground/background-alive).
     */
    fun sendCarEvent(action: String, reciter: String?, surah: Int?, aya: Int? = null, positionMs: Long? = null) {
        val data = JSObject().apply {
            put("action", action)
            if (reciter != null) put("reciter", reciter)
            if (surah != null) put("surah", surah)
            if (aya != null) put("aya", aya)
            if (positionMs != null) put("positionMs", positionMs)
        }

        if (jsReady) {
            // JS listener is live. Store the event as pending before waking the activity —
            // if wakeActivity() causes a re-create (activity was killed), the new instance's
            // load() will pick it up. If the activity stays alive, jsReady() won't be called
            // again and we fire via notifyListeners after the delay.
            pendingEvent = data
            wakeActivity()
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                // Only fire if this instance is still live and jsReady (not replaced by a new one)
                if (jsReady && pendingEvent === data) {
                    pendingEvent = null
                    notifyListeners("carAction", data)
                }
            }, 200)
        } else {
            // Cold launch — wake the activity and queue the event.
            // jsReady() called from JS will flush it once the listener is registered.
            Log.d("RafeeqAuto", "sendCarEvent: JS not ready, queuing '$action'")
            pendingEvent = data
            wakeActivity()
        }
    }

    private fun wakeActivity() {
        // FLAG_ACTIVITY_REORDER_TO_FRONT is ignored when combined with FLAG_ACTIVITY_NEW_TASK
        // on many Android versions. With launchMode="singleTask" in the manifest, NEW_TASK
        // alone is sufficient to bring the existing task to the front without recreating it.
        val launchIntent = Intent(context, com.rafeeq.quranquiz.MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        context.startActivity(launchIntent)
    }
}
