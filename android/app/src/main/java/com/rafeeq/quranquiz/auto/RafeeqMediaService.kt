package com.rafeeq.quranquiz.auto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
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
    private var reciters: List<ReciterItem> = emptyList()
    private var surahs: List<SurahItem> = emptyList()
    private var currentReciter: String = ""
    private var pageMarkers: List<PageMarker> = emptyList()
    private var currentPage: Int = 0

    data class ReciterItem(val id: String, val name: String)
    data class SurahItem(val number: Int, val name: String, val arabicName: String)

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        buildMediaSession()
        startForeground(NOTIFICATION_ID, buildNotification("رفيق", "القرآن الكريم", false, emptyList(), 0))
    }

    override fun onDestroy() {
        instance = null
        session.release()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_JUMP_TO_PAGE) {
            val aya = intent.getIntExtra(EXTRA_AYA, -1)
            val page = intent.getIntExtra(EXTRA_PAGE, -1)
            if (aya > 0) {
                currentPage = page
                RafeeqAutoPlugin.instance?.sendCarEvent("jumpToAya", null, null, aya)
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
                // Second level: scrollable list of reciters
                val items = reciters.map { reciter ->
                    val desc = MediaDescriptionCompat.Builder()
                        .setMediaId("$RECITER_PREFIX${reciter.id}")
                        .setTitle(reciter.name)
                        .build()
                    MediaBrowserCompat.MediaItem(
                        desc,
                        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                    )
                }
                result.sendResult(items)
            }
            parentId.startsWith(RECITER_PREFIX) -> {
                // Third level: list surahs for the selected reciter
                currentReciter = parentId.removePrefix(RECITER_PREFIX)
                val items = surahs.map { surah ->
                    val desc = MediaDescriptionCompat.Builder()
                        .setMediaId("$SURAH_PREFIX${surah.number}")
                        .setTitle(surah.arabicName)
                        .setSubtitle(surah.name)
                        .build()
                    MediaBrowserCompat.MediaItem(
                        desc,
                        MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                    )
                }
                result.sendResult(items)
            }
            else -> result.sendResult(emptyList())
        }
    }

    // ── Content tree updates from JS ───────────────────────────────────────────

    fun setReciters(list: List<ReciterItem>) {
        reciters = list
        notifyChildrenChanged(RECITERS_LIST_ID)
    }

    fun setSurahs(list: List<SurahItem>) {
        surahs = list
        // Invalidate all reciter sub-trees
        reciters.forEach { notifyChildrenChanged("$RECITER_PREFIX${it.id}") }
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
        newCurrentPage: Int
    ) {
        if (newPageMarkers != null) pageMarkers = newPageMarkers
        if (newCurrentPage > 0) currentPage = newCurrentPage

        Log.d("RafeeqMedia", "updateState: isPlaying=$isPlaying surah=$surahName verse=$verseKey page=$currentPage markers=${pageMarkers.size} -> ${pageMarkers.map { "p${it.page}a${it.aya}" }}")

        val stateBuilder = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP
            )
            .setState(
                if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                positionMs,
                if (isPlaying) 1f else 0f
            )

        // Add prev-page and next-page custom actions when the surah spans multiple pages.
        // Prev = jump to start of previous page. Next = jump to start of next page.
        if (pageMarkers.size > 1) {
            val currentIdx = pageMarkers.indexOfFirst { it.page == currentPage }
                .let { if (it < 0) pageMarkers.indexOfFirst { it.page >= currentPage }.let { i -> if (i < 0) pageMarkers.lastIndex else i } else it }

            val prevMarker = if (currentIdx > 0) pageMarkers[currentIdx - 1] else null
            val nextMarker = if (currentIdx < pageMarkers.lastIndex) pageMarkers[currentIdx + 1] else null

            if (prevMarker != null) {
                val bundle = Bundle().apply {
                    putInt("aya", prevMarker.aya)
                    putInt("page", prevMarker.page)
                }
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "prevPage",
                        "◀ ص ${prevMarker.page}",
                        android.R.drawable.ic_media_previous
                    ).setExtras(bundle).build()
                )
            }

            if (nextMarker != null) {
                val bundle = Bundle().apply {
                    putInt("aya", nextMarker.aya)
                    putInt("page", nextMarker.page)
                }
                stateBuilder.addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(
                        "nextPage",
                        "ص ${nextMarker.page} ▶",
                        android.R.drawable.ic_media_next
                    ).setExtras(bundle).build()
                )
            }
        }

        session.setPlaybackState(stateBuilder.build())

        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, surahName)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, reciterName)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, verseKey)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()
        session.setMetadata(metadata)

        val notification = buildNotification(surahName, reciterName, isPlaying, pageMarkers, currentPage)
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
        subtitle: String,
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

        // Layout when on first page:  [prev-verse, play/pause, next-verse, next-page]   → compact 0,1,2
        // Layout when on middle page: [prev-page, prev-verse, play/pause, next-verse, next-page] → compact 1,2,3
        // Layout when on last page:   [prev-page, prev-verse, play/pause, next-verse]   → compact 1,2,3
        // Layout when single-page:    [prev-verse, play/pause, next-verse]              → compact 0,1,2
        val hasPrev = prevMarker != null
        val hasNext = nextMarker != null

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSmallIcon(R.drawable.ic_transparent)
            .setLargeIcon(largeIcon)
            .setContentIntent(openAppIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (hasPrev) {
            val pi = PendingIntent.getService(this, 100,
                Intent(this, RafeeqMediaService::class.java).apply {
                    action = ACTION_JUMP_TO_PAGE
                    putExtra(EXTRA_AYA, prevMarker!!.aya)
                    putExtra(EXTRA_PAGE, prevMarker.page)
                }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_rew, "◀ ص ${prevMarker!!.page}", pi))
        }

        builder.addAction(NotificationCompat.Action(
            android.R.drawable.ic_media_previous, "Previous",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        ))
        builder.addAction(playPauseAction)
        builder.addAction(NotificationCompat.Action(
            android.R.drawable.ic_media_next, "Next",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        ))

        if (hasNext) {
            val pi = PendingIntent.getService(this, 101,
                Intent(this, RafeeqMediaService::class.java).apply {
                    action = ACTION_JUMP_TO_PAGE
                    putExtra(EXTRA_AYA, nextMarker!!.aya)
                    putExtra(EXTRA_PAGE, nextMarker.page)
                }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(NotificationCompat.Action(android.R.drawable.ic_media_ff, "ص ${nextMarker!!.page} ▶", pi))
        }

        // Compact view always shows prev-verse / play / next-verse.
        // Their indices shift by 1 when a prev-page button precedes them.
        val offset = if (hasPrev) 1 else 0
        builder.setStyle(
            androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.sessionToken)
                .setShowActionsInCompactView(offset, offset + 1, offset + 2)
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

    inner class SessionCallback : MediaSessionCompat.Callback() {

        override fun onPlay() {
            RafeeqAutoPlugin.instance?.sendCarEvent("play", null, null)
        }

        override fun onPause() {
            RafeeqAutoPlugin.instance?.sendCarEvent("pause", null, null)
        }

        override fun onSkipToNext() {
            RafeeqAutoPlugin.instance?.sendCarEvent("next", null, null)
        }

        override fun onSkipToPrevious() {
            RafeeqAutoPlugin.instance?.sendCarEvent("prev", null, null)
        }

        override fun onStop() {
            RafeeqAutoPlugin.instance?.sendCarEvent("stop", null, null)
        }

        override fun onCustomAction(action: String?, extras: Bundle?) {
            if (action == null) return
            if (action == "prevPage" || action == "nextPage") {
                val aya = extras?.getInt("aya", -1) ?: -1
                val page = extras?.getInt("page", -1) ?: -1
                if (aya > 0) {
                    currentPage = page
                    RafeeqAutoPlugin.instance?.sendCarEvent("jumpToAya", null, null, aya)
                }
            }
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            if (mediaId == null) return
            if (mediaId.startsWith(SURAH_PREFIX)) {
                val surahNumber = mediaId.removePrefix(SURAH_PREFIX).toIntOrNull() ?: return

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

                RafeeqAutoPlugin.instance?.sendCarEvent("selectSurah", currentReciter, surahNumber)
            }
        }
    }
}
