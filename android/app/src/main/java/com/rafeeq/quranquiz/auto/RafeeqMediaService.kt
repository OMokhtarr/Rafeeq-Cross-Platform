package com.rafeeq.quranquiz.auto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.content.SharedPreferences
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

        // SharedPreferences for persisting the last flat queue so cold-start car
        // playback has instant sound before the JS brain wakes up.
        private const val PREFS = "rafeeq_player"
        private const val KEY_QUEUE_URLS = "queue_urls"
        private const val KEY_QUEUE_INDEX = "queue_index"
        private const val KEY_QUEUE_TITLE = "queue_title"

        // Home page background (forest-deep, #0d1f14 — see Home.css). Used to tint the
        // media notification card so it matches the app's identity.
        val HOME_BG_COLOR = android.graphics.Color.parseColor("#0D1F14")

        // Singleton so RafeeqAutoPlugin can push state updates here
        var instance: RafeeqMediaService? = null
    }

    data class PageMarker(val page: Int, val aya: Int)

    private lateinit var session: MediaSessionCompat
    private lateinit var audioManager: AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false

    // Native playback engine (the "dumb" player). Drives actual audio output so
    // Android Auto cold start works without a running WebView.
    @androidx.media3.common.util.UnstableApi
    private var player: RafeeqPlayer? = null
    // True while the JS brain is alive and feeding URLs one at a time. When false
    // (cold start), the player walks the persisted flat queue itself.
    private var jsDriving = false
    private lateinit var prefs: SharedPreferences

    // The custom actions (prev/next page, replay) from the last updateState. The per-second
    // position ticks must re-apply these, otherwise they'd clobber the page-nav buttons in
    // the car/notification by publishing a PlaybackState without them.
    private var currentCustomActions: List<PlaybackStateCompat.CustomAction> = emptyList()

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

    @androidx.media3.common.util.UnstableApi
    override fun onCreate() {
        super.onCreate()
        // NOTE: `instance` is published LAST (end of onCreate), not here. Other code uses
        // `RafeeqMediaService.instance != null` as the signal that the service is fully
        // ready (session + player built). Publishing it before buildMediaSession() caused
        // a crash: JS calls updatePlaybackState → ensureService → sees a non-null instance
        // and immediately calls updateState() while `session` is still uninitialized
        // (UninitializedPropertyAccessException).
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        createNotificationChannel()
        buildMediaSession()
        buildPlayer()
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
        // NOTE: we intentionally do NOT call startForeground() here. The service is
        // created either by Android Auto binding (for browsing — no notification needed)
        // or lazily when playback starts. The media notification card only appears once
        // audio actually plays, via promoteToForeground(). This stops the card from
        // showing the instant the phone app opens.

        // Seed the Android Auto browse tree with static defaults so the car can list
        // reciters/surahs immediately on a cold start (phone app never opened). JS may
        // later override these via setContentTree.
        if (reciters.isEmpty()) reciters = RafeeqContentDefaults.RECITERS
        if (surahs.isEmpty()) surahs = RafeeqContentDefaults.SURAHS

        // Publish the singleton LAST — only now is the service safe to call into.
        instance = this
    }

    // Tracks whether we've already promoted to a foreground service so we don't
    // repeatedly call startForeground.
    private var isForeground = false

    /**
     * Promote to a foreground service and show the media notification. Called the moment
     * playback begins (from the player's onPlayingChanged or a cold-start play). Idempotent.
     */
    private fun promoteToForeground(title: String, playing: Boolean) {
        val notification = buildNotification(title, playing, pageMarkers, currentPage)
        if (!isForeground) {
            startForeground(NOTIFICATION_ID, notification)
            isForeground = true
        } else {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, notification)
        }
    }

    @androidx.media3.common.util.UnstableApi
    override fun onDestroy() {
        instance = null
        player?.release()
        player = null
        abandonAudioFocus()
        session.release()
        super.onDestroy()
    }

    // ── Native player ───────────────────────────────────────────────────────────

    @androidx.media3.common.util.UnstableApi
    private fun buildPlayer() {
        player = RafeeqPlayer(this, object : RafeeqPlayer.Callbacks {
            override fun onEnded(index: Int) {
                // If the JS brain is driving, let it apply repeat/range/page logic and
                // feed the next verse. If it isn't (pure cold start before the WebView
                // wakes), the player self-advances through the persisted flat list and we
                // must NOT also notify JS — that would double-advance once JS arrives.
                if (jsDriving) {
                    dispatchCarEvent("nativeTrackEnded", aya = index)
                }
            }

            override fun onPosition(positionMs: Long, durationMs: Long) {
                // Keep the MediaSession position fresh WITHOUT dropping page-nav buttons.
                publishPlaybackState(player?.isPlaying() == true, positionMs)
                // Forward the per-verse position to the JS brain so the in-app slider
                // ticks live. We tag the tick with the player's current track index
                // (`surah` field) so JS can DROP stale ticks that arrive after a jump to a
                // different verse (which otherwise yank the slider to a wrong/0 position).
                if (jsDriving) {
                    dispatchCarEvent(
                        "nativePosition",
                        surah = player?.currentIndex() ?: 0,
                        positionMs = positionMs,
                        durationMs = durationMs,
                    )
                }
            }

            override fun onPlayingChanged(isPlaying: Boolean) {
                publishPlaybackState(isPlaying, player?.currentPositionMs() ?: 0L)
                // Show the media card only once playback actually begins.
                if (isPlaying) {
                    val title = session.controller.metadata
                        ?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "رفيق"
                    promoteToForeground(title, true)
                }
                // Forward the actual play/pause state to the JS brain so the in-app
                // play/pause button always reflects reality — including when the user
                // pauses/plays from the NOTIFICATION (which otherwise wouldn't reliably
                // reach JS). Fired directly like position ticks (no activity wake).
                if (jsDriving) {
                    dispatchCarEvent("nativePlaying", surah = if (isPlaying) 1 else 0)
                }
            }

            override fun onError(index: Int, message: String) {
                Log.e("RafeeqMedia", "player error at index=$index: $message")
            }
        })
    }

    /**
     * Persist the last flat queue (resolved URLs/files + display title) so a cold-start
     * car play can begin immediately. Called by the plugin when JS pushes a native queue.
     */
    fun persistQueue(urls: List<String>, startIndex: Int, title: String) {
        prefs.edit()
            .putString(KEY_QUEUE_URLS, urls.joinToString("\n"))
            .putInt(KEY_QUEUE_INDEX, startIndex)
            .putString(KEY_QUEUE_TITLE, title)
            .apply()
    }

    private fun loadPersistedQueue(): Triple<List<String>, Int, String>? {
        val raw = prefs.getString(KEY_QUEUE_URLS, null) ?: return null
        val urls = raw.split("\n").filter { it.isNotBlank() }
        if (urls.isEmpty()) return null
        val idx = prefs.getInt(KEY_QUEUE_INDEX, 0).coerceIn(0, urls.lastIndex)
        val title = prefs.getString(KEY_QUEUE_TITLE, "رفيق") ?: "رفيق"
        return Triple(urls, idx, title)
    }

    // ── Native playback control (called by plugin / session callbacks) ──────────

    /**
     * Persist the resolved flat queue for the NEXT cold start. This must NOT touch the
     * live player: when JS is driving, playback advances track-by-track via loadNativeTrack.
     * (Previously this called loadList, which reloaded/stopped the verse that was already
     * playing and re-armed the cold-list self-advance — fighting the JS-driven advance and
     * stalling playback after the first ayah.)
     */
    @androidx.media3.common.util.UnstableApi
    fun setNativeQueue(urls: List<String>, startIndex: Int, title: String, autoplay: Boolean) {
        jsDriving = true
        persistQueue(urls, startIndex, title)
    }

    /** JS brain feeds a single resolved URL for one verse (it owns progression). */
    @androidx.media3.common.util.UnstableApi
    fun loadNativeTrack(url: String, index: Int, title: String, autoplay: Boolean) {
        jsDriving = true
        requestAudioFocus()
        player?.load(url, index, playWhenReady = autoplay)
        if (title.isNotEmpty()) updateTitleMetadata(title)
    }

    /**
     * Play a one-shot intro (bismillah) and fire a 'nativeIntroEnded' carAction when it
     * finishes so the JS brain proceeds to the first real verse.
     */
    @androidx.media3.common.util.UnstableApi
    fun playNativeIntro(url: String) {
        jsDriving = true
        requestAudioFocus()
        player?.playIntro(url) {
            dispatchCarEvent("nativeIntroEnded")
        }
    }

    @androidx.media3.common.util.UnstableApi
    fun nativePlay() { requestAudioFocus(); player?.play() }
    @androidx.media3.common.util.UnstableApi
    fun nativePause() { player?.pause() }
    @androidx.media3.common.util.UnstableApi
    fun nativeSeek(positionMs: Long) { player?.seekTo(positionMs) }
    @androidx.media3.common.util.UnstableApi
    fun nativeSetSpeed(speed: Float) { player?.setPlaybackSpeed(speed) }

    /**
     * Cold-start play: JS is not driving yet. Start the persisted flat queue directly
     * so the car has sound immediately, then wake the WebView in the background so the
     * brain can take over with full repeat/range logic.
     */
    @androidx.media3.common.util.UnstableApi
    private fun coldStartPlay() {
        val persisted = loadPersistedQueue()
        if (persisted != null) {
            val (urls, idx, title) = persisted
            Log.d("RafeeqMedia", "coldStartPlay: starting persisted queue size=${urls.size} idx=$idx")
            requestAudioFocus()
            player?.loadList(urls, idx, playWhenReady = true)
            updateTitleMetadata(title)
            // Tell the brain which index ExoPlayer is already playing so it adopts that
            // position on handoff instead of restarting the queue from the beginning.
            dispatchCarEvent("play", aya = idx)
        } else {
            // Nothing played yet on this install (no persisted queue). We can't build the
            // authenticated audio URL natively, so wake the app: the brain will resolve
            // Al-Fatiha and start native playback (and persist it for next time).
            Log.d("RafeeqMedia", "coldStartPlay: no persisted queue, waking app to start")
            dispatchCarEvent("play")
        }
    }

    private fun updateTitleMetadata(title: String) {
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .build()
        )
    }

    /**
     * Publish a PlaybackState that ALWAYS re-applies the current custom actions (page-nav,
     * replay). Used by the per-second position ticks and play/pause changes so they never
     * wipe out the page buttons that updateState added.
     */
    private fun publishPlaybackState(playing: Boolean, positionMs: Long) {
        val st = if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val sb = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP or
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(st, positionMs, if (playing) 1f else 0f)
        currentCustomActions.forEach { sb.addCustomAction(it) }
        session.setPlaybackState(sb.build())
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
        // A media client (Android Auto, the car, or the system media controls) is
        // connecting. Promote to a foreground media service NOW so the MediaSession's
        // transport controls (the car's play button → onPlay()) are reliably routed.
        // This does NOT fire on a plain phone-app open (no media browser connects), so
        // the notification card still won't appear just from opening the app.
        promoteToForeground(
            session.controller.metadata
                ?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "رفيق",
            false,
        )
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

        // Build prev-page / next-page / replay custom actions when the surah spans
        // multiple pages. Collect them into a list so the per-second position ticks can
        // re-apply the SAME actions (publishPlaybackState) instead of wiping them out.
        val actions = mutableListOf<PlaybackStateCompat.CustomAction>()
        if (pageMarkers.size > 1) {
            val currentIdx = pageMarkers.indexOfFirst { it.page == currentPage }
                .let { if (it < 0) pageMarkers.indexOfFirst { it.page >= currentPage }.let { i -> if (i < 0) pageMarkers.lastIndex else i } else it }

            val prevMarker = if (currentIdx > 0) pageMarkers[currentIdx - 1] else null
            val nextMarker = if (currentIdx < pageMarkers.lastIndex) pageMarkers[currentIdx + 1] else null
            val currentMarker = if (currentIdx >= 0 && currentIdx <= pageMarkers.lastIndex) pageMarkers[currentIdx] else null

            // Slot 0 — prev-page (no-op when on the first page)
            actions.add(
                if (prevMarker != null)
                    PlaybackStateCompat.CustomAction.Builder("prevPage", "◀ ص ${prevMarker.page}", android.R.drawable.ic_media_previous)
                        .setExtras(Bundle().apply { putInt("aya", prevMarker.aya); putInt("page", prevMarker.page) }).build()
                else
                    PlaybackStateCompat.CustomAction.Builder("prevPage_noop", "◀", android.R.drawable.ic_media_previous).build()
            )
            // Slot 1 — next-page (no-op when on the last page)
            actions.add(
                if (nextMarker != null)
                    PlaybackStateCompat.CustomAction.Builder("nextPage", "ص ${nextMarker.page} ▶", android.R.drawable.ic_media_next)
                        .setExtras(Bundle().apply { putInt("aya", nextMarker.aya); putInt("page", nextMarker.page) }).build()
                else
                    PlaybackStateCompat.CustomAction.Builder("nextPage_noop", "▶", android.R.drawable.ic_media_next).build()
            )
            // Slot 2 — replay-page toggle
            val replayIcon = if (repeatPageActive) R.drawable.ic_repeat_page_active else R.drawable.ic_repeat_page
            actions.add(
                if (currentMarker != null)
                    PlaybackStateCompat.CustomAction.Builder("replayPage", "↺ ص ${currentMarker.page}", replayIcon)
                        .setExtras(Bundle().apply { putInt("aya", currentMarker.aya); putInt("page", currentMarker.page) }).build()
                else
                    PlaybackStateCompat.CustomAction.Builder("replayPage_noop", "↺", R.drawable.ic_repeat_page).build()
            )
        }

        currentCustomActions = actions
        actions.forEach { stateBuilder.addCustomAction(it) }
        session.setPlaybackState(stateBuilder.build())

        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, surahName)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()
        session.setMetadata(metadata)

        // Promote to foreground (and show the card) on first play; otherwise just refresh
        // the existing notification. When paused, we keep the card so transport controls
        // remain available, but we never create it before playback has started.
        if (isPlaying || isForeground) {
            promoteToForeground(surahName.ifEmpty { "رفيق" }, isPlaying)
        }
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

        val largeIcon = buildLargeIcon()

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
            // Tint the media card with the home page's forest-deep background so the card
            // (and its accent) match the app's identity. setColorized asks the system to
            // use this as the card background on the media style notification.
            .setColor(HOME_BG_COLOR)
            .setColorized(true)

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

    // Composite the launcher logo onto a forest-deep tile so the media card's large icon
    // blends with the home-page-colored (colorized) card background.
    //
    // NOTE: ic_launcher is an adaptive icon (XML), which BitmapFactory.decodeResource
    // CANNOT decode (returns null → crash). We load it as a Drawable (which supports
    // adaptive/vector drawables) and render it onto the canvas instead.
    private var cachedLargeIcon: android.graphics.Bitmap? = null
    private fun buildLargeIcon(): android.graphics.Bitmap? {
        cachedLargeIcon?.let { return it }
        val drawable = try {
            androidx.core.content.ContextCompat.getDrawable(this, R.mipmap.ic_launcher)
        } catch (e: Exception) {
            null
        } ?: return null

        val size = 256
        val out = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(out)
        canvas.drawColor(HOME_BG_COLOR)
        // Inset the logo slightly so the forest background shows as a border.
        val pad = (size * 0.12f).toInt()
        drawable.setBounds(pad, pad, size - pad, size - pad)
        drawable.draw(canvas)
        cachedLargeIcon = out
        return out
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
    private fun dispatchCarEvent(action: String, reciter: String? = null, surah: Int? = null, aya: Int? = null, positionMs: Long? = null, durationMs: Long? = null) {
        val plugin = RafeeqAutoPlugin.instance
        if (plugin != null) {
            plugin.sendCarEvent(action, reciter, surah, aya, positionMs, durationMs)
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

        @androidx.media3.common.util.UnstableApi
        override fun onPlay() {
            requestAudioFocus()
            if (jsDriving) {
                // JS brain is alive and owns playback — just resume the native player and
                // notify JS so its UI state stays in sync.
                player?.play()
                dispatchCarEvent("play")
            } else {
                // Cold start: make sound NOW from the persisted queue, then wake the brain.
                coldStartPlay()
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onPause() {
            player?.pause()
            dispatchCarEvent("pause")
        }

        override fun onSkipToNext() {
            // Verse/range progression lives in the JS brain — let it pick the next URL.
            dispatchCarEvent("next")
        }

        override fun onSkipToPrevious() {
            dispatchCarEvent("prev")
        }

        @androidx.media3.common.util.UnstableApi
        override fun onStop() {
            player?.pause()
            dispatchCarEvent("stop")
        }

        @androidx.media3.common.util.UnstableApi
        override fun onSeekTo(pos: Long) {
            player?.seekTo(pos)
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
