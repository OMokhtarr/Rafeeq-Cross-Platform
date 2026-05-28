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
        var instance: RafeeqAutoPlugin? = null
    }

    override fun load() {
        instance = this
        // Start the media service so Android Auto can discover it
        val intent = Intent(context, RafeeqMediaService::class.java)
        context.startForegroundService(intent)
    }

    override fun handleOnDestroy() {
        instance = null
        super.handleOnDestroy()
    }

    // ── JS → Native ────────────────────────────────────────────────────────────

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

        Log.d("RafeeqAuto", "updatePlaybackState: markersArr=${markersArr?.length() ?: "null"} parsed=${pageMarkers?.size ?: "null"} page=$currentPage surah=$surahName")

        service.updateState(isPlaying, surahName, verseKey, reciterName, positionMs, durationMs, pageMarkers, currentPage)
        call.resolve()
    }

    // ── Native → JS ────────────────────────────────────────────────────────────

    /**
     * Called by RafeeqMediaService.SessionCallback to push car events to JS.
     * action: "play" | "pause" | "next" | "prev" | "stop" | "selectSurah"
     */
    fun sendCarEvent(action: String, reciter: String?, surah: Int?, aya: Int? = null) {
        val data = JSObject().apply {
            put("action", action)
            if (reciter != null) put("reciter", reciter)
            if (surah != null) put("surah", surah)
            if (aya != null) put("aya", aya)
        }
        notifyListeners("carAction", data)
    }
}
