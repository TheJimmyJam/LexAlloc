import { useEffect, useState, useRef } from 'react'
import { X, ArrowRight } from 'lucide-react'

/**
 * SpotlightOverlay
 *
 * Usage:
 *   const btnRef = useRef(null)
 *   <SpotlightOverlay
 *     targetRef={btnRef}
 *     title="Run your first apportionment"
 *     body="Click here to automatically calculate how much each insurer owes."
 *     step={1} total={2}
 *     onNext={handleNext}
 *     onDismiss={handleDismiss}
 *   />
 *
 * The target element should have position:relative or be naturally in flow.
 * The overlay positions itself around the bounding rect of the target.
 */
export default function SpotlightOverlay({
  targetRef,
  title,
  body,
  step,
  total,
  nextLabel = 'Next',
  onNext,
  onDismiss,
  placement = 'bottom', // 'bottom' | 'top' | 'right' | 'left'
}) {
  const [rect, setRect] = useState(null)
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const PAD = 8 // spotlight padding around target

  useEffect(() => {
    function measure() {
      if (!targetRef?.current) return
      const r = targetRef.current.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      setWinSize({ w: window.innerWidth, h: window.innerHeight })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [targetRef])

  if (!rect) return null

  const sTop  = rect.top    - PAD
  const sLeft = rect.left   - PAD
  const sW    = rect.width  + PAD * 2
  const sH    = rect.height + PAD * 2

  // Tooltip position
  const TOOLTIP_W = 288
  let tooltipStyle = {}
  if (placement === 'bottom') {
    tooltipStyle = {
      top:  sTop + sH + 12,
      left: Math.min(Math.max(sLeft, 12), winSize.w - TOOLTIP_W - 12),
    }
  } else if (placement === 'top') {
    tooltipStyle = {
      bottom: winSize.h - sTop + 12,
      left:   Math.min(Math.max(sLeft, 12), winSize.w - TOOLTIP_W - 12),
    }
  } else if (placement === 'right') {
    tooltipStyle = {
      top:  Math.max(sTop, 12),
      left: sLeft + sW + 12,
    }
  } else {
    tooltipStyle = {
      top:  Math.max(sTop, 12),
      right: winSize.w - sLeft + 12,
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay quadrants */}
      {/* Top */}
      <div
        className="absolute bg-black/60 pointer-events-auto"
        style={{ top: 0, left: 0, right: 0, height: Math.max(sTop, 0) }}
        onClick={onDismiss}
      />
      {/* Bottom */}
      <div
        className="absolute bg-black/60 pointer-events-auto"
        style={{ top: sTop + sH, left: 0, right: 0, bottom: 0 }}
        onClick={onDismiss}
      />
      {/* Left */}
      <div
        className="absolute bg-black/60 pointer-events-auto"
        style={{ top: sTop, left: 0, width: Math.max(sLeft, 0), height: sH }}
        onClick={onDismiss}
      />
      {/* Right */}
      <div
        className="absolute bg-black/60 pointer-events-auto"
        style={{ top: sTop, left: sLeft + sW, right: 0, height: sH }}
        onClick={onDismiss}
      />

      {/* Highlight ring around target */}
      <div
        className="absolute rounded-xl ring-2 ring-brand-400 ring-offset-2 ring-offset-transparent"
        style={{ top: sTop, left: sLeft, width: sW, height: sH }}
      />

      {/* Tooltip card */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-4 pointer-events-auto"
        style={{ width: TOOLTIP_W, ...tooltipStyle }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < step ? 'bg-brand-600 w-5' : 'bg-slate-200 w-2'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="font-semibold text-slate-900 text-sm mb-1">{title}</p>
        <p className="text-xs text-slate-600 leading-relaxed mb-4">{body}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip tour
          </button>
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {nextLabel}
            {onNext && <ArrowRight className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  )
}
