package com.rafeeq.quranquiz.prayer

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * RafeeqPrayerPlugin — Capacitor bridge between JS and PrayerTimesEngine.
 *
 * JS → Native:
 *   getTimes({ date? })            — today's six times plus the next prayer
 *   setLocation({ lat, lng })      — store coordinates for every consumer
 *   getConfig() / setConfig({...}) — calculation method and madhab
 *
 * The web layer never computes prayer times itself; this is the only path.
 * Mirrors RafeeqAutoPlugin's shape, which bridges JS to the media service.
 */
@CapacitorPlugin(name = "RafeeqPrayer")
class RafeeqPrayerPlugin : Plugin() {

    private fun iso(date: Date): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(date)
    }

    @PluginMethod
    fun getTimes(call: PluginCall) {
        val ctx = context
        val coords = PrayerConfig.coords(ctx)
        val result = JSObject()

        if (coords == null) {
            // Not an error: a first run before location is granted is a normal
            // state the page renders as a prompt.
            result.put("hasLocation", false)
            call.resolve(result)
            return
        }

        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getDefault()
        val date = call.getString("date")?.let { raw ->
            runCatching {
                SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = tz }.parse(raw)
            }.getOrNull()
        } ?: Date()

        val day = PrayerTimesEngine.timesFor(lat, lng, date, method, madhab, tz)
        val times = JSObject()
        day.times.forEach { (name, at) ->
            if (at != null) times.put(name.name.lowercase(), iso(at))
        }

        // Null where the sun never sets: adhan-java returns no times inside the
        // midnight-sun window, so `next` is simply absent rather than invented.
        val next = PrayerTimesEngine.nextAfter(Date(), lat, lng, method, madhab, tz)
        if (next != null) {
            val nextObj = JSObject()
            nextObj.put("name", next.name.name.lowercase())
            nextObj.put("at", iso(next.at))
            result.put("next", nextObj)
        }

        result.put("hasLocation", true)
        result.put("times", times)
        call.resolve(result)
    }

    @PluginMethod
    fun setLocation(call: PluginCall) {
        val lat = call.getDouble("lat")
        val lng = call.getDouble("lng")
        if (lat == null || lng == null) {
            call.reject("lat and lng are required")
            return
        }
        PrayerConfig.setCoords(context, lat, lng)
        call.resolve()
    }

    @PluginMethod
    fun getConfig(call: PluginCall) {
        val result = JSObject()
        result.put("method", PrayerConfig.method(context))
        result.put("madhab", PrayerConfig.madhab(context))
        val coords = PrayerConfig.coords(context)
        result.put("hasLocation", coords != null)
        call.resolve(result)
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        call.getString("method")?.let { PrayerConfig.setMethod(context, it) }
        call.getString("madhab")?.let { PrayerConfig.setMadhab(context, it) }
        call.resolve()
    }

    @PluginMethod
    fun getReminders(call: PluginCall) {
        val result = JSObject()
        result.put("enabled", PrayerConfig.remindersEnabled(context))
        result.put("prayers", JSArray.from(PrayerConfig.enabledPrayers(context).toTypedArray()))
        call.resolve(result)
    }

    @PluginMethod
    fun setReminders(call: PluginCall) {
        call.getBoolean("enabled")?.let {
            PrayerConfig.setRemindersEnabled(context, it)
        }
        call.getArray("prayers")?.let { arr ->
            PrayerConfig.setEnabledPrayers(context, arr.toList<String>().toSet())
        }
        if (PrayerConfig.remindersEnabled(context)) {
            PrayerAlarmScheduler.scheduleNext(context)
        } else {
            PrayerAlarmScheduler.cancelAll(context)
        }
        call.resolve()
    }
}
