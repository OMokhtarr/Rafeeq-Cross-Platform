package com.rafeeq.quranquiz.auto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import androidx.media.session.MediaButtonReceiver
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R

/**
 * RafeeqMediaService — Android Auto entry point.
 *
 * Android Auto talks to this service via MediaBrowserServiceCompat.
 * The content tree has two levels:
 *   ROOT → Reciter items (browsable)
 *   Reciter → Surah items (playable)
 *
 * When a surah is selected, we fire an intent to RafeeqAutoPlugin which
 * bridges the command into the JS PlaybackContext via Capacitor events.
 *
 * Playback state (playing/paused/track title) is pushed from JS → here
 * via RafeeqAutoPlugin.updatePlaybackState().
 */
class RafeeqMediaService : MediaBrowserServiceCompat() {

    companion object {
        const val CHANNEL_ID = "rafeeq_media"
        const val NOTIFICATION_ID = 1001
        const val ROOT_ID = "__root__"
        const val RECITERS_LIST_ID = "__reciters__"
        const val RECITER_PREFIX = "reciter:"
        const val SURAH_PREFIX = "surah:"
        const val ACTION_JUMP_TO_PAGE = "com.rafeeq.quranquiz.JUMP_TO_PAGE"
        const val EXTRA_AYA = "aya"
        const val EXTRA_PAGE = "page"

        // Singleton so RafeeqAutoPlugin can push state updates here
        var instance: RafeeqMediaService? = null
    }

    data class PageMarker(val page: Int, val aya: Int)

    private lateinit var session: MediaSessionCompat
    private lateinit var audioManager: AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var reciters: List<ReciterItem> = emptyList()
    private var surahs: List<SurahItem> = emptyList()
    private var currentReciter: String = ""
    private var pageMarkers: List<PageMarker> = emptyList()
    private var currentPage: Int = 0
    private var repeatPageActive: Boolean = false

    // Pending detached results waiting for content to arrive from JS
    private val pendingReciters = mutableListOf<Result<List<MediaBrowserCompat.MediaItem>>>()
    private val pendingSurahs = mutableMapOf<String, Result<List<MediaBrowserCompat.MediaItem>>>()

    data class ReciterItem(val id: String, val name: String)
    data class SurahItem(val number: Int, val name: String, val arabicName: String)

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        createNotificationChannel()
        buildMediaSession()
        // Set an initial PlaybackState so Android Auto knows the session accepts play
        // commands immediately. Without this the session has no advertised actions and
        // the car's play button is either disabled or does nothing on cold start.
        val initialState = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP or
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(PlaybackStateCompat.STATE_PAUSED, 0L, 0f)
            .build()
        session.setPlaybackState(initialState)
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "رفيق")
                .build()
        )
        requestAudioFocus()
        startForeground(NOTIFICATION_ID, buildNotification("رفيق", false, emptyList(), 0))
    }

    override fun onDestroy() {
        instance = null
        abandonAudioFocus()
        session.release()
        super.onDestroy()
    }

    private fun requestAudioFocus() {
        if (hasAudioFocus) return
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            hasAudioFocus = false
                            dispatchCarEvent("pause")
                        }
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            hasAudioFocus = true
                        }
                    }
                }
                .build()
            audioFocusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        Log.d("RafeeqMedia", "requestAudioFocus: result=$result hasAudioFocus=$hasAudioFocus")
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        hasAudioFocus = false
        audioFocusRequest = null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_JUMP_TO_PAGE) {
            val aya = intent.getIntExtra(EXTRA_AYA, -1)
            val page = intent.getIntExtra(EXTRA_PAGE, -1)
            if (aya > 0) {
                currentPage = page
                dispatchCarEvent("jumpToAya", aya = aya)
            }
        } else {
            MediaButtonReceiver.handleIntent(session, intent)
        }
        return super.onStartCommand(intent, flags, startId)
    }

    // ── MediaBrowserServiceCompat ──────────────────────────────────────────────

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        return BrowserRoot(ROOT_ID, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        when {
            parentId == ROOT_ID -> {
                // Single "Choose Reciter" folder at root — forces a list view
                // instead of Android Auto's tab-strip that appears when browsable
                // items sit directly at the root level.
                val desc = MediaDescriptionCompat.Builder()
                    .setMediaId(RECITERS_LIST_ID)
                    .setTitle("اختر القارئ")
                    .setSubtitle("Choose Reciter")
                    .build()
                val item = MediaBrowserCompat.MediaItem(
                    desc,
                    MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                )
                result.sendResult(listOf(item))
            }
            parentId == RECITERS_LIST_ID -> {
                if (reciters.isEmpty()) {
                    result.detach()
                    pendingReciters.add(result)
                } else {
                    result.sendResult(buildReciterItems())
                }
            }
            parentId.startsWith(RECITER_PREFIX) -> {
                currentReciter = parentId.removePrefix(RECITER_PREFIX)
                if (surahs.isEmpty()) {
                    result.detach()
                    pendingSurahs[parentId] = result
                } else {
                    result.sendResult(buildSurahItems())
                }
            }
            else -> result.sendResult(emptyList())
        }
    }

    // ── Content tree updates from JS ───────────────────────────────────────────

    fun setReciters(list: List<ReciterItem>) {
        reciters = list
        notifyChildrenChanged(RECITERS_LIST_ID)
        val items = buildReciterItems()
        pendingReciters.forEach { it.sendResult(items) }
        pendingReciters.clear()
    }

    fun setSurahs(list: List<SurahItem>) {
        surahs = list
        reciters.forEach { notifyChildrenChanged("$RECITER_PREFIX${it.id}") }
        val items = buildSurahItems()
        pendingSurahs.values.forEach { it.sendResult(items) }
        pendingSurahs.clear()
    }

    private fun buildReciterItems(): List<MediaBrowserCompat.MediaItem> =
        reciters.map { reciter ->
            val desc = MediaDescriptionCompat.Builder()
                .setMediaId("$RECITER_PREFIX${reciter.id}")
                .setTitle(reciter.name)
                .build()
            MediaBrowserCompat.MediaItem(desc, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
        }

    private fun buildSurahItems(): List<MediaBrowserCompat.MediaItem> =
        surahs.map { surah ->
            val desc = MediaDescriptionCompat.Builder()
                .setMediaId("$SURAH_PREFIX${surah.number}")
                .setTitle(surah.arabicName)
                .setSubtitle(surah.name)
                .build()
            MediaBrowserCompat.MediaItem(desc, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
        }

    // ── Playback state updates from JS ─────────────────────────────────────────

    fun updateState(
        isPlaying: Boolean,
        surahName: String,
        verseKey: String,
        reciterName: String,
        positionMs: Long,
        durationMs: Long,
        newPageMarkers: List<PageMarker>?,
        newCurrentPage: Int,
        repeatPageActive: Boolean = false
    ) {
        if (newPageMarkers != null) pageMarkers = newPageMarkers
        if (newCurrentPage > 0) currentPage = newCurrentPage
        this.repeatPageActive = repeatPageActive

        Log.d("RafeeqMedia", "updateState: isPlaying=$isPlaying surah=$surahName verse=$verseKey page=$currentPage markers=${pageMarkers.size} -> ${pageMarkers.map { "p${it.page}a${it.aya}" }} repeatPage=$repeatPageActive")

        val stateBuilder = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP or
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(
                if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                positionMs,
                if (isPlaying) 1f else 0f
            )

        // Add prev-page and next-page custom actions when the surah spans multiple pages.
        // Both slots are always added in fixed order (prev left, next right) so that
        // Android Auto never shifts nextPage to the left when prevPage is unavailable.
        if (pageMarkers.size > 1) {
            val currentIdx = pageMarkers.indexOfFirst { it.page == currentPage }
                .let { if (it < 0) pageMarkers.indexOfFirst { it.page >= currentPage }.let { i -> if (i < 0) pageMarkers.lastIndex else i } else it }

            val prevMarker = if (currentIdx > 0) pageMarkers[currentIdx - 1] else null
            val nextMarker = if (currentIdx < pageMarkers.lastIndex) pageMarkers[currentIdx + 1] else null

            val currentMarker = if (currentIdx >= 0 && currentIdx <= pageMarkers.lastIndex) pageMarkers[currentIdx] else null

            // Slot 0 — prev-page (always present; no-op when on the first page)
            // Slot 1 — next-page (always present; no-op when on the last page)
            // Slot 2 — replay-page toggle
            // Android 13+ media widget shows only 2 custom actions; keeping page nav
            // in slots 0/1 ensures both prev/next are visible and repeat stays accessible
            // in Android Auto (which shows all 3).
            if (prevMarker != null) {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "prevPage",
                        "◀ ص ${prevMarker.page}",
                        android.R.drawable.ic_media_previous
                    ).setExtras(Bundle().apply {
                        putInt("aya", prevMarker.aya)
                        putInt("page", prevMarker.page)
                    }).build()
                )
            } else {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "prevPage_noop",
                        "◀",
                        android.R.drawable.ic_media_previous
                    ).build()
                )
            }

            // Slot 1 — next-page
            if (nextMarker != null) {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "nextPage",
                        "ص ${nextMarker.page} ▶",
                        android.R.drawable.ic_media_next
                    ).setExtras(Bundle().apply {
                        putInt("aya", nextMarker.aya)
                        putInt("page", nextMarker.page)
                    }).build()
                )
            } else {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "nextPage_noop",
                        "▶",
                        android.R.drawable.ic_media_next
                    ).build()
                )
            }

            // Slot 2 — replay-page toggle (3rd; hidden on phone media widget, visible in Android Auto)
            val replayIcon = if (repeatPageActive) R.drawable.ic_repeat_page_active else R.drawable.ic_repeat_page
            val replayLabel = "↺ ص ${currentMarker?.page ?: ""}"
            if (currentMarker != null) {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "replayPage",
                        replayLabel,
                        replayIcon
                    ).setExtras(Bundle().apply {
                        putInt("aya", currentMarker.aya)
                        putInt("page", currentMarker.page)
                    }).build()
                )
            } else {
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "replayPage_noop",
                        "↺",
                        R.drawable.ic_repeat_page
                    ).build()
                )
            }
        }

        session.setPlaybackState(stateBuilder.build())

        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, surahName)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()
        session.setMetadata(metadata)

        val notification = buildNotification(surahName, isPlaying, pageMarkers, currentPage)
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    // ── Session & notification ──────────────────────────────────────────────────

    private fun buildMediaSession() {
        val activityIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        session = MediaSessionCompat(this, "RafeeqAuto").apply {
            setSessionActivity(activityIntent)
            setCallback(SessionCallback())
            isActive = true
        }
        sessionToken = session.sessionToken
    }

    private fun buildNotification(
        title: String,
        playing: Boolean,
        markers: List<PageMarker>,
        activePage: Int
    ): Notification {
        val playPauseAction = if (playing) {
            NotificationCompat.Action(
                android.R.drawable.ic_media_pause, "Pause",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    this, PlaybackStateCompat.ACTION_PAUSE
                )
            )
        } else {
            NotificationCompat.Action(
                android.R.drawable.ic_media_play, "Play",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    this, PlaybackStateCompat.ACTION_PLAY
                )
            )
        }

        val openAppIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val largeIcon = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)

        Log.d("RafeeqMedia", "buildNotification: markers=${markers.size} activePage=$activePage")

        // Compute page-nav markers.
        var prevMarker: PageMarker? = null
        var nextMarker: PageMarker? = null
        if (markers.size > 1) {
            val currentIdx = markers.indexOfFirst { it.page == activePage }
                .let { if (it < 0) markers.indexOfFirst { it.page >= activePage }.let { i -> if (i < 0) markers.lastIndex else i } else it }
            prevMarker = if (currentIdx > 0) markers[currentIdx - 1] else null
            nextMarker = if (currentIdx < markers.lastIndex) markers[currentIdx + 1] else null
        }

        // Fixed layout: [prev-page, prev-verse, play/pause, next-verse, next-page] — indices never shift.
        // prev-page and next-page are always present; when unavailable they use a no-op intent.
        // Compact view always shows indices 1,2,3 (prev-verse / play / next-verse).
        val noopIntent = PendingIntent.getBroadcast(
            this, 0,
            Intent("com.rafeeq.quranquiz.NOOP"),
            PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setSmallIcon(R.drawable.ic_transparent)
            .setLargeIcon(largeIcon)
            .setContentIntent(openAppIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        // Index 0 — prev-page (disabled when no previous page)
        if (prevMarker != null) {
            val pi = PendingIntent.getService(this, 100,
                Intent(this, RafeeqMediaService::class.java).apply {
                    action = ACTION_JUMP_TO_PAGE
                    putExtra(EXTRA_AYA, prevMarker.aya)
                    putExtra(EXTRA_PAGE, prevMarker.page)
                }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_rew, "◀ ص ${prevMarker.page}", pi))
        } else {
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_rew, "◀", noopIntent))
        }

        // Index 1 — prev-verse
        builder.addAction(NotificationCompat.Action(
            android.R.drawable.ic_media_previous, "Previous",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        ))
        // Index 2 — play/pause
        builder.addAction(playPauseAction)
        // Index 3 — next-verse
        builder.addAction(NotificationCompat.Action(
            android.R.drawable.ic_media_next, "Next",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        ))

        // Index 4 — next-page (disabled when no next page)
        if (nextMarker != null) {
            val pi = PendingIntent.getService(this, 101,
                Intent(this, RafeeqMediaService::class.java).apply {
                    action = ACTION_JUMP_TO_PAGE
                    putExtra(EXTRA_AYA, nextMarker.aya)
                    putExtra(EXTRA_PAGE, nextMarker.page)
                }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_ff, "ص ${nextMarker.page} ▶", pi))
        } else {
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_ff, "▶", noopIntent))
        }

        // Compact view always shows prev-verse / play / next-verse at fixed indices 1,2,3.
        builder.setStyle(
            androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.sessionToken)
                .setShowActionsInCompactView(1, 2, 3)
        )

        return builder.build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Rafeeq Playback",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Quran recitation playback controls"
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }

    // ── SessionCallback — hardware button events → JS via plugin ──────────────

    /**
     * Dispatches a car action to the plugin.
     * If the plugin is already live (MainActivity running), delegates immediately.
     * If the plugin is null (cold launch — MainActivity not started yet), stores the
     * event in the plugin's companion pending slot and wakes MainActivity so it
     * initialises the plugin and flushes the event via jsReady().
     */
    private fun dispatchCarEvent(action: String, reciter: String? = null, surah: Int? = null, aya: Int? = null, positionMs: Long? = null) {
        val plugin = RafeeqAutoPlugin.instance
        if (plugin != null) {
            plugin.sendCarEvent(action, reciter, surah, aya, positionMs)
        } else {
            // Plugin not loaded yet — store as pending and wake the activity.
            Log.d("RafeeqMedia", "dispatchCarEvent: plugin null, storing pending '$action' and waking MainActivity")
            RafeeqAutoPlugin.storePendingEvent(action, reciter, surah, aya, positionMs)
            val launchIntent = android.content.Intent(this, com.rafeeq.quranquiz.MainActivity::class.java).apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(launchIntent)
        }
    }

    inner class SessionCallback : MediaSessionCompat.Callback() {

        override fun onPlay() {
            requestAudioFocus()
            dispatchCarEvent("play")
        }

        override fun onPause() {
            dispatchCarEvent("pause")
        }

        override fun onSkipToNext() {
            dispatchCarEvent("next")
        }

        override fun onSkipToPrevious() {
            dispatchCarEvent("prev")
        }

        override fun onStop() {
            dispatchCarEvent("stop")
        }

        override fun onSeekTo(pos: Long) {
            dispatchCarEvent("seekTo", positionMs = pos)
        }

        override fun onCustomAction(action: String?, extras: Bundle?) {
            if (action == null) return
            if (action == "prevPage" || action == "nextPage") {
                val aya = extras?.getInt("aya", -1) ?: -1
                val page = extras?.getInt("page", -1) ?: -1
                if (aya > 0) {
                    currentPage = page
                    dispatchCarEvent("jumpToAya", aya = aya)
                }
            }
            if (action == "replayPage") {
                val aya = extras?.getInt("aya", -1) ?: -1
                val page = extras?.getInt("page", -1) ?: -1
                if (aya > 0) {
                    currentPage = page
                    dispatchCarEvent("replayPage", aya = aya)
                }
            }
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            if (mediaId == null) return
            if (mediaId.startsWith(SURAH_PREFIX)) {
                val surahNumber = mediaId.removePrefix(SURAH_PREFIX).toIntOrNull() ?: return

                requestAudioFocus()

                // Immediately acknowledge the selection so Android Auto exits
                // the "Getting your selection..." screen. Without this the UI
                // hangs until the JS side finishes loading and fires updateState.
                val bufferingState = PlaybackStateCompat.Builder()
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_STOP
                    )
                    .setState(PlaybackStateCompat.STATE_BUFFERING, 0L, 0f)
                    .build()
                session.setPlaybackState(bufferingState)

                dispatchCarEvent("selectSurah", reciter = currentReciter, surah = surahNumber)
            }
        }
    }
}
