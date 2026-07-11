'use client'
import { useEffect, useRef, useState } from 'react'

// C major pentatonic C3–A4, index 0=lowest (C3), index 9=highest (A4)
const PENTA_HZ = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0]
const NOTE_COLORS = [
  '#a78bfa', '#818cf8', '#38bdf8', '#22d3ee',
  '#34d399', '#86efac', '#fde68a', '#fbbf24',
  '#fb923c', '#f472b6',
]

const MIN_DIST = 16
const MAX_DOTS = 32
const NOTE_DUR_MS = 190
const FADE_MS = 7000

interface Dot {
  x: number
  y: number
  color: string
  noteIdx: number
  lit: number
}

interface MirrorPath {
  dots: Dot[]
  state: 'drawing' | 'playing' | 'fading'
  fadeStart: number
}

function playNote(actx: AudioContext, hz: number): void {
  const t = actx.currentTime
  const osc = actx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = hz
  const osc2 = actx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = hz * 2
  const g = actx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.46, t + 0.06)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
  const g2 = actx.createGain()
  g2.gain.value = 0.2
  osc2.connect(g2)
  g2.connect(g)
  osc.connect(g)
  g.connect(actx.destination)
  osc.start(t)
  osc2.start(t)
  osc.stop(t + 0.6)
  osc2.stop(t + 0.6)
}

function startPad(actx: AudioContext): void {
  ;[130.81, 164.81, 196.0].forEach(hz => {
    const osc = actx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz
    const g = actx.createGain()
    g.gain.value = 0.022
    osc.connect(g)
    g.connect(actx.destination)
    osc.start()
  })
}

export default function KidsMirrorDraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef = useRef<AudioContext | null>(null)
  const pathsRef = useRef<MirrorPath[]>([])
  const activeRef = useRef<MirrorPath | null>(null)
  const rafRef = useRef<number>(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!started) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const actx = new AudioContext()
    actxRef.current = actx
    startPad(actx)
    let cancelled = false

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // y=0 (top) → highest note (idx 9); y=H (bottom) → lowest note (idx 0)
    function noteForY(y: number, H: number): number {
      return Math.min(9, Math.max(0, Math.round((1 - y / H) * 9)))
    }

    function onDown(e: PointerEvent) {
      if (!canvas) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      if (actxRef.current?.state === 'suspended') actxRef.current.resume()
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top) * (canvas.height / rect.height)
      const ni = noteForY(py, canvas.height)
      const path: MirrorPath = {
        dots: [{ x: px, y: py, color: NOTE_COLORS[ni], noteIdx: ni, lit: 0 }],
        state: 'drawing',
        fadeStart: 0,
      }
      activeRef.current = path
      pathsRef.current.push(path)
    }

    function onMove(e: PointerEvent) {
      if (!canvas) return
      e.preventDefault()
      const path = activeRef.current
      if (!path || path.state !== 'drawing') return
      if (path.dots.length >= MAX_DOTS) return
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top) * (canvas.height / rect.height)
      const last = path.dots[path.dots.length - 1]
      if (Math.hypot(px - last.x, py - last.y) >= MIN_DIST) {
        const ni = noteForY(py, canvas.height)
        path.dots.push({ x: px, y: py, color: NOTE_COLORS[ni], noteIdx: ni, lit: 0 })
      }
    }

    function onUp(e: PointerEvent) {
      e.preventDefault()
      const path = activeRef.current
      activeRef.current = null
      if (!path) return
      if (path.dots.length < 2) {
        path.state = 'fading'
        path.fadeStart = performance.now()
        return
      }
      path.state = 'playing'
      path.dots.forEach((dot, i) => {
        setTimeout(() => {
          if (cancelled) return
          playNote(actx, PENTA_HZ[dot.noteIdx])
          dot.lit = 1
          if (i === path.dots.length - 1) {
            setTimeout(() => {
              path.state = 'fading'
              path.fadeStart = performance.now()
            }, 700)
          }
        }, i * NOTE_DUR_MS)
      })
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    function draw() {
      if (!canvas || !ctx) return
      const W = canvas.width
      const H = canvas.height
      const now = performance.now()

      ctx.fillStyle = '#060a12'
      ctx.fillRect(0, 0, W, H)

      // Static stars (deterministic golden-angle spiral)
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      for (let s = 0; s < 52; s++) {
        const sx = (s * 137.508) % W
        const sy = (s * 89.31) % H
        ctx.beginPath()
        ctx.arc(sx, sy, 0.5 + (s % 3) * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }

      // Pitch-gradient edge strips: bottom=violet, top=pink on each side
      const vGrad = ctx.createLinearGradient(0, H, 0, 0)
      NOTE_COLORS.forEach((c, i) => vGrad.addColorStop(i / 9, c + '1a'))
      ctx.fillStyle = vGrad
      ctx.fillRect(0, 0, 5, H)
      ctx.fillRect(W - 5, 0, 5, H)

      // Symmetry axis
      ctx.save()
      ctx.shadowBlur = 16
      ctx.shadowColor = 'rgba(255,255,255,0.05)'
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 7])
      ctx.beginPath()
      ctx.moveTo(W / 2, 0)
      ctx.lineTo(W / 2, H)
      ctx.stroke()
      ctx.restore()

      // Remove fully faded paths
      pathsRef.current = pathsRef.current.filter(p => {
        if (p.state !== 'fading') return true
        return now - p.fadeStart < FADE_MS
      })

      for (const path of pathsRef.current) {
        const fading = path.state === 'fading'
        const alpha = fading ? Math.max(0, 1 - (now - path.fadeStart) / FADE_MS) : 1

        // Connecting lines — original and mirror
        if (path.dots.length > 1) {
          ctx.save()
          ctx.globalAlpha = alpha * 0.18
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.lineWidth = 1.5
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(path.dots[0].x, path.dots[0].y)
          for (let i = 1; i < path.dots.length; i++) {
            ctx.lineTo(path.dots[i].x, path.dots[i].y)
          }
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(W - path.dots[0].x, path.dots[0].y)
          for (let i = 1; i < path.dots.length; i++) {
            ctx.lineTo(W - path.dots[i].x, path.dots[i].y)
          }
          ctx.stroke()
          ctx.restore()
        }

        // Dots — original and mirror
        for (const dot of path.dots) {
          if (dot.lit > 0) dot.lit = Math.max(0, dot.lit - 0.045)
          const r = 5.5 + dot.lit * 13
          ctx.save()
          ctx.globalAlpha = alpha * (0.55 + dot.lit * 0.45)
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = dot.color
          ctx.shadowColor = dot.color
          ctx.shadowBlur = r * 2.5
          ctx.beginPath()
          ctx.arc(dot.x, dot.y, r * 0.52, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(W - dot.x, dot.y, r * 0.52, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', resize)
      actx.close()
    }
  }, [started])

  if (!started) {
    return (
      <main className="fixed inset-0 bg-[#060a12] flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-6xl">🦋</div>
        <h1 className="text-3xl font-bold text-foreground text-center">Mirror Draw</h1>
        <p className="text-muted-foreground text-base text-center max-w-xs leading-relaxed">
          Draw a line — it mirrors on the other side!
          <br />Lift your finger to hear it play.
        </p>
        <button
          onPointerDown={() => setStarted(true)}
          className="bg-violet-500 text-foreground text-xl font-bold rounded-2xl px-10 py-4 min-h-[60px] min-w-[220px] active:scale-95 transition-transform"
        >
          Let&apos;s draw! 🦋
        </button>
        <p className="text-muted-foreground text-sm text-center">
          Top of screen = high notes &nbsp;·&nbsp; Bottom = low notes
        </p>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#060a12]">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
      <p className="absolute bottom-6 left-0 right-0 text-center text-muted-foreground/70 text-xs pointer-events-none select-none">
        Draw ✦ it mirrors ✦ lift to play
      </p>
    </main>
  )
}
