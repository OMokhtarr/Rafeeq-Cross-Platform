package com.rafeeq.quranquiz.prayer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.rafeeq.quranquiz.R

/**
 * The app logo cut to a circle — shared by the ringing screen, its
 * notification and the fallback notification, so all three show the same
 * round badge.
 *
 * ic_launcher_round is an adaptive icon, which draws with the device's own
 * launcher mask; on Xiaomi that mask is a square tile, not a circle. Cutting
 * the circle here makes the shape the same on every device.
 */
object AlarmLogo {

    fun round(ctx: Context, sizePx: Int): Bitmap? {
        val square = ContextCompat.getDrawable(ctx, R.mipmap.ic_launcher_round)
            ?.toBitmap(sizePx, sizePx)
            ?: return null
        val out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        // A shader-filled circle rather than clipPath, which leaves a jagged edge.
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }
        val r = sizePx / 2f
        Canvas(out).drawCircle(r, r, r, paint)
        return out
    }
}
