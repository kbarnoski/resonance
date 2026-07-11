'use client'

import { useEffect, useRef, useState } from 'react'

// ── helpers (no 'use' prefix) ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function midiToHz(midi: number) { return 440 * Math.pow(2, (midi - 69) / 12) }

// valence 0..1 → chord semitone offsets from root
function chordOffsets(valence: number): number[] {
  if (valence > 0.68) return [0, 4, 7, 12]  // major
  if (valence > 0.33) return [0, 3, 7, 12]  // minor
  return [0, 3, 6, 12]                        // diminished
}

// Bilinear blend of 4 quadrant background colors (dark theme)
function bgRgb(v: number, a: number): string {
  const cs = [10, 22, 70]   // calm·sad    → deep indigo
  const ch = [10, 45, 28]   // calm·happy  → dark emerald
  const es = [72, 14, 44]   // exc·sad     → dark rose
  const eh = [118, 58, 10]  // exc·happy   → dark amber
  const r = lerp(lerp(cs[0], ch[0], v), lerp(es[0], eh[0], v), a)
  const g = lerp(lerp(cs[1], ch[1], v), lerp(es[1], eh[1], v), a)
  const b = lerp(lerp(cs[2], ch[2], v), lerp(es[2], eh[2], v), a)
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

// Accent color per quadrant (fully typeable as rgba)
function accentRgba(v: number, a: number, alpha: number): string {
  if (v > 0.5 && a > 0.5) return `rgba(251,191,36,${alpha})`   // amber
  if (v < 0.5 && a > 0.5) return `rgba(248,113,113,${alpha})`  // rose
  if (v > 0.5 && a < 0.5) return `rgba(52,211,153,${alpha})`   // emerald
  return `rgba(129,140,248,${alpha})`                            // indigo
}

function qlabel(v: number, a: number): string {
  return `${a > 0.5 ? 'energetic' : 'calm'} · ${v > 0.5 ? 'happy' : 'sad'}`
}

// ── component ──────────────────────────────────────────────────────────────

export default function MoodXY() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!started) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // ── Audio graph ──────────────────────────────────────────────────────
    const actx = new AudioContext()
    const master = actx.createGain()
    master.gain.value = 0.5

    const filt = actx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.Q.value = 0.8
    filt.frequency.value = 500

    master.connect(filt)
    filt.connect(actx.destination)

    // ── Position & trail ─────────────────────────────────────────────────
    const pos = { v: 0.5, a: 0.5 }
    const trail: { cx: number; cy: number; v: number; a: number; ms: number }[] = []

    // ── Beat scheduler ───────────────────────────────────────────────────
    let nextBeat = actx.currentTime + 0.08
    let beatIdx = 0

    const fireBeat = () => {
      const { v, a } = pos
      const bpm    = lerp(40, 140, a)
      const beatDur = 60 / bpm
      const noteDur = lerp(3.0, 0.24, a)
      const attack  = lerp(0.42, 0.01, a)
      const rootMidi = Math.round(lerp(36, 52, a))   // C2 → E3
      const peak     = lerp(0.20, 0.12, a)

      const offsets = chordOffsets(v)
      const semi    = offsets[beatIdx % offsets.length]
      const freq    = midiToHz(rootMidi + semi)

      const osc  = actx.createOscillator()
      const gain = actx.createGain()
      osc.connect(gain)
      gain.connect(master)
      osc.type = 'triangle'
      osc.frequency.value = freq

      const t = nextBeat
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(peak, t + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur)
      osc.start(t)
      osc.stop(t + noteDur + 0.05)

      beatIdx++
      nextBeat += beatDur
    }

    // ── Pointer handling ─────────────────────────────────────────────────
    let held = false
    let bcrX = 0, bcrY = 0, bcrW = 1, bcrH = 1

    const syncBcr = () => {
      const r = canvas.getBoundingClientRect()
      bcrX = r.left; bcrY = r.top; bcrW = r.width; bcrH = r.height
    }
    syncBcr()
    window.addEventListener('resize', syncBcr)

    const applyPos = (cx: number, cy: number) => {
      const v = Math.max(0, Math.min(1, (cx - bcrX) / bcrW))
      const a = Math.max(0, Math.min(1, 1 - (cy - bcrY) / bcrH))
      pos.v = v
      pos.a = a
      const px = v * canvas.width
      const py = (1 - a) * canvas.height
      trail.push({ cx: px, cy: py, v, a, ms: performance.now() })
      if (trail.length > 700) trail.shift()
    }

    const onDown = (e: PointerEvent) => {
      held = true
      canvas.setPointerCapture(e.pointerId)
      applyPos(e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => { if (held) applyPos(e.clientX, e.clientY) }
    const onUp   = () => { held = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup',   onUp)
    canvas.addEventListener('pointercancel', onUp)

    // ── Render loop ──────────────────────────────────────────────────────
    let raf = 0

    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick)
      const W = canvas.width, H = canvas.height
      const { v, a } = pos
      const now = actx.currentTime

      // Schedule beats with lookahead
      while (nextBeat < now + 0.12) fireBeat()

      // Smooth filter toward target
      const cutoff = Math.max(150, lerp(150, 4500, a * 0.60 + v * 0.40))
      filt.frequency.setTargetAtTime(cutoff, now, 0.05)

      // Background
      ctx.fillStyle = bgRgb(v, a)
      ctx.fillRect(0, 0, W, H)

      // Center grid lines
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = dpr
      ctx.beginPath()
      ctx.moveTo(W / 2, 0);  ctx.lineTo(W / 2, H)
      ctx.moveTo(0, H / 2);  ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.restore()

      // Axis corner labels
      const axisFs = Math.max(10, Math.round(11 * dpr))
      ctx.save()
      ctx.font = `${axisFs}px monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.textAlign = 'center'
      ctx.fillText('EXCITED ↑', W / 2, 14 * dpr)
      ctx.fillText('↓ CALM',    W / 2, H - 5 * dpr)
      ctx.textAlign = 'left'
      ctx.fillText('← SAD',    6 * dpr,     H / 2 + 4 * dpr)
      ctx.textAlign = 'right'
      ctx.fillText('HAPPY →',  W - 6 * dpr, H / 2 + 4 * dpr)
      ctx.restore()

      // Trail
      const now2 = ms
      for (let i = trail.length - 1; i >= 0; i--) {
        const pt  = trail[i]
        const age = now2 - pt.ms
        if (age > 9000) { trail.splice(0, i + 1); break }
        const frac = 1 - age / 9000
        const r    = Math.max(1.5 * dpr, 6 * dpr * frac)
        ctx.beginPath()
        ctx.arc(pt.cx, pt.cy, r, 0, Math.PI * 2)
        ctx.fillStyle = accentRgba(pt.v, pt.a, frac * 0.38)
        ctx.fill()
      }

      // Glowing dot
      const dotX = v * W
      const dotY = (1 - a) * H
      const dotC = accentRgba(v, a, 1)

      ctx.save()
      ctx.beginPath()
      ctx.arc(dotX, dotY, 13 * dpr, 0, Math.PI * 2)
      ctx.shadowBlur  = 22 * dpr
      ctx.shadowColor = dotC
      ctx.fillStyle   = dotC
      ctx.fill()
      ctx.restore()

      // Dot outline
      ctx.save()
      ctx.beginPath()
      ctx.arc(dotX, dotY, 13 * dpr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth   = 1.5 * dpr
      ctx.stroke()
      ctx.restore()

      // Quadrant label near dot
      const labelOffY = a > 0.5 ? 28 * dpr : -18 * dpr
      const lfs = Math.max(12, Math.round(13 * dpr))
      ctx.save()
      ctx.font      = `${lfs}px monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.textAlign = 'center'
      ctx.fillText(qlabel(v, a), dotX, dotY + labelOffY)
      ctx.restore()
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup',   onUp)
      canvas.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('resize', syncBcr)
      actx.close()
    }
  }, [started])

  // ── Start screen ─────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-foreground px-6 py-12">
        <div className="max-w-xs w-full text-center space-y-6">
          <div>
            <h1 className="text-3xl font-serif text-foreground">Mood XY</h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">Russell circumplex · valence × arousal</p>
          </div>
          <p className="text-muted-foreground text-base leading-relaxed">
            Drag a dot across a two-dimensional mood space. The music changes
            in real time — slow pads to fast arpeggios, major chords to diminished,
            deep indigo to warm amber.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono mx-auto w-fit">
            <div className="text-right text-violet-300/80">calm · sad</div>
            <div className="text-left text-violet-300/80">calm · happy</div>
            <div className="text-right text-violet-300/80">energetic · sad</div>
            <div className="text-left text-violet-300/80">energetic · happy</div>
          </div>
          <button
            onPointerDown={() => setStarted(true)}
            className="w-full py-3 px-6 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-base font-mono rounded-lg transition-colors min-h-[44px]"
          >
            Navigate mood →
          </button>
          <p className="text-muted-foreground/70 text-xs">Headphones recommended · zero permissions · zero API</p>
        </div>
      </div>
    )
  }

  // ── Active view ───────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-black/30">
        <div>
          <span className="text-foreground text-base font-serif">Mood XY</span>
          <span className="text-muted-foreground text-xs font-mono ml-3">
            drag · valence × arousal → live music
          </span>
        </div>
        <span className="text-muted-foreground/70 text-xs font-mono">139</span>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair touch-none"
        style={{ display: 'block' }}
      />
    </div>
  )
}
