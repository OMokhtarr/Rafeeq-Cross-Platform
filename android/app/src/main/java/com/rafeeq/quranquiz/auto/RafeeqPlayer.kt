package com.rafeeq.quranquiz.auto

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * RafeeqPlayer — the "dumb" native playback engine.
 *
 * It does NOT own the queue/repeat/range/page logic. That lives in the JS brain
 * (usePlaybackQueue). This player only ever plays ONE track at a time:
 *   - JS resolves the next verse to a URL/file and calls [load].
 *   - When the track ends, [onEnded] fires so the JS brain decides what comes next.
 *
 * Why "dumb": it lets us keep a single source of truth for progression logic in JS
 * (shared with web/iOS), while ExoPlayer provides reliable native audio output that
 * works on Android Auto cold start without a running WebView.
 *
 * Cold start: the service can also hand this player a pre-resolved flat list of URLs
 * (the last queue persisted to disk) and walk it index-by-index via [loadList], so the
 * car has instant sound before the WebView/JS brain wakes up.
 *
 * ExoPlayer requires its API calls on the main thread, so every public method posts to
 * the main looper.
 */
@androidx.media3.common.util.UnstableApi
class RafeeqPlayer(
    private val context: Context,
    private val callbacks: Callbacks,
) {

    interface Callbacks {
        /** Fired when the current track finishes (ExoPlayer STATE_ENDED). */
        fun onEnded(index: Int)
        /** Fired roughly once per second with the current position/duration in ms. */
        fun onPosition(positionMs: Long, durationMs: Long)
        /** Fired when playing/paused changes so the service can sync the MediaSession. */
        fun onPlayingChanged(isPlaying: Boolean)
        /** Fired on a fatal playback error for the current track. */
        fun onError(index: Int, message: String)
    }

    private val main = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null

    // The flat list of resolved URLs the player can walk on its own during cold start,
    // before the JS brain is alive. When JS is driving, it loads one URL at a time and
    // this stays empty.
    private var coldList: List<String> = emptyList()
    private var currentIndex: Int = 0

    // When set, the currently-loaded track is a one-shot intro (e.g. bismillah). On end,
    // this callback fires instead of the normal onEnded/advance, then is cleared.
    private var introCallback: (() -> Unit)? = null

    private val positionPoller = object : Runnable {
        override fun run() {
            val p = player ?: return
            if (p.isPlaying) {
                val dur = if (p.duration == C.TIME_UNSET) 0L else p.duration
                callbacks.onPosition(p.currentPosition, dur)
            }
            main.postDelayed(this, 1000)
        }
    }

    private fun ensurePlayer(): ExoPlayer {
        player?.let { return it }
        val p = ExoPlayer.Builder(context)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    // One-shot intro (bismillah): fire its completion and stop — do not
                    // advance any queue. The brain will load the first real verse next.
                    val intro = introCallback
                    if (intro != null) {
                        introCallback = null
                        Log.d("RafeeqPlayer", "intro ended")
                        intro()
                        return
                    }
                    Log.d("RafeeqPlayer", "track ended index=$currentIndex")
                    callbacks.onEnded(currentIndex)
                    // Cold-start self-advance: if we're walking a pre-resolved list and JS
                    // hasn't taken over, move to the next URL ourselves.
                    if (coldList.isNotEmpty() && currentIndex + 1 < coldList.size) {
                        loadInternal(coldList, currentIndex + 1, playWhenReady = true)
                    }
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                callbacks.onPlayingChanged(isPlaying)
                if (isPlaying) {
                    main.removeCallbacks(positionPoller)
                    main.post(positionPoller)
                } else {
                    main.removeCallbacks(positionPoller)
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e("RafeeqPlayer", "player error index=$currentIndex: ${error.message}")
                // If an intro failed, don't leave the caller hanging — complete it so the
                // first real verse still plays.
                val intro = introCallback
                if (intro != null) {
                    introCallback = null
                    intro()
                    return
                }
                callbacks.onError(currentIndex, error.message ?: "playback error")
            }
        })
        player = p
        return p
    }

    /**
     * Load and play a single resolved source (http URL or file:// path). Used when the
     * JS brain is driving — it resolves one verse at a time and calls this.
     */
    fun load(source: String, index: Int, playWhenReady: Boolean = true) {
        main.post {
            coldList = emptyList()
            loadInternal(listOf(source), 0, playWhenReady, indexOverride = index)
        }
    }

    /**
     * Play a one-shot intro track (e.g. bismillah). [onComplete] fires when it ends (or
     * immediately on error) so the caller can then load the first real verse. Does not
     * affect the queue/cold-list.
     */
    fun playIntro(source: String, onComplete: () -> Unit) {
        main.post {
            coldList = emptyList()
            introCallback = onComplete
            val p = ensurePlayer()
            p.setMediaItem(MediaItem.fromUri(Uri.parse(source)))
            p.prepare()
            p.playWhenReady = true
        }
    }

    /**
     * Hand the player a pre-resolved flat list (cold-start path). The player walks it
     * itself, firing onEnded per track, until JS takes over with [load].
     */
    fun loadList(sources: List<String>, startIndex: Int, playWhenReady: Boolean = true) {
        main.post {
            coldList = sources
            loadInternal(sources, startIndex, playWhenReady)
        }
    }

    private fun loadInternal(
        sources: List<String>,
        index: Int,
        playWhenReady: Boolean,
        indexOverride: Int? = null,
    ) {
        val p = ensurePlayer()
        currentIndex = indexOverride ?: index
        val src = sources.getOrNull(index) ?: return
        p.setMediaItem(MediaItem.fromUri(Uri.parse(src)))
        p.prepare()
        p.playWhenReady = playWhenReady
    }

    fun play() = main.post { player?.playWhenReady = true }
    fun pause() = main.post { player?.playWhenReady = false }

    fun seekTo(positionMs: Long) = main.post { player?.seekTo(positionMs) }

    fun setPlaybackSpeed(speed: Float) = main.post {
        player?.setPlaybackSpeed(if (speed > 0f) speed else 1f)
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    fun currentPositionMs(): Long = player?.currentPosition ?: 0L

    /** The index of the track currently loaded (within the cold list or single load). */
    fun currentIndex(): Int = currentIndex

    fun release() = main.post {
        main.removeCallbacks(positionPoller)
        player?.release()
        player = null
        coldList = emptyList()
    }
}
