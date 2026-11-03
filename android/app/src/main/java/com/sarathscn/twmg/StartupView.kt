package com.sarathscn.twmg

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.sarathscn.twmg.StartupRules.Stage

/**
 * The animated startup screen: brand tile, a slow ambient glow and a fluid progress bar, drawn with
 * plain views so it costs little and needs no blur. Everything moves on animators, so turning off
 * animations in Android settings (or the battery saver) leaves a still, fully readable screen.
 */
@SuppressLint("ViewConstructor")
class StartupView(context: Context, private val dark: Boolean, private val onRetry: () -> Unit) : FrameLayout(context) {
    private val dp = resources.displayMetrics.density
    private val background = if (dark) 0xFF17221D.toInt() else 0xFFF6F6F1.toInt()
    private val textColor = if (dark) 0xFFE2E8DC.toInt() else 0xFF293B31.toInt()
    private val mutedColor = if (dark) 0xFF9DA895.toInt() else 0xFF5F6B5D.toInt()
    private val accent = if (dark) 0xFF9FBE8E.toInt() else 0xFF2D6048.toInt()

    private val glow = GlowView()
    private val tile = ImageView(context)
    private val bar = FluidBar()
    private val status = TextView(context)
    private val detail = TextView(context)
    private val retry = Button(context)
    private val column = LinearLayout(context)
    private val scroller = ScrollView(context)
    private val loops = mutableListOf<ValueAnimator>()
    private var shown: Stage? = null
    private val moves get() = ValueAnimator.areAnimatorsEnabled()

    init {
        setBackgroundColor(background)
        isClickable = true
        addView(glow, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        column.apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val pad = (28 * dp).toInt()
            setPadding(pad, pad, pad, pad)
        }
        tile.apply {
            setImageResource(R.drawable.ic_launcher_foreground)
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = tileBackground()
            elevation = 10 * dp
            contentDescription = null
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        column.addView(tile, LinearLayout.LayoutParams((92 * dp).toInt(), (92 * dp).toInt()))
        column.addView(TextView(context).apply {
            setText(R.string.app_name); textSize = 26f; setTextColor(textColor); typeface = Typeface.create("sans-serif-medium", Typeface.BOLD); letterSpacing = -0.01f; gravity = Gravity.CENTER
            setPadding(0, (20 * dp).toInt(), 0, 0)
        })
        column.addView(TextView(context).apply {
            setText(R.string.startup_tagline); textSize = 13f; setTextColor(mutedColor); gravity = Gravity.CENTER
            setPadding(0, (2 * dp).toInt(), 0, (26 * dp).toInt())
        })
        column.addView(bar, LinearLayout.LayoutParams((132 * dp).toInt(), (5 * dp).toInt()))
        status.apply {
            textSize = 14f; setTextColor(mutedColor); gravity = Gravity.CENTER
            setPadding(0, (16 * dp).toInt(), 0, 0)
            accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
        }
        column.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        detail.apply {
            textSize = 14f; setTextColor(mutedColor); gravity = Gravity.CENTER; visibility = GONE; maxWidth = (340 * dp).toInt()
            setPadding(0, (8 * dp).toInt(), 0, (20 * dp).toInt())
        }
        column.addView(detail, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        retry.apply {
            setText(R.string.startup_retry); isAllCaps = false; textSize = 15f; visibility = GONE
            setTextColor(if (dark) 0xFF17221D.toInt() else Color.WHITE)
            background = GradientDrawable().apply { setColor(accent); cornerRadius = 14 * dp }
            minHeight = (48 * dp).toInt(); minWidth = (160 * dp).toInt()
            stateListAnimator = null
            setOnClickListener { onRetry() }
        }
        column.addView(retry, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        // Scrolls on tiny or landscape screens and with very large system text.
        scroller.apply { isFillViewport = true; isVerticalScrollBarEnabled = false; clipToPadding = false }
        scroller.addView(FrameLayout(context).apply {
            addView(column, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        }, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(scroller, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (moves) {
            tile.alpha = 0f; tile.scaleX = 0.86f; tile.scaleY = 0.86f
            tile.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(460).setInterpolator(DecelerateInterpolator(1.6f)).start()
        }
    }

    private fun tileBackground(): LayerDrawable {
        val radius = 26 * dp
        val body = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xFF3B7A5C.toInt(), 0xFF2D6048.toInt(), 0xFF234D3A.toInt())).apply { cornerRadius = radius }
        // The glass edge: a thin lit rim and a soft highlight across the top, painted rather than blurred.
        val rim = GradientDrawable().apply { setColor(Color.TRANSPARENT); cornerRadius = radius; setStroke((1 * dp).toInt().coerceAtLeast(1), 0x40FFFFFF) }
        val shine = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0x33FFFFFF, 0x00FFFFFF)).apply { cornerRadius = radius }
        return LayerDrawable(arrayOf(body, shine, rim)).apply { setLayerInset(1, 0, 0, 0, (46 * dp).toInt()) }
    }

    /** Keeps the content clear of the status bar, navigation bar and display cutout. */
    fun setSafeInsets(left: Int, top: Int, right: Int, bottom: Int) = scroller.setPadding(left, top, right, bottom)

    fun show(stage: Stage) {
        if (stage == shown) return
        shown = stage
        val failed = stage == Stage.NO_INTERNET || stage == Stage.SERVER_UNAVAILABLE || stage == Stage.FAILED
        status.setText(when (stage) {
            Stage.INITIALIZING -> R.string.startup_initializing
            Stage.RESTORING_SESSION -> R.string.startup_restoring
            Stage.CONNECTING -> R.string.startup_connecting
            Stage.LOADING_DATA -> R.string.startup_loading
            Stage.RETRYING -> R.string.startup_retrying
            Stage.READY, Stage.AUTH_EXPIRED -> R.string.startup_ready
            Stage.NO_INTERNET -> R.string.startup_no_internet
            Stage.SERVER_UNAVAILABLE -> R.string.startup_server
            Stage.FAILED -> R.string.startup_failed
        })
        status.setTextColor(if (failed) textColor else mutedColor)
        status.textSize = if (failed) 18f else 14f
        status.typeface = if (failed) Typeface.create("sans-serif-medium", Typeface.NORMAL) else Typeface.DEFAULT
        detail.visibility = if (failed) VISIBLE else GONE
        if (failed) detail.setText(when (stage) {
            Stage.NO_INTERNET -> R.string.startup_no_internet_detail
            Stage.SERVER_UNAVAILABLE -> R.string.startup_server_detail
            else -> R.string.startup_failed_detail
        })
        retry.visibility = if (failed) VISIBLE else GONE
        bar.visibility = if (failed) GONE else VISIBLE
        if (failed) { status.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED); retry.post { retry.requestFocus() } }
    }

    /** Fades out, then removes itself. Runs [done] once, whether or not animations are on. */
    fun dismiss(done: () -> Unit) {
        stopLoops()
        val finish = { (parent as? ViewGroup)?.removeView(this); done() }
        if (!moves) { finish(); return }
        animate().alpha(0f).scaleX(1.02f).scaleY(1.02f).setDuration(260).setInterpolator(DecelerateInterpolator()).setListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) { finish() }
        }).start()
    }

    fun startLoops() {
        if (!moves || loops.isNotEmpty()) return
        loops += ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 7000; repeatMode = ValueAnimator.REVERSE; repeatCount = ValueAnimator.INFINITE; interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { glow.phase = it.animatedValue as Float; glow.invalidate() }
            start()
        }
        loops += ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1300; repeatCount = ValueAnimator.INFINITE; interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { if (bar.visibility == VISIBLE) { bar.phase = it.animatedValue as Float; bar.invalidate() } }
            start()
        }
    }

    fun stopLoops() { loops.forEach { it.cancel() }; loops.clear() }

    override fun onAttachedToWindow() { super.onAttachedToWindow(); startLoops() }
    override fun onDetachedFromWindow() { stopLoops(); tile.animate().cancel(); super.onDetachedFromWindow() }

    /** Two soft pools of brand colour drifting slowly behind the logo. */
    private inner class GlowView : View(context) {
        var phase = 0.35f
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val strength = if (dark) 0x38 else 0x2C
        private var first: RadialGradient? = null
        private var second: RadialGradient? = null
        private var radius = 0f

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            radius = maxOf(w, h) * 0.62f
            first = RadialGradient(0f, 0f, radius, (strength shl 24) or 0x4F8F6D, 0x004F8F6D, Shader.TileMode.CLAMP)
            second = RadialGradient(0f, 0f, radius, (strength shl 24) or 0x7FB0A0, 0x007FB0A0, Shader.TileMode.CLAMP)
        }

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat(); val h = height.toFloat()
            blob(canvas, first, w * (0.18f + 0.30f * phase), h * (0.22f + 0.10f * phase))
            blob(canvas, second, w * (0.82f - 0.28f * phase), h * (0.78f - 0.12f * phase))
        }

        private fun blob(canvas: Canvas, shader: RadialGradient?, x: Float, y: Float) {
            paint.shader = shader ?: return
            canvas.save(); canvas.translate(x, y); canvas.drawCircle(0f, 0f, radius, paint); canvas.restore()
        }
    }

    /** A capsule track with a pill that stretches as it travels. Stays centred when animations are off. */
    private inner class FluidBar : View(context) {
        var phase = 0.5f
        private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = (accent and 0x00FFFFFF) or 0x22000000 }
        private val pill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent }
        private val rect = RectF()

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat(); val h = height.toFloat(); val r = h / 2
            rect.set(0f, 0f, w, h); canvas.drawRoundRect(rect, r, r, track)
            // Leading edge runs ahead of the trailing edge, so the pill stretches and catches up.
            val head = ((phase * 1.45f).coerceAtMost(1f)) * w
            val tail = (((phase - 0.3f) / 0.7f).coerceIn(0f, 1f)) * w
            rect.set(tail, 0f, maxOf(head, tail + h), h); canvas.drawRoundRect(rect, r, r, pill)
        }
    }
}
