package com.rafeeq.quranquiz.prayer

import android.Manifest
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
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
 *   getConfig() / setConfig({...})       — method, madhab and clock format
 *   requestNotificationPermission()      — runtime POST_NOTIFICATIONS request (Android 13+)
 *   getQibla()                           — qibla bearing (true and magnetic) for the stored location
 *   getPlace()                           — cached place name for the stored location, or null
 *   locationServicesEnabled()            — whether device location services are on
 *   getVisibleTimes() / setVisibleTimes({...}) — which prayer times the user wants shown
 *   getWidgetInfo()                      — whether the launcher can pin, and how many are placed
 *   requestPinWidget()                   — asks the launcher to add the widget to the home screen
 *   openAppSettings()                    — this app's settings page, for launcher-gated permissions
 *   openHomeScreen()                     — leaves the app so the placed widget is visible
 *   openWidgetSettings()                 — the placed widget's appearance screen
 *   promptEnableLocation()               — the system dialog that turns location on in place
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

    /** The call waiting on the turn-on-location dialog, answered by [enableLocationLauncher]. */
    private var pendingEnableCall: PluginCall? = null
    private lateinit var enableLocationLauncher: ActivityResultLauncher<IntentSenderRequest>

    // Registered in load(), which runs during the activity's onCreate — the
    // only point an activity accepts a new result launcher.
    override fun load() {
        enableLocationLauncher = activity.registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult(),
        ) { result ->
            val call = pendingEnableCall ?: return@registerForActivityResult
            pendingEnableCall = null
            call.resolve(JSObject().put("enabled", result.resultCode == android.app.Activity.RESULT_OK))
        }
    }

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
        Thread { PlaceNameResolver.resolveAndStore(ctx, lat, lng) }.start()

        call.resolve()
    }

    @PluginMethod
    fun getConfig(call: PluginCall) {
        val result = JSObject()
        result.put("method", PrayerConfig.method(context))
        result.put("madhab", PrayerConfig.madhab(context))
        result.put("use24Hour", PrayerConfig.use24Hour(context))
        val coords = PrayerConfig.coords(context)
        result.put("hasLocation", coords != null)
        call.resolve(result)
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        call.getString("method")?.let { PrayerConfig.setMethod(context, it) }
        call.getString("madhab")?.let { PrayerConfig.setMadhab(context, it) }
        // `has` before `getBoolean`: a plain getBoolean cannot tell "absent"
        // from "false", so a call that only changes the method would quietly
        // reset the clock to 12-hour.
        if (call.data.has("use24Hour")) {
            call.getBoolean("use24Hour")?.let { PrayerConfig.setUse24Hour(context, it) }
        }
        // Mirrored so the home-screen widgets and the appearance screen can
        // match the app's theme. Neither has a WebView to read localStorage,
        // where the real value lives, and without this they fall back to the
        // device's dark mode — a different preference entirely. The refresh
        // below repaints every placed widget as soon as it changes.
        if (call.data.has("appNight")) {
            call.getBoolean("appNight")?.let { PrayerConfig.setAppNight(context, it) }
        }
        // The app's language, for the widget's appearance screen (see
        // PrayerConfig.appLocale). The widget itself follows the device.
        call.getString("appLang")?.let { if (it == "ar" || it == "en") PrayerConfig.setAppLang(context, it) }
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
    /**
     * Asks to switch location on with the system's own dialog — one tap, and
     * the user never leaves the app. Resolves `enabled: true` once location is
     * on (at once if it already was). Where the dialog cannot be shown (no
     * Play Services), it falls back to the device's location settings screen
     * and resolves `enabled: false`, since that screen reports nothing back.
     */
    @PluginMethod
    fun promptEnableLocation(call: PluginCall) {
        val request = LocationSettingsRequest.Builder()
            .addLocationRequest(
                LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10_000L).build(),
            )
            .setAlwaysShow(true)
            .build()
        LocationServices.getSettingsClient(activity)
            .checkLocationSettings(request)
            .addOnSuccessListener { call.resolve(JSObject().put("enabled", true)) }
            .addOnFailureListener { e ->
                if (e is ResolvableApiException) {
                    pendingEnableCall?.resolve(JSObject().put("enabled", false))
                    pendingEnableCall = call
                    try {
                        enableLocationLauncher.launch(IntentSenderRequest.Builder(e.resolution).build())
                        return@addOnFailureListener
                    } catch (_: Exception) {
                        pendingEnableCall = null
                    }
                }
                try {
                    activity.startActivity(
                        Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                } catch (_: Exception) {
                    // No settings screen to offer; the caller's message stands.
                }
                call.resolve(JSObject().put("enabled", false))
            }
    }

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
     * Refuses when one is already placed: a second copy of a widget that
     * shows the same timetable is almost never wanted, and Android would
     * happily add one. `alreadyPlaced: true` tells the page to show the
     * widget rather than silently doing nothing.
     *
     * Otherwise resolves `requested: true` once the launcher has been asked —
     * not once the widget exists. The launcher owns the confirmation dialog
     * and never reports the outcome back, so claiming placement here would be
     * a lie the page would then have to display.
     */
    @PluginMethod
    fun requestPinWidget(call: PluginCall) {
        val result = JSObject()
        val mgr = AppWidgetManager.getInstance(context)
        if (mgr == null || !mgr.isRequestPinAppWidgetSupported) {
            result.put("requested", false)
            result.put("alreadyPlaced", false)
            call.resolve(result)
            return
        }

        val provider = ComponentName(context, PrayerWidgetProvider::class.java)
        if (mgr.getAppWidgetIds(provider).isNotEmpty()) {
            result.put("requested", false)
            result.put("alreadyPlaced", true)
            call.resolve(result)
            return
        }

        // No success callback is passed: the launcher's own dialog is the
        // confirmation, and a PendingIntent here would only tell us what the
        // user already saw happen.
        val requested = runCatching { mgr.requestPinAppWidget(provider, null, null) }
            .getOrDefault(false)
        result.put("requested", requested)
        result.put("alreadyPlaced", false)
        call.resolve(result)
    }

    /**
     * Leaves the app for the home screen, so the user lands where the widget
     * is rather than having to dismiss Rafeeq themselves.
     *
     * This is a *home* intent, not navigation to the widget itself: no
     * Android API can scroll a launcher to a particular widget or highlight
     * one, because the launcher owns its own pages and exposes nothing for
     * pointing at a placed item. Going home is the whole of what is possible,
     * and it is honest — the widget is visible from there.
     */
    @PluginMethod
    fun openHomeScreen(call: PluginCall) {
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val opened = runCatching { context.startActivity(intent) }.isSuccess
        val result = JSObject()
        result.put("opened", opened)
        call.resolve(result)
    }

    /**
     * Opens the appearance settings for the placed widget.
     *
     * Configures the first placed instance: the pin path allows only one, so
     * "the widget" is unambiguous in practice, and a user who added extras by
     * hand still gets a screen that works rather than an error.
     */
    @PluginMethod
    fun openWidgetSettings(call: PluginCall) {
        val result = JSObject()
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr?.getAppWidgetIds(
            ComponentName(context, PrayerWidgetProvider::class.java),
        )
        val widgetId = ids?.firstOrNull()
        if (widgetId == null) {
            // Nothing placed: there is no widget whose colours this would
            // change, so the page keeps its "add" button instead.
            result.put("opened", false)
            call.resolve(result)
            return
        }

        val intent = Intent(context, PrayerWidgetConfigActivity::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val opened = runCatching { context.startActivity(intent) }.isSuccess
        result.put("opened", opened)
        call.resolve(result)
    }

    /**
     * Opens this app's system settings page.
     *
     * The escape hatch for launchers that gate widget pinning behind a
     * per-app permission the app cannot declare or request — MIUI's "Home
     * screen shortcuts" is the case this exists for. There is no API to
     * request it, so the only thing the app can do is take the user to the
     * screen where it lives.
     */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null),
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        val opened = runCatching { context.startActivity(intent) }.isSuccess
        val result = JSObject()
        result.put("opened", opened)
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
