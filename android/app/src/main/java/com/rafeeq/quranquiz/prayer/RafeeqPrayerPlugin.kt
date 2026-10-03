package com.rafeeq.quranquiz.prayer

import android.Manifest
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.app.NotificationManager
import android.location.LocationManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
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
import org.json.JSONObject
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
 *   getAzkarReminders() / setAzkarReminders({ enabled }) — morning/evening azkar reminders
 *   getReminderHealth()                  — what may delay reminders on this device
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
 *   getAlarms() / saveAlarm(alarm) / deleteAlarm({ id }) — the ringing prayer alarms
 *   setAlarmSettings({...})              — sound, snooze, vibration and Ramadan start, shared by all alarms
 *   previewAlarm(alarm)                  — when an alarm being edited would next ring
 *   pickAlarmSound({ source })           — the system ringtone picker, or an audio file
 *   getAlarmHealth() / requestFullScreenAlarms() — what may stop alarms ringing properly
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

    /** The call waiting on a sound picker, answered by [ringtoneLauncher] or [audioFileLauncher]. */
    private var pendingSoundCall: PluginCall? = null
    private lateinit var ringtoneLauncher: ActivityResultLauncher<Intent>
    private lateinit var audioFileLauncher: ActivityResultLauncher<Array<String>>

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

        ringtoneLauncher = activity.registerForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val call = pendingSoundCall ?: return@registerForActivityResult
            pendingSoundCall = null
            val picked: Uri? = if (result.resultCode == android.app.Activity.RESULT_OK) {
                @Suppress("DEPRECATION")
                result.data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
            } else {
                null
            }
            if (picked == null) {
                call.resolve(JSObject().put("cancelled", true))
                return@registerForActivityResult
            }
            // The "Default" entry is stored as no choice, so it keeps
            // following the device's alarm sound if that changes later.
            val isDefault = picked == Settings.System.DEFAULT_ALARM_ALERT_URI
            val name = if (isDefault) null else runCatching {
                RingtoneManager.getRingtone(context, picked)?.getTitle(context)
            }.getOrNull()
            resolveSound(call, if (isDefault) null else picked, name)
        }

        audioFileLauncher = activity.registerForActivityResult(
            ActivityResultContracts.OpenDocument(),
        ) { uri ->
            val call = pendingSoundCall ?: return@registerForActivityResult
            pendingSoundCall = null
            if (uri == null) {
                call.resolve(JSObject().put("cancelled", true))
                return@registerForActivityResult
            }
            // Without a persisted grant the file is unreadable once the app
            // restarts, and alarms ring when it is not running at all.
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val name = runCatching {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                }
            }.getOrNull()
            resolveSound(call, uri, name)
        }

        // Re-arm both reminder chains on every launch. Each is one alarm that
        // re-arms itself when it fires, so a vendor battery manager that
        // drops or kills it (Xiaomi does on swipe-away from recents) ends
        // every later reminder until something re-arms — this is that
        // something. Both no-op when their reminders are off.
        PrayerAlarmScheduler.scheduleNext(context)
        AzkarReminderScheduler.scheduleNext(context)
        PrayerAlarmClockScheduler.scheduleNext(context)
    }

    // ── Prayer alarms ───────────────────────────────────────────────────────

    private fun alarmJson(alarm: PrayerAlarm): JSObject {
        val o = JSObject.fromJSONObject(PrayerAlarmConfig.alarmToJson(alarm))
        val next = PrayerAlarmClockScheduler.nextFor(context, alarm)
        o.put("nextAt", if (next != null) iso(Date(next)) else JSONObject.NULL)
        return o
    }

    @PluginMethod
    fun getAlarms(call: PluginCall) {
        val alarms = JSArray()
        PrayerAlarmConfig.alarms(context).forEach { alarms.put(alarmJson(it)) }
        call.resolve(
            JSObject()
                .put("alarms", alarms)
                .put("settings", JSObject.fromJSONObject(PrayerAlarmConfig.settingsToJson(PrayerAlarmConfig.settings(context)))),
        )
    }

    /** Inserts or replaces by id; resolves the stored (sanitised) alarm. */
    @PluginMethod
    fun saveAlarm(call: PluginCall) {
        val alarm = PrayerAlarmConfig.alarmFromJson(call.data)
        if (alarm == null) {
            call.reject("invalid alarm")
            return
        }
        val saved = PrayerAlarmConfig.upsert(context, alarm)
        PrayerAlarmClockScheduler.scheduleNext(context)
        call.resolve(JSObject().put("alarm", alarmJson(saved)))
    }

    @PluginMethod
    fun deleteAlarm(call: PluginCall) {
        val id = call.getString("id")
        if (id == null) {
            call.reject("id is required")
            return
        }
        PrayerAlarmConfig.delete(context, id)
        PrayerAlarmClockScheduler.scheduleNext(context)
        call.resolve()
    }

    /** Merges the keys present in the call over the stored settings. */
    @PluginMethod
    fun setAlarmSettings(call: PluginCall) {
        val merged = PrayerAlarmConfig.settingsToJson(PrayerAlarmConfig.settings(context))
        call.data.keys().forEach { key -> merged.put(key, call.data.opt(key)) }
        PrayerAlarmConfig.setSettings(context, PrayerAlarmConfig.decodeSettings(merged.toString()))
        // The Ramadan start moves which days Ramadan-only alarms ring on.
        PrayerAlarmClockScheduler.scheduleNext(context)
        call.resolve()
    }

    @PluginMethod
    fun previewAlarm(call: PluginCall) {
        val alarm = PrayerAlarmConfig.alarmFromJson(call.data)
        val next = alarm?.let { PrayerAlarmClockScheduler.previewNext(context, it) }
        call.resolve(JSObject().put("nextAt", if (next != null) iso(Date(next)) else JSONObject.NULL))
    }

    /**
     * Picks the alarm sound and stores it. "system" is the ringtone picker
     * (alarm sounds, ringtones, and any the user has added); "file" is the
     * document picker, for an adhan recording saved on the phone.
     */
    @PluginMethod
    fun pickAlarmSound(call: PluginCall) {
        pendingSoundCall?.resolve(JSObject().put("cancelled", true))
        pendingSoundCall = call
        try {
            if (call.getString("source") == "file") {
                audioFileLauncher.launch(arrayOf("audio/*"))
            } else {
                val current = PrayerAlarmConfig.settings(context).soundUri?.let { Uri.parse(it) }
                ringtoneLauncher.launch(
                    Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
                        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
                        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                        putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, Settings.System.DEFAULT_ALARM_ALERT_URI)
                        putExtra(
                            RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                            current ?: Settings.System.DEFAULT_ALARM_ALERT_URI,
                        )
                    },
                )
            }
        } catch (e: Exception) {
            pendingSoundCall = null
            call.reject("no sound picker on this device")
        }
    }

    private fun resolveSound(call: PluginCall, uri: Uri?, name: String?) {
        val old = PrayerAlarmConfig.settings(context)
        // Let go of a previously picked file's grant: the system keeps only a
        // limited number per app. Harmless for ringtone URIs, which hold none.
        old.soundUri?.let { prev ->
            if (prev != uri?.toString()) {
                runCatching {
                    context.contentResolver.releasePersistableUriPermission(
                        Uri.parse(prev), Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                }
            }
        }
        PrayerAlarmConfig.setSettings(context, old.copy(soundUri = uri?.toString(), soundName = name))
        call.resolve(
            JSObject()
                .put("uri", uri?.toString() ?: JSONObject.NULL)
                .put("name", name ?: JSONObject.NULL),
        )
    }

    /**
     * What may stop an alarm ringing properly: notifications blocked (no
     * screen to stop it from), exact alarms denied (rings may be late),
     * full-screen intents denied on Android 14+ (it rings as a heads-up
     * notification instead), and the same battery concerns as reminders.
     */
    @PluginMethod
    fun getAlarmHealth(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        call.resolve(
            JSObject()
                .put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
                .put("exactAlarms", PrayerAlarmScheduler.canScheduleExact(context))
                .put("fullScreen", canUseFullScreen())
                .put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(context.packageName))
                .put("aggressiveBattery", Build.MANUFACTURER.lowercase(java.util.Locale.ROOT) in AGGRESSIVE_BATTERY_BRANDS),
        )
    }

    private fun canUseFullScreen(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()

    /** Opens the "full-screen notifications" permission page on Android 14+. */
    @PluginMethod
    fun requestFullScreenAlarms(call: PluginCall) {
        if (canUseFullScreen()) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        call.resolve(JSObject().put("granted", false))
    }

    /**
     * What may stop reminders arriving on time, for the settings page to
     * explain: exact alarms not granted (denied by default on Android 14+),
     * and a manufacturer whose battery manager holds or kills background
     * alarms unless the app is allowed to autostart and run unrestricted.
     * Neither of the latter can be read or granted through an API.
     */
    @PluginMethod
    fun getReminderHealth(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        call.resolve(
            JSObject()
                .put("exactAlarms", PrayerAlarmScheduler.canScheduleExact(context))
                .put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(context.packageName))
                .put("aggressiveBattery", Build.MANUFACTURER.lowercase(java.util.Locale.ROOT) in AGGRESSIVE_BATTERY_BRANDS),
        )
    }

    private companion object {
        /** Brands whose own battery manager restricts background alarms
         *  beyond stock Android (see dontkillmyapp.com). */
        val AGGRESSIVE_BATTERY_BRANDS = setOf(
            "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "vivo", "oneplus",
        )
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
        // A first fix moves the azkar slots from fixed hours onto the prayers.
        AzkarReminderScheduler.scheduleNext(context)
        // New coordinates move every prayer an alarm is measured from.
        PrayerAlarmClockScheduler.scheduleNext(context)
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
        // Both move Fajr or Asr, which the pending azkar slot was computed from.
        if (call.data.has("method") || call.data.has("madhab")) {
            AzkarReminderScheduler.scheduleNext(context)
            PrayerAlarmClockScheduler.scheduleNext(context)
        }
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

    @PluginMethod
    fun getAzkarReminders(call: PluginCall) {
        call.resolve(JSObject().put("enabled", PrayerConfig.azkarRemindersEnabled(context)))
    }

    @PluginMethod
    fun setAzkarReminders(call: PluginCall) {
        val enabled = call.getBoolean("enabled")
        if (enabled == null) {
            call.reject("enabled is required")
            return
        }
        PrayerConfig.setAzkarRemindersEnabled(context, enabled)
        if (enabled) {
            AzkarReminderScheduler.scheduleNext(context)
        } else {
            AzkarReminderScheduler.cancel(context)
        }
        call.resolve()
    }

    /**
     * Sends the user to the system "Alarms & reminders" page when exact alarms
     * are not yet allowed (Android 12+; off by default on 14+ fresh installs).
     * Resolves whether they already were — granting there fires
     * SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED, which PrayerBootReceiver
     * answers by re-arming, so nothing here has to wait for the user.
     */
    @PluginMethod
    fun requestExactAlarm(call: PluginCall) {
        val result = JSObject()
        if (PrayerAlarmScheduler.canScheduleExact(context)) {
            result.put("granted", true)
            call.resolve(result)
            return
        }
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: Exception) {
            // No settings screen on this device — reminders stay inexact.
        }
        result.put("granted", false)
        call.resolve(result)
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
