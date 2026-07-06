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
        // The surah of the persisted queue, so a native fallback (brain died) can restore page
        // markers / repeat-page / duration without the JS brain. 0 when unknown.
        private const val KEY_QUEUE_SURA = "queue_sura"

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

    // The surah being played by the NATIVE cold-start path (no JS brain). Non-zero only when
    // native is the playback driver; used to recompute the current page from the player's
    // track index so the page-nav buttons track playback. Cleared when JS takes over.
    private var nativeColdStartSura: Int = 0

    // ── Auto-resume suppression ─────────────────────────────────────────────────
    // Some head units IGNORE the EXTRA_RECENT opt-out and fire a bare onPlay() right after
    // connecting, auto-resuming the last media. We suppress that by only honoring onPlay()
    // once the user has actually interacted (browsed a list or selected a surah) in this
    // connection. Reset to false on each fresh browser connect (onGetRoot).
    private var userInteracted: Boolean = false

    // ── Native cold-start duration model ────────────────────────────────────────
    // The exact whole-surah duration (ms) fetched from the QF timestamp endpoint, so the car
    // duration bar shows the correct FIXED range total without the JS brain. 0 until fetched.
    private var nativeRangeTotalMs: Long = 0L
    // Per-verse durations learned from ExoPlayer (index → ms), to build the cumulative range
    // position = sum(prior verses) + current verse position.
    private val nativeVerseDurationsMs = HashMap<Int, Long>()
    // Background fetcher for the timestamp total (network must be off the main thread).
    private val nativeDurationExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    // Native repeat-page: the cold-list index range [first, last] of the page currently being
    // looped (inclusive). null when repeat-page is off or not on the native path.
    private var nativeRepeatPageFirst: Int = -1
    private var nativeRepeatPageLast: Int = -1

    // Last metadata pushed to the session. METADATA_KEY_DURATION is what scales the
    // notification's progress bar; re-setting metadata on every verse (even with the same
    // values) makes Android reinitialise the bar — the visible "reset" at each verse start.
    // We therefore only call setMetadata when the title or duration actually changes.
    private var lastMetaTitle: String? = null
    private var lastMetaDurationMs: Long = -1L

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
        nativeDurationExecutor.shutdownNow()
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
                    if (RafeeqAutoPlugin.brainAlive()) {
                        dispatchCarEvent("nativeTrackEnded", aya = index)
                    } else {
                        // The app was closed/terminated, so the brain that was feeding verses
                        // is gone. Don't let playback die: take over natively and keep going
                        // from the persisted queue (this is how the car keeps playing after the
                        // phone app is swiped away, like Spotify/Anghami). Hand the player the
                        // persisted flat list at the NEXT verse and self-advance from there.
                        Log.d("RafeeqMedia", "onEnded: brain gone, falling back to native self-advance from index=${index + 1}")
                        fallbackToNativeAdvance(index + 1)
                    }
                }
            }

            override fun onPosition(positionMs: Long, durationMs: Long) {
                // When the JS brain is driving, JS is the SINGLE source of truth for the
                // notification position/duration: it pushes the cumulative RANGE position
                // (elapsed across all verses) via updateState(). ExoPlayer's position here is
                // only PER-VERSE and resets to 0 at every track change, so publishing it would
                // yank the notification bar back to 0 each verse. We therefore only publish
                // natively during cold start (jsDriving == false), and otherwise just forward
                // the per-verse tick to JS to convert into a range position.
                if (jsDriving) {
                    dispatchCarEvent(
                        "nativePosition",
                        surah = player?.currentIndex() ?: 0,
                        positionMs = positionMs,
                        durationMs = durationMs,
                    )
                } else {
                    // Native cold start: learn this verse's duration so the cumulative range
                    // position is correct, then publish the CUMULATIVE position (not per-verse).
                    val idx = player?.currentIndex() ?: 0
                    if (durationMs > 0) nativeVerseDurationsMs[idx] = durationMs
                    publishPlaybackState(player?.isPlaying() == true, nativeCumulativePositionMs())
                }
            }

            override fun onPlayingChanged(isPlaying: Boolean) {
                // Show the media card only once playback actually begins.
                if (isPlaying) {
                    val title = session.controller.metadata
                        ?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "رفيق"
                    promoteToForeground(title, true)
                }
                if (jsDriving) {
                    // JS owns the play/pause state shown on the notification. ExoPlayer briefly
                    // reports paused→playing at EVERY verse boundary (old track ends, new track
                    // loads); publishing that here makes the notification play/pause button
                    // flicker. Instead we forward the raw state to JS, which debounces the
                    // transient between-verse pause and pushes a stable state via updateState().
                    dispatchCarEvent("nativePlaying", surah = if (isPlaying) 1 else 0)
                } else {
                    // Cold start (no JS brain yet): native is the only writer. Publish the
                    // cumulative range position so the bar doesn't reset each verse.
                    publishPlaybackState(isPlaying, nativeCumulativePositionMs())
                }
            }

            override fun onError(index: Int, message: String) {
                Log.e("RafeeqMedia", "player error at index=$index: $message")
            }

            override fun onColdListEnded() {
                // The whole surah just finished on the native path. Continue with the next surah
                // (like the JS brain's auto-advance) so playback doesn't stop at a surah boundary.
                playNextSurahNatively()
            }

            override fun onColdAdvanced(index: Int) {
                // The player just self-advanced or repeat-looped to `index`. Republish the
                // cumulative position NOW (don't wait for the next ~1s poll tick) so the bar
                // doesn't stay frozen at the previous verse — this is what left the bar stuck at
                // the surah's end when a repeat-page loop rolled back to the page's first verse.
                // derivePage=false: the page didn't change on a within-range loop, and the async
                // player index may not be settled yet.
                mainHandler.post {
                    val elapsed = nativeElapsedBeforeIndex(index)
                    publishPlaybackState(player?.isPlaying() == true, elapsed, derivePage = false)
                    // Snap to the EXACT page/verse start from the timestamp endpoint (the estimate
                    // can be slightly off); corrects the bar to the precise loop-back position.
                    correctNativeJumpPosition(index + 1)
                }
            }
        })
    }

    /**
     * Auto-advance to the NEXT surah on the native cold-start path (no JS brain), mirroring the
     * brain's handleQueueEnded. Builds the next surah's verse URLs, re-arms page markers / duration
     * and plays from verse 1. Stops after An-Nas (114).
     */
    @androidx.media3.common.util.UnstableApi
    private fun playNextSurahNatively() {
        val current = nativeColdStartSura
        if (current <= 0) return
        val next = current + 1
        if (next > 114) return // after An-Nas, stop
        val reciter = currentReciter.ifEmpty { RafeeqAudioUrls.DEFAULT_RECITER }
        val urls = RafeeqAudioUrls.buildSurahUrls(reciter, next)
        if (urls.isEmpty()) return
        Log.d("RafeeqMedia", "playNextSurahNatively: $current -> $next verses=${urls.size}")
        val title = surahArabicName(next)
        nativeColdStartSura = next
        pageMarkers = RafeeqAudioUrls.pageMarkersForSurah(next)
            .map { PageMarker(it.first, it.second) }
        currentPage = pageMarkers.firstOrNull()?.page ?: 0
        repeatPageActive = false
        player?.setColdRepeatRange(-1, -1)
        nativeVerseDurationsMs.clear()
        nativeVerseStartMs.clear()
        nativeRangeTotalMs = 0L
        fetchNativeRangeTotal(reciter, next)
        persistQueue(urls, 0, title, sura = next)
        player?.loadList(urls, 0, playWhenReady = true)
        updateTitleMetadata(title)
    }

    /**
     * Persist the last flat queue (resolved URLs/files + display title) so a cold-start
     * car play can begin immediately. Called by the plugin when JS pushes a native queue.
     */
    fun persistQueue(urls: List<String>, startIndex: Int, title: String, sura: Int = 0) {
        prefs.edit()
            .putString(KEY_QUEUE_URLS, urls.joinToString("\n"))
            .putInt(KEY_QUEUE_INDEX, startIndex)
            .putString(KEY_QUEUE_TITLE, title)
            .putInt(KEY_QUEUE_SURA, sura)
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
    fun setNativeQueue(urls: List<String>, startIndex: Int, title: String, autoplay: Boolean, sura: Int = 0) {
        jsDriving = true
        persistQueue(urls, startIndex, title, sura)
    }

    /** JS brain feeds a single resolved URL for one verse (it owns progression). */
    @androidx.media3.common.util.UnstableApi
    fun loadNativeTrack(url: String, index: Int, title: String, autoplay: Boolean) {
        jsDriving = true
        // JS brain is now driving — stop the native page-marker derivation; JS owns page
        // markers via updateState() from here on.
        nativeColdStartSura = 0
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

    /** The cold-list index the native player is currently on (verse index == aya - 1). Used by
     *  the plugin to refresh a pending selectSurah/play event's adopt-index at flush time, so the
     *  brain picks up where the car ACTUALLY is when the phone app opens — not the index frozen at
     *  selection time. Returns -1 when native isn't the cold-start driver. */
    @androidx.media3.common.util.UnstableApi
    fun nativeCurrentColdIndex(): Int =
        if (!jsDriving && nativeColdStartSura > 0) (player?.currentIndex() ?: -1) else -1

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
            jsDriving = false
            // Restore the page-nav state for the persisted surah so the prev/next-page +
            // repeat-page buttons appear on this resume path too (not just on a fresh surah
            // selection). Without this, pageMarkers stays empty and the buttons don't show.
            val sura = prefs.getInt(KEY_QUEUE_SURA, 0)
            if (sura > 0) {
                nativeColdStartSura = sura
                pageMarkers = RafeeqAudioUrls.pageMarkersForSurah(sura)
                    .map { PageMarker(it.first, it.second) }
                currentPage = RafeeqAudioUrls.estimatePageForVerse(sura, idx + 1)
                repeatPageActive = false
                player?.setColdRepeatRange(-1, -1)
                nativeVerseDurationsMs.clear()
                nativeVerseStartMs.clear()
                nativeRangeTotalMs = 0L
                fetchNativeRangeTotal(currentReciter.ifEmpty { RafeeqAudioUrls.DEFAULT_RECITER }, sura)
            }
            player?.loadList(urls, idx, playWhenReady = true)
            updateTitleMetadata(title)
            // Tell the brain which index ExoPlayer is already playing so it adopts that
            // position on handoff instead of restarting the queue from the beginning.
            dispatchCarEvent("play", aya = idx)
        } else {
            // Nothing played yet on this install (no persisted queue). Build Al-Fatiha's
            // public CDN URLs NATIVELY and play — no WebView wake needed (OEMs like MIUI
            // block that from a background service). The brain can still adopt later.
            Log.d("RafeeqMedia", "coldStartPlay: no persisted queue, native Al-Fatiha")
            val reciter = currentReciter.ifEmpty { RafeeqAudioUrls.DEFAULT_RECITER }
            val urls = RafeeqAudioUrls.buildSurahUrls(reciter, 1)
            if (urls.isNotEmpty()) {
                requestAudioFocus()
                jsDriving = false
                val title = surahArabicName(1)
                nativeColdStartSura = 1
                persistQueue(urls, 0, title, sura = 1)
                player?.loadList(urls, 0, playWhenReady = true)
                updateTitleMetadata(title)
                dispatchCarEvent("play", aya = 0)
            } else {
                // Should never happen (Al-Fatiha is always resolvable); fall back to wake.
                dispatchCarEvent("play")
            }
        }
    }

    /**
     * Take over playback NATIVELY after the JS brain has gone away (app closed/terminated while
     * audio was JS-driven). Re-arms the persisted flat queue at [nextIndex] so ExoPlayer keeps
     * self-advancing verse-by-verse with no brain — this is what lets the car keep playing after
     * the phone app is swiped away (Spotify/Anghami behavior). Restores the surah / page markers
     * / repeat-page range so the page-nav buttons and duration bar keep working too.
     */
    @androidx.media3.common.util.UnstableApi
    private fun fallbackToNativeAdvance(nextIndex: Int) {
        val persisted = loadPersistedQueue() ?: return
        val (urls, _, title) = persisted
        if (nextIndex < 0 || nextIndex >= urls.size) return // end of surah — nothing to continue

        jsDriving = false
        val sura = prefs.getInt(KEY_QUEUE_SURA, 0)
        if (sura > 0) {
            nativeColdStartSura = sura
            pageMarkers = RafeeqAudioUrls.pageMarkersForSurah(sura)
                .map { PageMarker(it.first, it.second) }
            currentPage = RafeeqAudioUrls.estimatePageForVerse(sura, nextIndex + 1)
            // Re-arm the repeat-page range if the user had it on (state survives in repeatPageActive
            // from the brain's last updateState). Otherwise leave self-advance linear.
            if (repeatPageActive) updateNativeRepeatPageRange()
            else player?.setColdRepeatRange(-1, -1)
        }
        requestAudioFocus()
        player?.loadList(urls, nextIndex, playWhenReady = true)
        updateTitleMetadata(title)
    }

    /**
     * Fetch the exact whole-surah duration (ms) for the native cold-start duration bar, on a
     * background thread (network). On success, set nativeRangeTotalMs and push the duration
     * into the session metadata so the bar gets its fixed scale. No-op if QF isn't configured.
     */
    @androidx.media3.common.util.UnstableApi
    private fun fetchNativeRangeTotal(reciter: String, sura: Int) {
        nativeDurationExecutor.execute {
            val totalMs = RafeeqQfApi.fetchChapterDurationMs(reciter, sura)
            if (totalMs > 0 && nativeColdStartSura == sura) {
                nativeRangeTotalMs = totalMs
                // setMetadata must run on the main thread.
                mainHandler.post {
                    if (nativeColdStartSura == sura) {
                        lastMetaDurationMs = totalMs
                        session.setMetadata(
                            MediaMetadataCompat.Builder()
                                .putString(
                                    MediaMetadataCompat.METADATA_KEY_TITLE,
                                    lastMetaTitle ?: surahArabicName(sura),
                                )
                                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, totalMs)
                                .build()
                        )
                        publishPlaybackState(player?.isPlaying() == true, nativeCumulativePositionMs())
                    }
                }
            }
        }
    }

    /** Exact verse-start positions (ms on the surah timeline) learned from the timestamp
     *  endpoint, keyed by cold-list index (== aya-1). Used to publish an ACCURATE landing
     *  position after a page jump instead of the averaged estimate (which overshoots). */
    private val nativeVerseStartMs = HashMap<Int, Long>()

    /**
     * After a page jump lands on `aya`, fetch that verse's EXACT start on the surah timeline
     * (timestamp_from) off-thread and re-publish the corrected bar position — but only if the
     * player is still on that verse (the user didn't jump again meanwhile). This fixes the
     * inaccurate landing time (e.g. Taha's last page showing ~32:00 instead of ~27:07).
     */
    @androidx.media3.common.util.UnstableApi
    private fun correctNativeJumpPosition(aya: Int) {
        val sura = nativeColdStartSura
        if (sura <= 0 || aya <= 0) return
        val idx = aya - 1
        // Use a cached exact start if we already have it.
        nativeVerseStartMs[idx]?.let { exact ->
            if (player?.currentIndex() == idx) publishPlaybackState(player?.isPlaying() == true, exact, derivePage = false)
            return
        }
        val reciter = currentReciter.ifEmpty { RafeeqAudioUrls.DEFAULT_RECITER }
        nativeDurationExecutor.execute {
            val start = RafeeqQfApi.fetchVerseStartMs(reciter, sura, aya)
            if (start >= 0) {
                mainHandler.post {
                    nativeVerseStartMs[idx] = start
                    // Only apply if still on the same surah and verse (no later jump/advance).
                    if (nativeColdStartSura == sura && player?.currentIndex() == idx) {
                        publishPlaybackState(player?.isPlaying() == true, start, derivePage = false)
                    }
                }
            }
        }
    }

    /** Recompute the cold-list index range of the page being looped (native repeat-page).
     *  Cleared when repeat is off. Page = the verses whose Mushaf page == currentPage. */
    /** Skip the native cold list to a verse index, keeping the page + repeat range in sync.
     *  When repeat-page is on and the skip crosses a page boundary, the loop range must follow
     *  the verse we land on (otherwise the old page's range would still loop). Sets the new
     *  page's range and jumps atomically so the self-advance can't use a stale range. */
    @androidx.media3.common.util.UnstableApi
    private fun nativeSkipToIndex(index: Int) {
        if (index < 0) return
        if (nativeColdStartSura > 0) {
            val newPage = RafeeqAudioUrls.estimatePageForVerse(nativeColdStartSura, index + 1)
            if (newPage > 0) currentPage = newPage
        }
        if (repeatPageActive && nativeColdStartSura > 0) {
            val (rf, rl) = nativePageIndexRange(currentPage)
            nativeRepeatPageFirst = rf
            nativeRepeatPageLast = rl
            player?.jumpToColdIndexWithRange(index, rf, rl)
        } else {
            player?.jumpToColdIndex(index)
        }
    }

    /** The cold-list index range [first, last] of all verses on `page` of the current native
     *  surah (inclusive). (-1,-1) if none. cold-list index == aya-1. */
    private fun nativePageIndexRange(page: Int): Pair<Int, Int> {
        if (nativeColdStartSura <= 0) return -1 to -1
        val count = RafeeqAudioUrls.SURAH_VERSE_COUNTS[nativeColdStartSura] ?: return -1 to -1
        var first = -1
        var last = -1
        for (aya in 1..count) {
            val p = RafeeqAudioUrls.estimatePageForVerse(nativeColdStartSura, aya)
            if (p == page) {
                if (first == -1) first = aya - 1
                last = aya - 1
            } else if (first != -1) {
                break
            }
        }
        return first to last
    }

    @androidx.media3.common.util.UnstableApi
    private fun updateNativeRepeatPageRange() {
        if (!repeatPageActive || nativeColdStartSura <= 0) {
            nativeRepeatPageFirst = -1
            nativeRepeatPageLast = -1
            player?.setColdRepeatRange(-1, -1)
            return
        }
        val (first, last) = nativePageIndexRange(currentPage)
        nativeRepeatPageFirst = first
        nativeRepeatPageLast = last
        player?.setColdRepeatRange(first, last)
    }

    /** Cumulative range position (ms) for native cold start = sum of the verses BEFORE the
     *  current one + the current verse's position. Verses we've already played have exact
     *  durations; for not-yet-played verses (e.g. after a forward page jump) we estimate with
     *  the average known verse duration so the bar lands at roughly the right spot, then
     *  self-corrects as real durations arrive. */
    @androidx.media3.common.util.UnstableApi
    private fun nativeCumulativePositionMs(): Long {
        val idx = player?.currentIndex() ?: 0
        return nativeElapsedBeforeIndex(idx) + (player?.currentPositionMs() ?: 0L)
    }

    /** Sum of verse durations BEFORE cold-list index `idx`. Prefers the EXACT verse start
     *  (timestamp_from of verse idx == the elapsed time before it) when we've learned it from the
     *  timestamp endpoint; otherwise falls back to summing exact-where-known per-verse durations
     *  and an average estimate for the rest. Used to seed the bar on a page jump before the new
     *  verse's position ticks arrive. */
    private fun nativeElapsedBeforeIndex(idx: Int): Long {
        // Exact: timestamp_from of verse `idx` is precisely the cumulative time before it.
        nativeVerseStartMs[idx]?.let { return it }
        val known = nativeVerseDurationsMs.values
        val avg = if (known.isNotEmpty()) known.sum() / known.size else 0L
        var elapsed = 0L
        for (i in 0 until idx) elapsed += nativeVerseDurationsMs[i] ?: avg
        return elapsed
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private fun updateTitleMetadata(title: String) {
        // Skip if the title is unchanged. loadNativeTrack() calls this for EVERY verse, and
        // re-setting metadata (a) drops METADATA_KEY_DURATION to 0 — collapsing the
        // notification progress bar until the next updateState restores it — and (b) makes
        // Android reinitialise the bar. Both show up as the bar "resetting" at each verse.
        if (title == lastMetaTitle) return
        lastMetaTitle = title
        // Preserve the last known duration so the bar keeps its scale across the title change.
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putLong(
                    MediaMetadataCompat.METADATA_KEY_DURATION,
                    if (lastMetaDurationMs >= 0) lastMetaDurationMs else 0L,
                )
                .build()
        )
    }

    /**
     * Publish a PlaybackState that ALWAYS re-applies the current custom actions (page-nav,
     * replay). Used by the per-second position ticks and play/pause changes so they never
     * wipe out the page buttons that updateState added.
     */
    @androidx.media3.common.util.UnstableApi
    private fun publishPlaybackState(playing: Boolean, positionMs: Long, derivePage: Boolean = true) {
        // On the native cold-start path (no JS brain), keep the page-nav buttons live: derive
        // the current page from the player's track index (list index i == aya i+1) and rebuild
        // the custom actions so prev/next-page highlight the right page as playback advances.
        // `derivePage=false` right after a page jump (the jump already set currentPage and the
        // async player index isn't settled yet).
        if (nativeColdStartSura > 0) {
            if (derivePage) {
                val idx = player?.currentIndex() ?: 0
                val aya = idx + 1
                val page = RafeeqAudioUrls.estimatePageForVerse(nativeColdStartSura, aya)
                if (page > 0 && page != currentPage) currentPage = page
            }
            currentCustomActions = buildPageCustomActions()
        }
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

    /**
     * Build the prev-page / next-page / replay-page custom actions from the current
     * pageMarkers + currentPage + repeatPageActive. Returns empty when the surah fits on a
     * single page. Shared by updateState (JS-driven) and the native cold-start path so the
     * page-nav buttons appear in both — no-op slots keep the button positions fixed.
     */
    private fun buildPageCustomActions(): List<PlaybackStateCompat.CustomAction> {
        val actions = mutableListOf<PlaybackStateCompat.CustomAction>()
        if (pageMarkers.size > 1) {
            val currentIdx = pageMarkers.indexOfFirst { it.page == currentPage }
                .let { if (it < 0) pageMarkers.indexOfFirst { it.page >= currentPage }.let { i -> if (i < 0) pageMarkers.lastIndex else i } else it }

            val prevMarker = if (currentIdx > 0) pageMarkers[currentIdx - 1] else null
            val nextMarker = if (currentIdx < pageMarkers.lastIndex) pageMarkers[currentIdx + 1] else null
            val currentMarker = if (currentIdx >= 0 && currentIdx <= pageMarkers.lastIndex) pageMarkers[currentIdx] else null

            // Slot 0 — prev-page (no-op when on the first page). Uses the built-in fast-rewind
            // (double chevron ◀◀) so it's visually distinct from the single-triangle prev-VERSE
            // skip, and renders reliably in Android Auto (custom vectors hit AA's icon cache).
            actions.add(
                if (prevMarker != null)
                    PlaybackStateCompat.CustomAction.Builder("prevPage", "◀ ص ${prevMarker.page}", android.R.drawable.ic_media_rew)
                        .setExtras(Bundle().apply { putInt("aya", prevMarker.aya); putInt("page", prevMarker.page) }).build()
                else
                    PlaybackStateCompat.CustomAction.Builder("prevPage_noop", "◀", android.R.drawable.ic_media_rew).build()
            )
            // Slot 1 — next-page (no-op when on the last page)
            actions.add(
                if (nextMarker != null)
                    PlaybackStateCompat.CustomAction.Builder("nextPage", "ص ${nextMarker.page} ▶", android.R.drawable.ic_media_ff)
                        .setExtras(Bundle().apply { putInt("aya", nextMarker.aya); putInt("page", nextMarker.page) }).build()
                else
                    PlaybackStateCompat.CustomAction.Builder("nextPage_noop", "▶", android.R.drawable.ic_media_ff).build()
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
        return actions
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
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            // Permanent loss (e.g. another app takes over): pause via JS so
                            // the in-app play/pause button reflects the paused state.
                            hasAudioFocus = false
                            player?.pause()
                            if (jsDriving) dispatchCarEvent("pause")
                        }
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                            // Transient loss (e.g. notification sound, system UI): pause the
                            // native player silently. Do NOT notify JS — this is a momentary
                            // interruption (a few hundred ms). Telling JS would flip the
                            // in-app button to paused and prevent auto-resume on focus regain.
                            hasAudioFocus = false
                            player?.pause()
                        }
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            // Focus returned after a transient loss: resume automatically so
                            // playback continues without the user having to press play again.
                            hasAudioFocus = true
                            if (player?.isPlaying() == false) {
                                player?.play()
                            }
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
        super.onStartCommand(intent, flags, startId)
        // START_STICKY so that if the system kills the process while we're a foreground media
        // service (e.g. the user swipes the app away from Recents), Android keeps/recreates the
        // service rather than tearing playback down with the Activity. This is what lets car
        // playback continue after the phone app is closed.
        return START_STICKY
    }

    // ── MediaBrowserServiceCompat ──────────────────────────────────────────────

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot? {
        // Opt OUT of Android Auto / system playback resumption. On connect (or boot), the
        // platform probes for a resumable session by calling onGetRoot with EXTRA_RECENT=true;
        // if we return a root, it then auto-plays the last media. Returning null for that
        // probe tells the system we have nothing to resume, so connecting to the car never
        // auto-starts the last surah — playback only begins on an explicit user action.
        if (rootHints?.getBoolean(BrowserRoot.EXTRA_RECENT) == true) {
            return null
        }
        // Mark the start of a fresh browser connection. An onPlay() with no user interaction
        // since this point is an auto-resume → suppressed (see SessionCallback.onPlay).
        userInteracted = false
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
                // The user opened the reciter list — a real interaction, so a later onPlay()
                // is a genuine press, not an auto-resume.
                userInteracted = true
                if (reciters.isEmpty()) {
                    result.detach()
                    pendingReciters.add(result)
                } else {
                    result.sendResult(buildReciterItems())
                }
            }
            parentId.startsWith(RECITER_PREFIX) -> {
                userInteracted = true
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

        // Build prev-page / next-page / replay custom actions from the current pageMarkers/
        // currentPage/repeatPageActive (shared with the native cold-start path).
        val actions = buildPageCustomActions()
        currentCustomActions = actions
        actions.forEach { stateBuilder.addCustomAction(it) }
        session.setPlaybackState(stateBuilder.build())

        // Only push metadata when the title or duration actually changed. Re-sending it on
        // every verse (with the now-fixed range duration) made Android reinitialise the
        // notification progress bar — the bar/timestamp "reset" the user saw at verse start.
        if (surahName != lastMetaTitle || durationMs != lastMetaDurationMs) {
            lastMetaTitle = surahName
            lastMetaDurationMs = durationMs
            val metadata = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, surahName)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                .build()
            session.setMetadata(metadata)
        }

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
            // Suppress auto-resume on connect. Some head units fire onPlay() after connecting
            // (ignoring the EXTRA_RECENT opt-out) to resume the last session. We never want that:
            // playback should only start from an explicit user action. So if nothing is already
            // playing and the user hasn't interacted yet in this connection (browsed a list or
            // selected a surah), treat this onPlay() as an unwanted auto-resume and ignore it.
            // A real play press always follows browsing/selecting (which sets userInteracted) or
            // resumes something already loaded.
            if (!userInteracted && player?.isPlaying() != true) {
                Log.d("RafeeqMedia", "onPlay: suppressing auto-resume (no user interaction yet)")
                return
            }
            // A real press counts as interaction so subsequent plays in this connection pass.
            userInteracted = true
            requestAudioFocus()
            if (jsDriving) {
                // JS brain is alive and owns playback — just resume the native player and
                // notify JS so its UI state stays in sync.
                player?.play()
                dispatchCarEvent("play")
            } else if (player?.isResumable() == true) {
                // A track is already loaded and merely PAUSED (native cold-start playback that
                // the user paused). Resume it in place — do NOT call coldStartPlay(), which would
                // reload the persisted queue from its start index and restart the surah from the
                // beginning. This was the pause→play "restarts from the beginning" bug.
                player?.play()
            } else {
                // Nothing loaded yet — genuine cold start: make sound NOW from the persisted
                // queue, then wake the brain.
                coldStartPlay()
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onPause() {
            player?.pause()
            dispatchCarEvent("pause")
        }

        @androidx.media3.common.util.UnstableApi
        override fun onSkipToNext() {
            if (jsDriving) {
                // Verse/range progression lives in the JS brain — let it pick the next URL.
                dispatchCarEvent("next")
            } else {
                // Native cold start: step the cold list forward one verse.
                val idx = player?.currentIndex() ?: 0
                nativeSkipToIndex(idx + 1)
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onSkipToPrevious() {
            if (jsDriving) {
                dispatchCarEvent("prev")
            } else {
                val idx = player?.currentIndex() ?: 0
                if (idx > 0) nativeSkipToIndex(idx - 1)
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onStop() {
            player?.pause()
            dispatchCarEvent("stop")
        }

        @androidx.media3.common.util.UnstableApi
        override fun onSeekTo(pos: Long) {
            // `pos` is an absolute position on the RANGE timeline (cumulative across all
            // verses) because that's the duration/position we publish. ExoPlayer's own
            // timeline is only the CURRENT verse, so seeking it directly to a range
            // position would be out of bounds. When JS is driving, let the brain map the
            // range position to the right verse + per-verse offset (seekToMs) and load it;
            // it will then seek the native player to the in-verse offset. Only seek the
            // player directly during cold start (no brain yet).
            if (jsDriving) {
                dispatchCarEvent("seekTo", positionMs = pos)
            } else {
                player?.seekTo(pos)
                dispatchCarEvent("seekTo", positionMs = pos)
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onCustomAction(action: String?, extras: Bundle?) {
            if (action == null) return
            if (action == "prevPage" || action == "nextPage") {
                val aya = extras?.getInt("aya", -1) ?: -1
                val page = extras?.getInt("page", -1) ?: -1
                if (aya > 0) {
                    currentPage = page
                    if (jsDriving) {
                        dispatchCarEvent("jumpToAya", aya = aya)
                    } else {
                        // Native cold start: the cold list is verse 1..N at index 0..N-1, so the
                        // page's first aya maps to index aya-1. Jump AND (re)arm the repeat range
                        // for the new page ATOMICALLY so the self-advance can't loop the old page
                        // back over the jump.
                        if (repeatPageActive) {
                            val (rf, rl) = nativePageIndexRange(page)
                            nativeRepeatPageFirst = rf
                            nativeRepeatPageLast = rl
                            player?.jumpToColdIndexWithRange(aya - 1, rf, rl)
                        } else {
                            player?.jumpToColdIndex(aya - 1)
                        }
                        // Immediately reflect the jumped-to position on the bar (don't wait for
                        // the next tick) using the local estimate, then correct it with the EXACT
                        // verse start from the timestamp endpoint (the estimate uses an averaged
                        // per-verse duration that overshoots — e.g. Taha's last page landed at
                        // ~32:00 instead of the true ~27:07). jumpToColdIndex posts async, so we
                        // compute from aya-1 and skip page-derivation (currentPage set above).
                        val jumpElapsed = nativeElapsedBeforeIndex(aya - 1)
                        publishPlaybackState(true, jumpElapsed, derivePage = false)
                        correctNativeJumpPosition(aya)
                    }
                }
            }
            if (action == "replayPage") {
                val aya = extras?.getInt("aya", -1) ?: -1
                val page = extras?.getInt("page", -1) ?: -1
                if (jsDriving) {
                    if (aya > 0) {
                        currentPage = page
                        dispatchCarEvent("replayPage", aya = aya)
                    }
                } else {
                    // Native cold start: repeat the page where playback ACTUALLY is now, not
                    // the page baked into the button's extras (which can be stale if playback
                    // crossed a page boundary since the button was last rebuilt). Derive the
                    // current page from the player's track index (list index i == aya i+1).
                    if (nativeColdStartSura > 0) {
                        val idx = player?.currentIndex() ?: 0
                        currentPage = RafeeqAudioUrls.estimatePageForVerse(nativeColdStartSura, idx + 1)
                    }
                    repeatPageActive = !repeatPageActive
                    updateNativeRepeatPageRange()
                    // Rebuild the buttons so the repeat icon reflects the new on/off state.
                    currentCustomActions = buildPageCustomActions()
                    publishPlaybackState(player?.isPlaying() == true, nativeCumulativePositionMs())
                }
            }
        }

        @androidx.media3.common.util.UnstableApi
        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            if (mediaId == null) return
            if (mediaId.startsWith(SURAH_PREFIX)) {
                val surahNumber = mediaId.removePrefix(SURAH_PREFIX).toIntOrNull() ?: return

                // Explicit user selection — any onPlay() from here on is a real press.
                userInteracted = true
                requestAudioFocus()

                // Immediately acknowledge the selection so Android Auto exits the
                // "Getting your selection..." screen.
                val bufferingState = PlaybackStateCompat.Builder()
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_STOP
                    )
                    .setState(PlaybackStateCompat.STATE_BUFFERING, 0L, 0f)
                    .build()
                session.setPlaybackState(bufferingState)

                // ── Play NATIVELY, no WebView required ──────────────────────────────────
                // Build the whole surah's public CDN URLs and play them on ExoPlayer right
                // now. This is the fix for the cold-start "no sound" bug: resolving audio no
                // longer depends on waking the WebView (which MIUI and other OEMs block from
                // a background service), so the car plays whether the phone is locked or not.
                val reciter = currentReciter.ifEmpty { RafeeqAudioUrls.DEFAULT_RECITER }
                val urls = RafeeqAudioUrls.buildSurahUrls(reciter, surahNumber)
                if (urls.isNotEmpty()) {
                    val title = surahArabicName(surahNumber)
                    Log.d("RafeeqMedia", "onPlayFromMediaId: native play surah=$surahNumber reciter=$reciter verses=${urls.size}")
                    // jsDriving=false → player self-advances through the flat list and native
                    // is the sole MediaSession writer (publishPlaybackState). If the WebView is
                    // alive (or wakes), the brain can still take over via dispatchCarEvent below.
                    jsDriving = false
                    // Compute the page-nav markers natively so prev/next-page + repeat-page
                    // buttons appear even without the WebView/brain (cold start).
                    nativeColdStartSura = surahNumber
                    pageMarkers = RafeeqAudioUrls.pageMarkersForSurah(surahNumber)
                        .map { PageMarker(it.first, it.second) }
                    currentPage = pageMarkers.firstOrNull()?.page ?: 0
                    // Fresh surah → repeat-page off.
                    repeatPageActive = false
                    player?.setColdRepeatRange(-1, -1)
                    // Reset + fetch the exact whole-surah duration for the bar (off-thread).
                    nativeVerseDurationsMs.clear()
                    nativeVerseStartMs.clear()
                    nativeRangeTotalMs = 0L
                    fetchNativeRangeTotal(reciter, surahNumber)
                    persistQueue(urls, 0, title, sura = surahNumber)
                    player?.loadList(urls, 0, playWhenReady = true)
                    updateTitleMetadata(title)
                }

                // Still notify the brain so it adopts/takes over WHEN available (repeat/range
                // logic). On a locked MIUI cold start this wake is blocked and simply no-ops —
                // native playback above already produced sound, so we don't depend on it.
                // `aya` carries the cold-list index the native player is CURRENTLY on so the brain
                // adopts that position instead of restarting the surah from verse 1 — this is what
                // makes opening the phone app later pick up where the car already is, rather than
                // firing a fresh play from the beginning.
                dispatchCarEvent(
                    "selectSurah",
                    reciter = currentReciter,
                    surah = surahNumber,
                    aya = player?.currentIndex() ?: 0,
                )
            }
        }
    }

    /** Arabic surah name for the notification/metadata title, from the browse-tree data. */
    private fun surahArabicName(number: Int): String {
        return surahs.firstOrNull { it.number == number }?.arabicName
            ?: RafeeqContentDefaults.SURAHS.firstOrNull { it.number == number }?.arabicName
            ?: "رفيق"
    }
}
