package com.rafeeq.quranquiz.prayer

import android.Manifest
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * RafeeqPrayerPlugin — Capacitor bridge between JS and PrayerTimesEngine.
 *
 * JS → Native:
 *   getTimes({ date? })                  — today's six times plus the next prayer
 *   setLocation({ lat, lng })            — store coordinates for every consumer
 *   getConfig() / setConfig({...})       — calculation method and madhab
 *   requestNotificationPermission()      — runtime POST_NOTIFICATIONS request (Android 13+)
 *   getQibla()                           — qibla bearing (true and magnetic) for the stored location
 *   getPlace()                           — cached place name for the stored location, or null
 *   locationServicesEnabled()            — whether device location services are on
 *   getVisibleTimes() / setVisibleTimes({...}) — which prayer times the user wants shown
 *   getWidgetInfo()                      — whether the launcher can pin, and how many are placed
 *   requestPinWidget()                   — asks the launcher to add the widget to the home screen
 *
 * The web layer never computes prayer times itself; this is the only path.
 * Mirrors RafeeqAutoPlugin's shape, which bridges JS to the media service.
 */
@CapacitorPlugin(
    name = "RafeeqPrayer",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ],
)
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
        // Coordinates first and synchronously: they drive the times, the
        // compass and the widget. This also clears any previously cached name.
        PrayerConfig.setCoords(context, lat, lng)
        PrayerAlarmScheduler.scheduleMidnightRoll(context)
        PrayerWidgetProvider.refresh(context)

        // The name is best-effort decoration, and Geocoder blocks on the
        // network — so it never delays the call the page is awaiting.
        val ctx = context
        val locale = Locale.getDefault()
        Thread {
            val name = PlaceNameResolver.resolve(ctx, lat, lng, locale)
            // A newer fix may have landed while this lookup was on the
            // network. Writing then would label the new coordinates with the
            // old city, so the result is dropped unless it still belongs.
            val current = PrayerConfig.coords(ctx)
            if (name != null && current?.first == lat && current.second == lng) {
                PrayerConfig.setPlaceName(ctx, name)
            }
        }.start()

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
        PrayerWidgetProvider.refresh(context)
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

    /**
     * Requests POST_NOTIFICATIONS at runtime (Android 13+). Without this, the
     * manifest declaration alone leaves the permission DENIED by default on
     * API 33+, and PrayerAlarmReceiver's notify() is silently discarded — the
     * alarm fires, but the user never sees a reminder.
     *
     * Below API 33 the permission doesn't exist and is implicitly granted, so
     * we resolve true immediately without touching the permission system.
     */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            val result = JSObject()
            result.put("granted", true)
            call.resolve(result)
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            val result = JSObject()
            result.put("granted", true)
            call.resolve(result)
            return
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    /**
     * The qibla direction for the stored location.
     *
     * Resolves hasLocation:false rather than rejecting when no coordinates are
     * stored — the same designed state getTimes uses, which the page renders as
     * its permission prompt.
     */
    @PluginMethod
    fun getQibla(call: PluginCall) {
        val result = JSObject()
        val coords = PrayerConfig.coords(context)
        if (coords == null) {
            result.put("hasLocation", false)
            call.resolve(result)
            return
        }
        val (lat, lng) = coords
        result.put("hasLocation", true)
        result.put("bearing", QiblaEngine.bearing(lat, lng))
        result.put("magneticBearing", QiblaEngine.magneticBearing(lat, lng))
        result.put("declination", QiblaEngine.declination(lat, lng).toDouble())
        call.resolve(result)
    }

    /**
     * The cached place name, or null. Never triggers a lookup: the name is
     * resolved when a fix is stored, because Geocoder is a network call.
     */
    @PluginMethod
    fun getPlace(call: PluginCall) {
        val result = JSObject()
        result.put("name", PrayerConfig.placeName(context))
        call.resolve(result)
    }

    /**
     * Whether the device's location services are switched on.
     *
     * This is a different question from whether the app holds the permission,
     * and it has a different remedy: a user who has granted the permission but
     * disabled GPS cannot fix anything by being asked to grant it again.
     */
    @PluginMethod
    fun locationServicesEnabled(call: PluginCall) {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val enabled = lm != null && (
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            )
        val result = JSObject()
        result.put("enabled", enabled)
        call.resolve(result)
    }

    @PluginMethod
    fun getVisibleTimes(call: PluginCall) {
        val result = JSObject()
        result.put("times", JSArray.from(PrayerConfig.visibleTimes(context).toTypedArray()))
        call.resolve(result)
    }

    @PluginMethod
    fun setVisibleTimes(call: PluginCall) {
        val arr = call.getArray("times")
        if (arr == null) {
            call.reject("times is required")
            return
        }
        PrayerConfig.setVisibleTimes(context, arr.toList<String>().toSet())
        // The widget renders the same set, so it must not lag the app.
        PrayerWidgetProvider.refresh(context)
        call.resolve()
    }

    /**
     * Whether the home-screen widget can be offered from inside the app.
     *
     * Pinning is the launcher's decision, not ours: `requestPinAppWidget` is
     * a request the launcher may simply not implement, and there is no way to
     * force it. The page hides its button entirely when this is false rather
     * than showing a control that cannot do anything — the user can still add
     * the widget the ordinary way, by long-pressing the home screen.
     *
     * Also reports how many instances are already placed, so the page can say
     * so; that is a label, never a reason to disable the button, because
     * Android allows more than one copy of a widget.
     */
    @PluginMethod
    fun getWidgetInfo(call: PluginCall) {
        val result = JSObject()
        val mgr = AppWidgetManager.getInstance(context)
        // getInstance can return null on a device with no app-widget host at
        // all (rare, but real on some TV and headless builds). Treating that
        // as "unsupported" is exactly right.
        if (mgr == null) {
            result.put("supported", false)
            result.put("placed", 0)
            call.resolve(result)
            return
        }
        result.put("supported", mgr.isRequestPinAppWidgetSupported)
        result.put(
            "placed",
            mgr.getAppWidgetIds(
                ComponentName(context, PrayerWidgetProvider::class.java),
            ).size,
        )
        call.resolve(result)
    }

    /**
     * Asks the launcher to pin the prayer widget to the home screen.
     *
     * Resolves `requested: true` once the launcher has been asked — not once
     * the widget exists. The launcher owns the confirmation dialog and never
     * reports the outcome back, so claiming placement here would be a lie the
     * page would then have to display.
     */
    @PluginMethod
    fun requestPinWidget(call: PluginCall) {
        val result = JSObject()
        val mgr = AppWidgetManager.getInstance(context)
        if (mgr == null || !mgr.isRequestPinAppWidgetSupported) {
            result.put("requested", false)
            call.resolve(result)
            return
        }
        val provider = ComponentName(context, PrayerWidgetProvider::class.java)
        // No success callback is passed: the launcher's own dialog is the
        // confirmation, and a PendingIntent here would only tell us what the
        // user already saw happen.
        val requested = runCatching { mgr.requestPinAppWidget(provider, null, null) }
            .getOrDefault(false)
        result.put("requested", requested)
        call.resolve(result)
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val result = JSObject()
        result.put("granted", granted)
        call.resolve(result)
    }
}
