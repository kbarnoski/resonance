'use client'
import { useEffect, useRef, useState } from 'react'

// C major pentatonic, 2 octaves (C3–A4)
const PENTA_HZ = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0]
const NOTE_COLORS = [
  '#a78bfa', '#818cf8', '#38bdf8', '#22d3ee',
  '#34d399', '#86efac', '#fde68a', '#fbbf24',
  '#fb923c', '#f472b6',
]

const MIN_DIST = 14       // px between sampled dots
const MAX_DOTS = 32       // max notes per path
const NOTE_DUR_MS = 190   // ms between notes on playback
const FADE_MS = 6000      // ms to fade out after playback

interface Dot {
  x: number
  y: number
  color: string
  noteIdx: number
  lit: number   // 0→1, bright flash when note plays
}

interface SongPath {
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
  osc2.connect(g2); g2.connect(g)
  osc.connect(g); g.connect(actx.destination)
  osc.start(t); osc2.start(t)
  osc.stop(t + 0.6); osc2.stop(t + 0.6)
}

function startPad(actx: AudioContext): void {
  ;[130.81, 164.81, 196.0].forEach(hz => {
    const osc = actx.createOscillator()
    osc.type = 'triangle'; osc.frequency.value = hz
    const g = actx.createGain(); g.gain.value = 0.022
    osc.connect(g); g.connect(actx.destination); osc.start()
  })
}

export default function KidsPaintSong() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef = useRef<AudioContext | null>(null)
  const pathsRef = useRef<SongPath[]>([])
  const activeRef = useRef<SongPath | null>(null)
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

    function noteIdx(x: number, W: number): number {
      return Math.min(
        PENTA_HZ.length - 1,
        Math.max(0, Math.floor((x / W) * PENTA_HZ.length))
      )
    }

    function onDown(e: PointerEvent) {
      if (!canvas) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      if (actxRef.current?.state === 'suspended') actxRef.current.resume()
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top) * (canvas.height / rect.height)
      const ni = noteIdx(px, canvas.width)
      const path: SongPath = {
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
        const ni = noteIdx(px, canvas.width)
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

      // Static stars
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      for (let s = 0; s < 52; s++) {
        const sx = (s * 137.508) % W
        const sy = (s * 89.31) % H
        ctx.beginPath()
        ctx.arc(sx, sy, 0.5 + (s % 3) * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }

      // Subtle pitch-gradient strip at bottom: left=low(violet), right=high(orange)
      const grad = ctx.createLinearGradient(0, 0, W, 0)
      NOTE_COLORS.forEach((c, i) =>
        grad.addColorStop(i / (NOTE_COLORS.length - 1), c + '55')
      )
      ctx.fillStyle = grad
      ctx.fillRect(0, H - 5, W, 5)

      // Remove fully faded paths
      pathsRef.current = pathsRef.current.filter(p => {
        if (p.state !== 'fading') return true
        return now - p.fadeStart < FADE_MS
      })

      // Draw paths
      for (const path of pathsRef.current) {
        const fading = path.state === 'fading'
        const alpha = fading ? Math.max(0, 1 - (now - path.fadeStart) / FADE_MS) : 1

        // Connecting line at low opacity
        if (path.dots.length > 1) {
          ctx.save()
          ctx.globalAlpha = alpha * 0.22
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'
          ctx.lineWidth = 1.5
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(path.dots[0].x, path.dots[0].y)
          for (let i = 1; i < path.dots.length; i++) {
            ctx.lineTo(path.dots[i].x, path.dots[i].y)
          }
          ctx.stroke()
          ctx.restore()
        }

        // Dots
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
        <div className="text-6xl">✨</div>
        <h1 className="text-3xl font-bold text-white text-center">Paint a Song</h1>
        <p className="text-white/75 text-base text-center max-w-xs leading-relaxed">
          Draw a line with your finger — lift up to hear your melody play!
        </p>
        <button
          onPointerDown={() => setStarted(true)}
          className="bg-violet-500 text-white text-xl font-bold rounded-2xl px-10 py-4 min-h-[60px] min-w-[220px] active:scale-95 transition-transform"
        >
          Let&apos;s draw! 🎵
        </button>
        <p className="text-white/55 text-sm text-center">Left side = low notes &nbsp;·&nbsp; Right side = high notes</p>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#060a12]">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
      <p className="absolute bottom-6 left-0 right-0 text-center text-white/40 text-xs pointer-events-none select-none">
        Draw a line ✦ lift to hear your song
      </p>
    </main>
  )
}
